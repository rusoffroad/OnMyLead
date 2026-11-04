// CarPlay screen for Ride Mode (native code: modules/onmylead-carplay).
//
// A CarPlay app needs an Apple-granted entitlement. Apple granted CarPlay Driving Task to the
// RUS Offroad LLC team on 2026-11-04, so app.json turns this on ("enabled": true) for the
// store build. A build signed by another team (a free Apple ID) can't carry the entitlement:
// set ONMYLEAD_CARPLAY=0 for that build to leave CarPlay out. ONMYLEAD_CARPLAY=1 still forces
// it on for a one-off build.
//
// The window scene keeps UIApplicationSupportsMultipleScenes false (with-scene-lifecycle): the
// CarPlay scene connects anyway, and true would let iPad open a second app window, which the
// app (one React Native root) doesn't support. If the CarPlay Simulator ever fails to show the
// app with false, that is the switch to look at.
//
// Keep this plugin listed BEFORE ./plugins/with-scene-lifecycle in app.json: Info.plist mods
// run in reverse order, so this runs after that plugin has written the scene manifest.
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const ENTITLEMENT = 'com.apple.developer.carplay-driving-task';
const CARPLAY_ROLE = 'CPTemplateApplicationSceneSessionRoleApplication';

module.exports = function withCarPlay(config, { enabled = false } = {}) {
  const flag = process.env.ONMYLEAD_CARPLAY;
  const on = flag === '0' ? false : enabled || flag === '1';

  config = withEntitlementsPlist(config, (c) => {
    if (on) c.modResults[ENTITLEMENT] = true;
    else delete c.modResults[ENTITLEMENT];
    return c;
  });

  return withInfoPlist(config, (c) => {
    const manifest = c.modResults.UIApplicationSceneManifest ?? { UISceneConfigurations: {} };
    manifest.UISceneConfigurations = manifest.UISceneConfigurations ?? {};
    if (on) {
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
