#import <AppKit/AppKit.h>
#include <assert.h>
#include "../../src-tauri/src/macos_termination.m"

static int requests, replies;
static BOOL last_reply;
@interface TestApplication : NSApplication
@end
@implementation TestApplication
- (void)replyToApplicationShouldTerminate:(BOOL)answer { replies++; last_reply = answer; }
@end
@interface TestDelegate : NSObject <NSApplicationDelegate>
@end
@implementation TestDelegate
@end
static void requested(void) { requests++; }
int main(void) {
    @autoreleasepool {
        [TestApplication sharedApplication];
        TestDelegate *delegate = [TestDelegate new];
        [NSApp setDelegate:delegate];
        assert(z8_install_termination_guard(requested));
        // Dock, logout and NSRunningApplication.terminate all reach this selector.
        id<NSApplicationDelegate> target = delegate;
        assert([target applicationShouldTerminate:NSApp] == NSTerminateLater);
        assert([target applicationShouldTerminate:NSApp] == NSTerminateLater);
        assert(requests == 1);
        z8_reply_to_termination(false);
        assert(replies == 1 && !last_reply);
        assert([target applicationShouldTerminate:NSApp] == NSTerminateLater);
        assert(requests == 2);
        z8_reply_to_termination(true);
        assert(replies == 2 && last_reply);
        z8_reply_to_termination(true);
        assert(replies == 2);
        assert(!z8_install_termination_guard(requested));
        puts("macOS termination: pending, duplicate, cancel, retry, approve and delegate compatibility passed");
    }
    return 0;
}
