import AppKit
import ApplicationServices
import Foundation

func attr(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
// Modal NSAlert windows are not always included in AXChildren. Query the
// application's window/focus attributes as well, with identity deduplication.
func children(_ element: AXUIElement) -> [AXUIElement] {
    var result = attr(element, "AXChildren") as? [AXUIElement] ?? []
    if attr(element, "AXRole") as? String == "AXApplication" {
        result += attr(element, "AXWindows") as? [AXUIElement] ?? []
        for name in ["AXFocusedWindow", "AXFocusedUIElement"] {
            if let value = attr(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() {
                result.append(value as! AXUIElement)
            }
        }
    }
    return result
}
func emit(_ value: Any) {
    let bytes = try! JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
    print(String(data: bytes, encoding: .utf8)!)
}
let args = CommandLine.arguments
if args.count == 2 && args[1] == "window-processes" {
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    emit(windows.compactMap { w -> [String: Any]? in
        guard let pid = w[kCGWindowOwnerPID as String] as? Int else { return nil }
        return ["pid": pid, "owner": w[kCGWindowOwnerName as String] as? String ?? "", "title": w[kCGWindowName as String] as? String ?? ""]
    })
} else if args.count == 2 && args[1] == "environment" {
    emit(["accessibilityTrusted": AXIsProcessTrusted(), "screenCaptureAllowed": CGPreflightScreenCaptureAccess(), "screens": NSScreen.screens.count])
} else if args.count == 3 && args[1] == "launch" {
    let url = URL(fileURLWithPath: args[2])
    let config = NSWorkspace.OpenConfiguration()
    config.activates = true
    NSWorkspace.shared.openApplication(at: url, configuration: config) { app, error in
        guard let app = app else { fputs("Launch failed: \(String(describing: error))\n", stderr); exit(1) }
        emit(["pid": app.processIdentifier, "bundle": app.bundleURL?.path ?? ""])
        exit(0)
    }
    RunLoop.main.run(until: Date().addingTimeInterval(30))
    exit(1)
} else if args.count == 3 && args[1] == "tree", let pid = Int32(args[2]) {
    guard AXIsProcessTrusted() else { fputs("Accessibility permission unavailable\n", stderr); exit(2) }
    var count = 0
    var visited: [AXUIElement] = []
    func walk(_ element: AXUIElement, _ depth: Int) -> [String: Any] {
        if visited.contains(where: { CFEqual($0, element) }) { return [:] }
        visited.append(element)
        count += 1
        var result: [String: Any] = [:]
        for name in ["AXRole", "AXTitle", "AXDescription", "AXValue", "AXIdentifier", "AXEnabled", "AXPlaceholderValue"] {
            if let value = attr(element, name), value is String || value is NSNumber { result[name] = value }
        }
        if depth < 18 && count < 2500 {
            result["children"] = children(element).prefix(250).map { walk($0, depth + 1) }
        }
        return result
    }
    emit(walk(AXUIElementCreateApplication(pid), 0))
} else if ((args.count == 5 && args[1] == "press") || (args.count == 6 && ["set-text", "press-at"].contains(args[1]))), let pid = Int32(args[2]) {
    guard AXIsProcessTrusted() else { exit(2) }
    var found: [AXUIElement] = []
    var count = 0
    var visited: [AXUIElement] = []
    func find(_ e: AXUIElement, _ depth: Int) {
        if visited.contains(where: { CFEqual($0, e) }) { return }
        visited.append(e)
        count += 1
        guard depth < 24 && count < 4000 else { return }
        let role = attr(e, "AXRole") as? String ?? ""
        let title = attr(e, "AXTitle") as? String ?? ""
        let description = attr(e, "AXDescription") as? String ?? ""
        let identifier = attr(e, "AXIdentifier") as? String ?? ""
        if role == args[3] && (title == args[4] || description == args[4] || identifier == args[4]) { found.append(e) }
        for c in children(e) { find(c, depth+1) }
    }
    find(AXUIElementCreateApplication(pid), 0)
    if args[1] == "press-at" {
        guard let index = Int(args[5]), index >= 0, index < found.count else { fputs("Control index unavailable\n", stderr); exit(1) }
        found = [found[index]]
    }
    guard found.count == 1 else { fputs("Expected one matching control; got \(found.count)\n", stderr); exit(1) }
    let result = args[1] == "set-text" ? AXUIElementSetAttributeValue(found[0], kAXValueAttribute as CFString, args[5] as CFString) : AXUIElementPerformAction(found[0], kAXPressAction as CFString)
    guard result == .success else { fputs("Accessibility action failed: \(result.rawValue)\n", stderr); exit(1) }
} else if args.count == 3 && args[1] == "fixture" {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 32, pixelsHigh: 32, bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 96, bitsPerPixel: 24)!
    for i in 0..<(32*32*3) { rep.bitmapData![i] = UInt8(i % 251) }
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
} else if args.count == 3 && args[1] == "decode" {
    guard let rep = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: args[2]))) else { exit(1) }
    emit(["width":rep.pixelsWide,"height":rep.pixelsHigh])
} else if args.count == 3 && args[1] == "quit", let pid = Int32(args[2]), let app = NSRunningApplication(processIdentifier: pid) {
    guard app.terminate() else { exit(1) }
} else {
    fputs("Usage: helper environment | launch app | tree pid | press pid role label | set-text pid role identifier text | fixture path | decode path | quit pid\n", stderr)
    exit(1)
}
