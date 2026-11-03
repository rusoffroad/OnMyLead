import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bytesToHex, FAMILY_LINK_TOKEN_BYTES } from '../sharing';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('no global crypto', () => {
  // Hermes (iPhone and Android) has no `crypto` global: a bare `crypto.getRandomValues` or
  // `crypto.randomUUID` crashes there (Share My Location, 2.0 build 8). Use expo-crypto instead.
  it('app code never calls the global crypto object', () => {
    const bare = /(^|[^.\w$])(globalThis\.|window\.|self\.)?crypto\s*\.\s*(getRandomValues|randomUUID|subtle)\b/;
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && bare.test(line))
        .map(({ i }) => `${file.slice(SRC.length + 1)}:${i + 1}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('bytesToHex', () => {
  it('pads every byte to two lowercase hex digits', () => {
    expect(bytesToHex([0, 1, 15, 16, 255])).toBe('00010f10ff');
    expect(bytesToHex(new Uint8Array([171, 205]))).toBe('abcd');
  });

  it('makes a 36-character family link token from 18 bytes', () => {
    const token = bytesToHex(new Uint8Array(FAMILY_LINK_TOKEN_BYTES).fill(7));
    expect(token).toHaveLength(36);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });
});
