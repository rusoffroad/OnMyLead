import makeQr from 'qrcode-generator';

/**
 * A QR code as rows of dark (true) and light (false) modules, with no quiet zone. Medium error
 * correction keeps a ride link small (about 33 by 33) and still scans off a dusty, scratched screen.
 */
export function qrModules(text: string): boolean[][] {
  const qr = makeQr(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/**
 * One SVG path for every dark module, one unit per module, with each horizontal run drawn as a
 * single rectangle so the path stays short. Offset by `margin` units for the quiet zone.
 */
export function qrPath(modules: boolean[][], margin = 0): string {
  const parts: string[] = [];
  modules.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c += 1;
      parts.push(`M${start + margin} ${r + margin}h${c - start}v1h${start - c}z`);
    }
  });
  return parts.join('');
}
