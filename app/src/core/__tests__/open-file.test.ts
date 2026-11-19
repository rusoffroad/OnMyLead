import { describe, expect, it } from 'vitest';
import { fileImportPath } from '../open-file';

describe('fileImportPath', () => {
  it('sends a file to Map Mode with the link kept whole', () => {
    const ios = 'file:///private/var/mobile/Containers/Data/Application/X/Documents/Inbox/My%20Pins.gpx';
    expect(fileImportPath(ios)).toBe(`/nav?import=${encodeURIComponent(ios)}`);
    expect(fileImportPath('content://com.android.providers.downloads.documents/document/42')).toMatch(/^\/nav\?import=content%3A/);
  });

  it('leaves every other link alone', () => {
    for (const l of ['onmylead://r/ABC123', 'https://onmylead.com/g/xyz', '/ride/1/live', '']) expect(fileImportPath(l)).toBeNull();
  });
});
