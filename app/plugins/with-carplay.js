// CarPlay screen for Ride Mode (native code: modules/onmylead-carplay).
//
// A CarPlay app needs an Apple-granted entitlement. Apple gives it only to paid developer
// accounts that request it (category: Driving Task), and a free Apple ID cannot sign an app
// that has it, so this stays off for the phone build until Apple grants it.
//
// Turn it on with "enabled": true on this plugin in app.json once Apple has granted the
// entitlement, or ONMYLEAD_CARPLAY=1 for a one-off build (the Xcode Simulator's CarPlay
// window works without Apple's grant).
//
// Keep this plugin listed BEFORE ./plugins/with-scene-lifecycle in app.json: Info.plist mods
// run in reverse order, so this runs after that plugin has written the scene manifest.
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const ENTITLEMENT = 'com.apple.developer.carplay-driving-task';
const CARPLAY_ROLE = 'CPTemplateApplicationSceneSessionRoleApplication';

module.exports = function withCarPlay(config, { enabled = false } = {}) {
  const on = enabled || process.env.ONMYLEAD_CARPLAY === '1';

  config = withEntitlementsPlist(config, (c) => {
    if (on) c.modResults[ENTITLEMENT] = true;
    else delete c.modResults[ENTITLEMENT];
    return c;
  });

  return withInfoPlist(config, (c) => {
    const manifest = c.modResults.UIApplicationSceneManifest ?? { UISceneConfigurations: {} };
    manifest.UISceneConfigurations = manifest.UISceneConfigurations ?? {};
    if (on) {
      manifest.UIApplicationSupportsMultipleScenes = true;
      manifest.UISceneConfigurations[CARPLAY_ROLE] = [
        {
          UISceneClassName: 'CPTemplateApplicationScene',
          UISceneConfigurationName: 'CarPlay',
          UISceneDelegateClassName: 'OMLCarPlaySceneDelegate',
        },
      ];
    } else {
      delete manifest.UISceneConfigurations[CARPLAY_ROLE];
    }
    c.modResults.UIApplicationSceneManifest = manifest;
    return c;
  });
};
