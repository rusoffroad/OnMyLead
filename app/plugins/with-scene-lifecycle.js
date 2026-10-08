// Adopts the UIScene life cycle on iOS. iOS 27 terminates apps at launch that still use the
// old app-delegate-only life cycle (UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption),
// and the Expo SDK 57 prebuild template does not wire up Expo's scene delegate yet.
//
// Info.plist: declares one window scene handled by Expo's ExpoAppSceneDelegate (Obj-C name
// EXExpoAppSceneDelegate), which creates the window and starts React Native in it.
// AppDelegate.swift: conforms to ExpoReactNativeFactoryProvider so the scene delegate can reach
// the factory, and stops creating its own window at launch (the scene delegate does that now).
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE_CLASS = 'EXExpoAppSceneDelegate';
const CLASS_LINE = 'class AppDelegate: ExpoAppDelegate {';
const PROVIDER_CLASS_LINE = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';
// The template's "#if os(iOS) || os(tvOS) window = UIWindow(...) factory.startReactNative(...) #endif".
const START_BLOCK = /\n[ \t]*#if os\(iOS\) \|\| os\(tvOS\)\n[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n[\s\S]*?factory\.startReactNative\([\s\S]*?\)\n[ \t]*#endif\n/;

function withSceneManifest(config) {
  return withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
          },
        ],
      },
    };
    return c;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('with-scene-lifecycle: expected a Swift AppDelegate.');
    }
    let src = c.modResults.contents;
    if (!src.includes(PROVIDER_CLASS_LINE)) {
      if (!src.includes(CLASS_LINE)) {
        throw new Error(`with-scene-lifecycle: "${CLASS_LINE}" not found in AppDelegate.swift; the Expo template changed.`);
      }
      src = src.replace(CLASS_LINE, PROVIDER_CLASS_LINE);
    }
    if (src.includes('window = UIWindow(frame: UIScreen.main.bounds)')) {
      if (!START_BLOCK.test(src)) {
        throw new Error('with-scene-lifecycle: the window/startReactNative block in AppDelegate.swift did not match; the Expo template changed.');
      }
      src = src.replace(START_BLOCK, '');
    }
    c.modResults.contents = src;
    return c;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
