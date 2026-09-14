import AppKit
import ApplicationServices
import Foundation

func attr(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func emit(_ value: Any) {
    let bytes = try! JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
    print(String(data: bytes, encoding: .utf8)!)
}
let args = CommandLine.arguments
if args.count == 2 && args[1] == "environment" {
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
    func walk(_ element: AXUIElement, _ depth: Int) -> [String: Any] {
        count += 1
        var result: [String: Any] = [:]
        for name in ["AXRole", "AXTitle", "AXDescription", "AXValue", "AXIdentifier", "AXEnabled"] {
            if let value = attr(element, name), value is String || value is NSNumber { result[name] = value }
        }
        if depth < 18 && count < 2500, let children = attr(element, "AXChildren") as? [AXUIElement] {
            result["children"] = children.prefix(250).map { walk($0, depth + 1) }
        }
        return result
    }
    emit(walk(AXUIElementCreateApplication(pid), 0))
} else if args.count == 3 && args[1] == "quit", let pid = Int32(args[2]), let app = NSRunningApplication(processIdentifier: pid) {
    guard app.terminate() else { exit(1) }
} else {
    fputs("Usage: helper environment | launch app | tree pid | quit pid\n", stderr)
    exit(1)
}
