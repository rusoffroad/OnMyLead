// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*'] },
  {
    // On iOS, expo-router's Head pops an "Expo Head: Add the handoff origin" alert. Pages use
    // @/components/page-head, which is the real Head on the website and nothing in the apps.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/page-head.web.tsx', 'src/**/*.web.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'expo-router/head', message: "Use '@/components/page-head' (expo-router Head alerts on iOS)." }],
      }],
    },
  },
]);
