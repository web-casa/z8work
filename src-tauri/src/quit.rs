//! One exit request owns confirmation and cleanup, including OS/menu requests.
use std::sync::atomic::{AtomicU8, Ordering};
use tauri_plugin_dialog::MessageDialogResult;
use z8_native::preferences::Language;

const IDLE: u8 = 0;
const REQUESTED: u8 = 1;
const FINISHED: u8 = 2;

#[derive(Default)]
pub struct Gate(AtomicU8);
#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    Start,
    Wait,
    Allow,
}
impl Gate {
    pub fn accepts_dialog(&self) -> bool {
        self.0.load(Ordering::SeqCst) == IDLE
    }
    pub fn request(&self) -> Action {
        match self
            .0
            .compare_exchange(IDLE, REQUESTED, Ordering::SeqCst, Ordering::SeqCst)
        {
            Ok(_) => Action::Start,
            Err(FINISHED) => Action::Allow,
            Err(_) => Action::Wait,
        }
    }
    pub fn resume(&self) {
        let _ = self
            .0
            .compare_exchange(REQUESTED, IDLE, Ordering::SeqCst, Ordering::SeqCst);
    }
    pub fn finish(&self) {
        self.0.store(FINISHED, Ordering::SeqCst);
    }
}

#[derive(Clone, Copy)]
pub struct Copy {
    pub title: &'static str,
    pub body: &'static str,
    pub stop: &'static str,
    pub keep: &'static str,
}
pub fn copy(language: &Language, unknown: bool) -> Copy {
    match language {
        Language::ZhHans => Copy {
            title: "Z8.Work — 退出确认",
            body: if unknown {
                "无法确认队列状态。退出将尝试停止转换任务；已保存的文件会保留。确定退出吗？"
            } else {
                "还有转换任务正在运行或排队。退出将停止这些任务；原文件和已保存的结果会保留。重新打开后需重新选择文件和输出目录，再手动重试。"
            },
            stop: "停止并退出",
            keep: "留在应用",
        },
        Language::En => Copy {
            title: "Z8.Work — Confirm exit",
            body: if unknown {
                "The queue status is unavailable. Quitting will attempt to stop conversion tasks. Saved files will be kept. Quit anyway?"
            } else {
                "Conversions are running or queued. Quitting stops these tasks and keeps original files and saved results. After reopening, select the files and output folder again to retry manually."
            },
            stop: "Stop and quit",
            keep: "Stay in app",
        },
        // System language is resolved in the WebView. Native close must also
        // work before it loads or after a reload failure, without new IPC grants.
        Language::System => Copy {
            title: "Z8.Work — Confirm exit / 退出确认",
            body: if unknown {
                "Queue status unavailable. Quit and attempt to stop tasks? Saved files are kept.\n无法确认队列状态。退出将尝试停止任务，已保存文件会保留。"
            } else {
                "Quit and stop running/queued conversions? Original files and saved results are kept. Reopen and reselect files/folder to retry.\n退出将停止运行或排队的任务。原文件和已保存结果会保留；重新打开后需重新选择文件和目录，再手动重试。"
            },
            stop: "Quit / 退出",
            keep: "Stay / 留在应用",
        },
    }
}

pub fn confirmed(result: MessageDialogResult, copy: &Copy) -> bool {
    // Only the explicit affirmative response authorizes stopping. In
    // particular, Escape/window dismissal and unknown responses never do.
    matches!(result, MessageDialogResult::Ok)
        || matches!(result, MessageDialogResult::Custom(ref label) if label == copy.stop)
}

#[cfg(not(target_os = "linux"))]
pub fn show(app: &tauri::AppHandle, copy: Copy) -> Result<bool, String> {
    use tauri::Manager;
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let mut dialog = app
        .dialog()
        .message(copy.body)
        .title(copy.title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            copy.stop.into(),
            copy.keep.into(),
        ));
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.parent(&window);
    }
    Ok(confirmed(dialog.blocking_show_with_result(), &copy))
}

