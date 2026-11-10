import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the fix for the 2.1 crash "-[CPTemplateApplicationScene windows]: unrecognized selector"
// (Sentry REACT-NATIVE-6). The native code can't run here; these checks keep the shim in the build
// and keep our own native code from bringing the bug back.

const app = resolve(__dirname, '../../..');
const carplay = join(app, 'modules/onmylead-carplay/ios');
const shim = readFileSync(join(carplay, 'OMLCarPlaySceneWindows.m'), 'utf8');
const podspec = readFileSync(join(carplay, 'OnMyLeadCarPlay.podspec'), 'utf8');
const plugin = readFileSync(join(app, 'plugins/with-carplay.js'), 'utf8');

function nativeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'build' ? [] : nativeFiles(p);
    return /\.(swift|m|mm)$/.test(e.name) ? [p] : [];
  });
}

/** Obj-C `for (UIWindowScene *s in ...connectedScenes)` or a Swift force cast of connected scenes. */
function treatsEverySceneAsWindowScene(src: string): boolean {
  return (
    /for\s*\(\s*UIWindowScene\s*\*\s*\w+\s+in\s+[^;{]*connectedScenes/.test(src) ||
    /connectedScenes[\s\S]{0,200}?as!\s*UIWindowScene/.test(src)
  );
}

describe('CarPlay scene answers -windows', () => {
  it('the app declares a CarPlay template scene, which is the scene that crashed', () => {
    expect(plugin).toContain("UISceneClassName: 'CPTemplateApplicationScene'");
  });

  it('adds -windows to the CarPlay scene at load time, before any scene connects', () => {
    expect(shim).toMatch(/\+\s*\(void\)\s*load/);
    expect(shim).toContain('NSClassFromString(@"CPTemplateApplicationScene")');
    expect(shim).toContain('@selector(windows)');
    expect(shim).toContain('class_addMethod(');
    // Returns an empty list (a template scene has no UIWindows), never nil or a phone window.
    expect(shim).toMatch(/return @\[\];/);
  });

  it('never replaces a real -windows if iOS ever adds one', () => {
    expect(shim).toContain('instancesRespondToSelector:sel]) return NO');
    expect(shim).not.toMatch(/method_setImplementation|method_exchangeImplementations|class_replaceMethod/);
  });

  it('the shim is compiled into the CarPlay pod', () => {
    const files = podspec.match(/source_files\s*=\s*'([^']+)'/)?.[1] ?? '';
    expect(files).toMatch(/\{[^}]*\bm\b[^}]*\}/);
  });

  it('our own native code never treats every connected scene as a window scene', () => {
    const offenders: string[] = [];
    for (const f of nativeFiles(join(app, 'modules'))) {
      const src = readFileSync(f, 'utf8');
      if (treatsEverySceneAsWindowScene(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('the scan catches the React Native code that crashed (RCTAppearance setColorScheme)', () => {
    const rct = 'for (UIWindowScene *scene in RCTSharedApplication().connectedScenes) {\n  [windows addObjectsFromArray:scene.windows];\n}';
    expect(treatsEverySceneAsWindowScene(rct)).toBe(true);
    expect(treatsEverySceneAsWindowScene('let s = UIApplication.shared.connectedScenes.first as! UIWindowScene')).toBe(true);
    const safe = 'for (UIScene *scene in connectedScenes) { if (![scene isKindOfClass:[UIWindowScene class]]) continue; }';
    expect(treatsEverySceneAsWindowScene(safe)).toBe(false);
    expect(treatsEverySceneAsWindowScene('connectedScenes.compactMap { $0 as? UIWindowScene }')).toBe(false);
  });
});
