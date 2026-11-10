#import <CarPlay/CarPlay.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

// Fixes the 2.1 crash "-[CPTemplateApplicationScene windows]: unrecognized selector" (Sentry
// REACT-NATIVE-6).
//
// With CarPlay on, UIApplication.connectedScenes holds the CarPlay scene next to the phone's
// window scene. CPTemplateApplicationScene is a UIScene but not a UIWindowScene, so it has no
// -windows. React Native's Appearance.setColorScheme (RCTAppearance.mm, called by
// src/lib/appearance.ts at launch and whenever the rider changes Dark/Light/Match Phone) loops
// over every connected scene as if it were a UIWindowScene and calls -windows on each one, and the
// app is killed. The dev menu's shake handler does the same. That code ships inside React Native
// (often as a prebuilt binary), so it can't be patched in source reliably.
//
// Instead, the CarPlay scene answers -windows with an empty list: a CarPlay template scene has no
// UIWindows of its own (Apple draws the templates), so "no windows" is the true answer, and the
// callers simply skip it. The method is only added if the class doesn't already have one, so a
// future iOS that implements it keeps Apple's version.
//
// +load runs when the app binary loads, before any scene connects or any JavaScript runs.

static NSArray<UIWindow *> *OMLNoWindows(__unused id self, __unused SEL _cmd)
{
  return @[];
}

/// Adds -windows (returning no windows) to `cls` if instances don't already respond to it.
/// Returns YES when the method was added.
static BOOL OMLAddEmptyWindowsMethod(Class cls)
{
  if (cls == Nil) return NO;
  SEL sel = @selector(windows);
  if ([cls instancesRespondToSelector:sel]) return NO;
  // Type encoding for "returns an object, takes self and _cmd".
  return class_addMethod(cls, sel, (IMP)OMLNoWindows, "@@:");
}

@interface OMLCarPlaySceneWindows : NSObject
@end

@implementation OMLCarPlaySceneWindows

+ (void)load
{
  if (@available(iOS 13.0, *)) {
    OMLAddEmptyWindowsMethod(NSClassFromString(@"CPTemplateApplicationScene"));
    // The CarPlay dashboard and instrument-cluster scenes are UIScenes without -windows too.
    // The app doesn't declare them today; covering them costs nothing if it ever does.
    OMLAddEmptyWindowsMethod(NSClassFromString(@"CPTemplateApplicationDashboardScene"));
    OMLAddEmptyWindowsMethod(NSClassFromString(@"CPTemplateApplicationInstrumentClusterScene"));
  }
}

@end