#[cfg(target_os = "linux")]
pub fn show(app: &tauri::AppHandle, copy: Copy) -> Result<bool, String> {
    use gtk::prelude::*;
    use tauri::Manager;
    let (send, receive) = std::sync::mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let parent = handle
            .get_webview_window("main")
            .ok_or_else(|| "Main window unavailable for exit confirmation".to_string())
            .and_then(|window| window.gtk_window().map_err(|e| e.to_string()));
        let parent = match parent {
            Ok(parent) => parent,
            Err(error) => {
                let _ = send.send(Err(error));
                return;
            }
        };
        let dialog = gtk::MessageDialog::builder()
            .transient_for(&parent)
            .modal(true)
            .destroy_with_parent(true)
            .title(copy.title)
            .text(copy.title)
            .secondary_text(copy.body)
            .message_type(gtk::MessageType::Warning)
            .build();
        dialog.add_button(copy.stop, gtk::ResponseType::Accept);
        let keep = dialog.add_button(copy.keep, gtk::ResponseType::Cancel);
        dialog.set_default_response(gtk::ResponseType::Cancel);
        keep.grab_focus();
        dialog.connect_response(move |dialog, response| {
            let result = if response == gtk::ResponseType::Accept {
                MessageDialogResult::Ok
            } else {
                MessageDialogResult::Cancel
            };
            let _ = send.send(Ok(confirmed(result, &copy)));
            // Destroy on the GTK thread after responding, without nesting a
            // main loop or recursively emitting another delete/response event.
            // SAFETY: this callback never uses the widget after destruction.
            unsafe {
                dialog.destroy();
            }
        });
        dialog.show_all();
    })
    .map_err(|e| e.to_string())?;
    receive
        .recv()
        .map_err(|_| "Exit confirmation closed without a response".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_close_and_menu_requests_wait_until_cleanup_finishes() {
        let gate = Gate::default();
        assert!(gate.accepts_dialog());
        assert_eq!(gate.request(), Action::Start);
        assert!(!gate.accepts_dialog());
        assert_eq!(gate.request(), Action::Wait);
        gate.finish();
        assert!(!gate.accepts_dialog());
        assert_eq!(gate.request(), Action::Allow);
        gate.resume();
        assert_eq!(gate.request(), Action::Allow);
    }
    #[test]
    fn dismissal_can_be_followed_by_a_new_exit_request() {
        let gate = Gate::default();
        assert_eq!(gate.request(), Action::Start);
        gate.resume();
        assert_eq!(gate.request(), Action::Start);
    }
    #[test]
    fn only_one_concurrent_request_owns_confirmation() {
        let gate = std::sync::Arc::new(Gate::default());
        let threads: Vec<_> = (0..20)
            .map(|_| {
                let gate = gate.clone();
                std::thread::spawn(move || gate.request())
            })
            .collect();
        assert_eq!(
            threads
                .into_iter()
                .map(|t| t.join().unwrap())
                .filter(|a| *a == Action::Start)
                .count(),
            1
        );
    }
    #[test]
    fn escape_dismissal_and_unrecognized_responses_keep_the_app_open() {
        for language in [Language::En, Language::ZhHans, Language::System] {
            for unknown in [false, true] {
                let text = copy(&language, unknown);
                for response in [
                    MessageDialogResult::Cancel,
                    MessageDialogResult::No,
                    MessageDialogResult::Yes,
                    MessageDialogResult::Custom(text.keep.into()),
                    MessageDialogResult::Custom("unknown".into()),
                ] {
                    assert!(!confirmed(response, &text));
                }
                assert!(confirmed(
                    MessageDialogResult::Custom(text.stop.into()),
                    &text
                ));
                assert!(confirmed(MessageDialogResult::Ok, &text));
            }
        }
    }
}
