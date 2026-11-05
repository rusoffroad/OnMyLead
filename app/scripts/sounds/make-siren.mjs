// Writes assets/sounds/siren.wav, the Emergency Siren (core/siren.ts): a wailing siren that rises
// and falls every 3 seconds. Run from app/: node scripts/sounds/make-siren.mjs
//
// - 27 seconds: iPhone plays a push sound only if it is under 30 seconds.
// - Each 3 s cycle starts and ends at the same point of the wave, so the app can loop the file
//   with no click.
// - 22.05 kHz mono 16-bit PCM WAV, which iPhone, iPad, Android and browsers all play, both as a
//   notification sound and in the app.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const CYCLE_S = 3;
const CYCLES = 9;
const LOW = 700;
const HIGH = 1600;

const n = RATE * CYCLE_S * CYCLES;
const pcm = Buffer.alloc(n * 2);
const mid = (LOW + HIGH) / 2;
const swing = (HIGH - LOW) / 2;
let phase = 0;
for (let i = 0; i < n; i++) {
  const t = i / RATE;
  // Rises from LOW to HIGH and back once a cycle. Its average is `mid`, so a cycle holds a whole
  // number of waves (mid * CYCLE_S) and the loop point is seamless.
  const f = mid - swing * Math.cos((2 * Math.PI * t) / CYCLE_S);
  // A square-ish wave (odd harmonics) cuts through wind and engine noise better than a pure tone.
  const s = Math.sin(phase) + Math.sin(3 * phase) / 3 + Math.sin(5 * phase) / 5;
  phase += (2 * Math.PI * f) / RATE;
  // Soft-clipped to stay loud without harsh distortion.
  const v = Math.tanh(1.6 * s) * 0.92;
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const out = fileURLToPath(new URL('../../assets/sounds/siren.wav', import.meta.url));
writeFileSync(out, Buffer.concat([header, pcm]));
console.log(`wrote ${out} (${((44 + pcm.length) / 1024).toFixed(0)} KB, ${CYCLE_S * CYCLES} s)`);
