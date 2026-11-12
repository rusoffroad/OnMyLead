// CarPlay screen for Ride Mode and Map Mode (native code: modules/onmylead-carplay).
//
// A CarPlay app needs an Apple-granted entitlement. Apple granted CarPlay Driving Task to the
// RUS Offroad LLC team on 2026-11-04, so app.json turns this on ("enabled": true) for the
// store build. A build signed by another team (a free Apple ID) can't carry the entitlement:
// set ONMYLEAD_CARPLAY=0 for that build to leave CarPlay out. ONMYLEAD_CARPLAY=1 still forces
// it on for a one-off build.
//
// The car MAP needs a second entitlement, CarPlay Navigation (com.apple.developer.carplay-maps),
// requested from Apple on 2026-11-12. Apple's CarPlay addendum lets one app hold entitlements for
// more than one category, so the map is added next to Driving Task, not instead of it. It stays
// off ("maps": false) until Apple grants it and the App ID has the CarPlay Navigation capability;
// a build with the entitlement but no grant fails to sign. ONMYLEAD_CARPLAY_MAPS=1 forces it on for
// a one-off build (the Xcode CarPlay Simulator), ONMYLEAD_CARPLAY_MAPS=0 forces it off. When on it:
//   - adds the entitlement,
//   - sets OMLCarPlayMaps in Info.plist (CarMapScreen.available reads it), and
//   - leaves ios/.oml-carplay-maps, which tells the native module's podspec to compile the map and
//     pull in Mapbox (OML_CARPLAY_MAPS). Without it the map code isn't even compiled.
//
// The window scene keeps UIApplicationSupportsMultipleScenes false (with-scene-lifecycle): the
// CarPlay scene connects anyway, and true would let iPad open a second app window, which the
// app (one React Native root) doesn't support. If the CarPlay Simulator ever fails to show the
// app with false, that is the switch to look at.
//
// Keep this plugin listed BEFORE ./plugins/with-scene-lifecycle in app.json: Info.plist mods
// run in reverse order, so this runs after that plugin has written the scene manifest.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const ENTITLEMENT = 'com.apple.developer.carplay-driving-task';
const MAPS_ENTITLEMENT = 'com.apple.developer.carplay-maps';
const MAPS_KEY = 'OMLCarPlayMaps';
const MAPS_MARKER = '.oml-carplay-maps';
const CARPLAY_ROLE = 'CPTemplateApplicationSceneSessionRoleApplication';

/** Whether CarPlay and the car map are on for this build (exported for scripts/ci and tests). */
function carPlaySwitches({ enabled = false, maps = false } = {}, env = process.env) {
  const flag = env.ONMYLEAD_CARPLAY;
  const on = flag === '0' ? false : enabled || flag === '1';
  const mapsFlag = env.ONMYLEAD_CARPLAY_MAPS;
  const mapsOn = on && (mapsFlag === '0' ? false : maps || mapsFlag === '1');
  return { on, mapsOn };
}

function withCarPlay(config, options = {}) {
  const { on, mapsOn } = carPlaySwitches(options);

  config = withEntitlementsPlist(config, (c) => {
    if (on) c.modResults[ENTITLEMENT] = true;
    else delete c.modResults[ENTITLEMENT];
    if (mapsOn) c.modResults[MAPS_ENTITLEMENT] = true;
    else delete c.modResults[MAPS_ENTITLEMENT];
    return c;
  });

  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const marker = path.join(c.modRequest.platformProjectRoot, MAPS_MARKER);
      if (mapsOn) fs.writeFileSync(marker, 'CarPlay map on (plugins/with-carplay.js)\n');
      else if (fs.existsSync(marker)) fs.unlinkSync(marker);
      return c;
    },
  ]);

  return withInfoPlist(config, (c) => {
    if (mapsOn) c.modResults[MAPS_KEY] = true;
    else delete c.modResults[MAPS_KEY];
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
}

module.exports = withCarPlay;
module.exports.carPlaySwitches = carPlaySwitches;
