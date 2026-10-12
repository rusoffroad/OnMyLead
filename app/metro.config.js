// Adds Sentry debug IDs to the JS bundle so uploaded source maps match crash reports.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
