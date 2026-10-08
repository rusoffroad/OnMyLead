// Keeps the iOS push entitlement out of the build until the paid Apple Developer account is
// ready. expo-notifications adds aps-environment on its own, and a free Apple ID ("Personal
// Team") cannot sign an app that has it, so the phone build would stop installing.
//
// Turn push on for TestFlight and App Store builds by setting "enabled": true on this plugin
// in app.json (or ONMYLEAD_PUSH=1 for a one-off build). The in-app message pop-up works
// either way; only notifications while the app is closed need the entitlement.
//
// Keep this plugin listed BEFORE expo-notifications in app.json: entitlement mods run in
// reverse order, so listing it first makes it run after expo-notifications has added the key.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withPushEntitlement(config, { enabled = false } = {}) {
  const on = enabled || process.env.ONMYLEAD_PUSH === '1';
  return withEntitlementsPlist(config, (c) => {
    if (on) {
      if (!c.modResults['aps-environment']) c.modResults['aps-environment'] = 'production';
    } else {
      delete c.modResults['aps-environment'];
    }
    return c;
  });
};
