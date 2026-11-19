import { describe, expect, it } from 'vitest';

// The config plugin is plain Node (plugins/with-open-files.js).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addSharedFileHandling } = require('../../../plugins/with-open-files.js') as { addSharedFileHandling: (src: string) => string };

const TEMPLATE = `package com.example
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }
  override fun getMainComponentName(): String = "main"
}
`;

describe('with-open-files MainActivity lines', () => {
  it('turns a shared file into a view before React Native reads the intent', () => {
    const out = addSharedFileHandling(TEMPLATE);
    expect(out.indexOf('sharedFileAsView(intent)')).toBeLessThan(out.indexOf('super.onCreate(null)'));
    expect(out).toContain('override fun onNewIntent(intent: android.content.Intent)');
    expect(out.trimEnd().endsWith('}')).toBe(true);
  });

  it('is safe to run twice and stops if the template changed', () => {
    const once = addSharedFileHandling(TEMPLATE);
    expect(addSharedFileHandling(once)).toBe(once);
    expect(() => addSharedFileHandling('class MainActivity {}')).toThrow(/template changed/);
  });
});
