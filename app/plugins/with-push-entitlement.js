// Controls the iOS push entitlement (aps-environment). expo-notifications adds it on its own,
// and a free Apple ID ("Personal Team") cannot sign an app that has it, so with "enabled":
// false in app.json this plugin strips it again. Push is on ("enabled": true) since the app is
// signed with the paid team; set it back to false only for a free-team build. Local ride
// reminders and the in-app message pop-up work either way.
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
