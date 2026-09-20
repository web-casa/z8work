#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <stdbool.h>
#include <stdio.h>

// Tauri owns the delegate. Add only the currently absent optional protocol method;
// never replace its delegate or overwrite framework behavior on an SDK upgrade.
static void (*request_exit)(void);
static bool awaiting_reply;
static NSApplicationTerminateReply should_terminate(id self, SEL selector, NSApplication *sender) {
    (void)self; (void)selector; (void)sender;
    if (!awaiting_reply) {
        awaiting_reply = true;
        request_exit();
    }
    return NSTerminateLater;
}
bool z8_install_termination_guard(void (*callback)(void)) {
    if (![NSThread isMainThread] || !callback) return false;
    id delegate = [NSApp delegate];
    if (!delegate) return false;
    Class cls = object_getClass(delegate);
    SEL selector = @selector(applicationShouldTerminate:);
    if (class_getInstanceMethod(cls, selector)) return false;
    char encoding[32];
    snprintf(encoding, sizeof(encoding), "%s@:@", @encode(NSApplicationTerminateReply));
    if (!class_addMethod(cls, selector, (IMP)should_terminate, encoding)) return false;
    request_exit = callback;
    return true;
}
void z8_reply_to_termination(bool approved) {
    NSCAssert([NSThread isMainThread], @"Termination replies must use the main thread");
    if (awaiting_reply) {
        awaiting_reply = false;
        [NSApp replyToApplicationShouldTerminate:approved];
    }
}
