// Crash reporting (Sentry). The native SDK is linked into every build and reports as soon as
// EXPO_PUBLIC_SENTRY_DSN is set; this plugin only adds the Xcode/Gradle steps that upload
// source maps and debug symbols, so crash reports show readable code lines.
//
// Those steps fail the build without a Sentry auth token, so they run only when
// SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are all set at prebuild. Never commit the token.
module.exports = function withSentryUploads(config) {
  const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) return config;
  const { withSentry } = require('@sentry/react-native/expo');
  return withSentry(config, { organization: SENTRY_ORG, project: SENTRY_PROJECT });
};
