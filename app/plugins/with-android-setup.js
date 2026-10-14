// Android build setup that can't live in app.json because it depends on files or keys that stay
// on Chris's Mac and never go in the repo (see docs/android-build.md):
//
// - Google Maps: the Android map (react-native-maps uses the Google Maps SDK there) needs an API
//   key. It comes from GOOGLE_MAPS_ANDROID_API_KEY in app/.env. Without it the maps are blank.
// - Firebase: Android push tokens come from Firebase Cloud Messaging, which needs
//   app/google-services.json from the Firebase console. Without it the app still builds and runs,
//   it just can't receive pushes. GOOGLE_SERVICES_JSON can point to the file somewhere else.
// - Release signing: when ONMYLEAD_UPLOAD_STORE_FILE (plus _STORE_PASSWORD, _KEY_ALIAS and
//   _KEY_PASSWORD) is set in ~/.gradle/gradle.properties, release builds are signed with that
//   upload key for Google Play. Otherwise they fall back to the debug key, as Expo's template does.
//
// None of this touches the iOS build.
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// onmylead: upload key signing';

function withAndroidSetup(config) {
  const android = (config.android ??= {});

  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  if (mapsKey) {
    android.config ??= {};
    android.config.googleMaps = { ...android.config.googleMaps, apiKey: mapsKey };
  }

  const root = config._internal?.projectRoot ?? process.cwd();
  const services = process.env.GOOGLE_SERVICES_JSON?.trim() || './google-services.json';
  if (!android.googleServicesFile && fs.existsSync(path.resolve(root, services))) {
    android.googleServicesFile = services;
  }

  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = addUploadSigning(c.modResults.contents);
    return c;
  });
}

/** Adds the optional upload-key signing config to android/app/build.gradle. Exported for tests. */
function addUploadSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  const types = gradle.indexOf('buildTypes {');
  const release = types < 0 ? -1 : gradle.indexOf('release {', types);
  const debugLine = release < 0 ? -1 : gradle.indexOf('signingConfig signingConfigs.debug', release);
  const configs = gradle.indexOf('signingConfigs {');
  if (debugLine < 0 || configs < 0 || configs > types) return gradle;

  const useUpload = "signingConfig findProperty('ONMYLEAD_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";
  gradle = gradle.slice(0, debugLine) + useUpload + gradle.slice(debugLine + 'signingConfig signingConfigs.debug'.length);

  const at = configs + 'signingConfigs {'.length;
  const block = `
        ${MARKER} (docs/android-build.md)
        release {
            if (findProperty('ONMYLEAD_UPLOAD_STORE_FILE')) {
                storeFile file(findProperty('ONMYLEAD_UPLOAD_STORE_FILE'))
                storePassword findProperty('ONMYLEAD_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('ONMYLEAD_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('ONMYLEAD_UPLOAD_KEY_PASSWORD')
            }
        }`;
  return gradle.slice(0, at) + block + gradle.slice(at);
}

module.exports = withAndroidSetup;
module.exports.addUploadSigning = addUploadSigning;
