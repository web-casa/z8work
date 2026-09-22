"""Linux GUI-test helper: WM_DELETE_WINDOW and PID-scoped AT-SPI button clicks."""
import argparse
import ctypes as C


def close_window(window):
    # Send the same ICCCM request as a window manager. XDestroyWindow would
    # bypass the application's CloseRequested handler and invalidate the test.
    class Data(C.Union):
        _fields_ = [("b", C.c_char * 20), ("s", C.c_short * 10), ("l", C.c_long * 5)]

    class Message(C.Structure):
        _fields_ = [
            ("type", C.c_int), ("serial", C.c_ulong), ("send_event", C.c_int),
            ("display", C.c_void_p), ("window", C.c_ulong),
            ("message_type", C.c_ulong), ("format", C.c_int), ("data", Data),
        ]

    class Event(C.Union):
        _fields_ = [("message", Message), ("pad", C.c_long * 24)]

    x11 = C.CDLL("libX11.so.6")
    x11.XOpenDisplay.argtypes = [C.c_char_p]
    x11.XOpenDisplay.restype = C.c_void_p
    x11.XInternAtom.argtypes = [C.c_void_p, C.c_char_p, C.c_int]
    x11.XInternAtom.restype = C.c_ulong
    x11.XSendEvent.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_long, C.POINTER(Event)]
    x11.XCloseDisplay.argtypes = [C.c_void_p]
    display = x11.XOpenDisplay(None)
    if not display:
        raise RuntimeError("Cannot open test X display")
    try:
        event = Event()
        event.message.type = 33  # ClientMessage
        event.message.display = display
        event.message.window = window
        event.message.message_type = x11.XInternAtom(display, b"WM_PROTOCOLS", 0)
        event.message.format = 32
        event.message.data.l[0] = x11.XInternAtom(display, b"WM_DELETE_WINDOW", 0)
        if not x11.XSendEvent(display, window, False, 0, C.byref(event)):
            raise RuntimeError("WM_DELETE_WINDOW was not sent")
    finally:
        x11.XCloseDisplay(display)


def click_button(pid, label):
    import gi
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi

    def search(node, depth=0):
        if depth > 30:
            return False
        if node.get_role() == Atspi.Role.PUSH_BUTTON and node.get_name() == label:
            action = node.get_action_iface()
            if not action or not action.do_action(0):
                raise RuntimeError("Button did not accept click")
            return True
        return any(search(node.get_child_at_index(i), depth + 1)
                   for i in range(node.get_child_count()))

    desktop = Atspi.get_desktop(0)
    for i in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(i)
        if app.get_process_id() == pid and search(app):
            return
    raise RuntimeError(f"Button not found in test process {pid}: {label}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    close = sub.add_parser("close")
    close.add_argument("window", type=int)
    click = sub.add_parser("click")
    click.add_argument("pid", type=int)
    click.add_argument("label")
    args = parser.parse_args()
    if args.action == "close":
        close_window(args.window)
    else:
        click_button(args.pid, args.label)
