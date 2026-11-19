/**
 * The words You > Radio Sharing shows for the paired radio: whether it's connected, its battery and
 * how busy the channel is, and what stops it carrying ride packets. Pure (unit tested in
 * core/__tests__/radio-status.test.ts), translated with tc.
 */
import { tc } from './i18n';

export type RadioStatusInput = {
  link: string;
  battery: number | null;
  channelUtil: number | null;
  problem: 'region' | 'ham' | 'tx_off' | null;
};

export type RadioStatus = {
  tone: 'good' | 'bad' | 'neutral';
  /** What to show under the radio's name, already translated. */
  detail: string;
  /** Why ride packets can't go over this radio, if they can't. */
  problem: string | null;
};

function link(state: string): { text: string; tone: RadioStatus['tone'] } {
  switch (state) {
    case 'ready': return { text: tc('Connected'), tone: 'good' };
    case 'connected':
    case 'connecting': return { text: tc('Connecting…'), tone: 'neutral' };
    case 'disconnected': return { text: tc('Not in range. It connects again when the radio is back in range.'), tone: 'neutral' };
    case 'off': return { text: tc('Bluetooth is off'), tone: 'bad' };
    case 'unauthorized': return { text: tc('Bluetooth isn’t allowed. Turn it on under You > Permissions.'), tone: 'bad' };
    case 'unsupported': return { text: tc('This device can’t use Bluetooth radios'), tone: 'bad' };
    case 'not_found': return { text: tc('Not found. Pair it again.'), tone: 'bad' };
    case 'not_meshtastic': return { text: tc('That device isn’t a Meshtastic radio'), tone: 'bad' };
    case 'pairing_failed': return { text: tc('Pairing failed. Check the PIN on your radio and try again.'), tone: 'bad' };
    default: return { text: tc('Not connected'), tone: 'neutral' };
  }
}

function problemText(p: 'region' | 'ham' | 'tx_off'): string {
  if (p === 'region') return tc('Set your radio’s region to United States in the Meshtastic app first.');
  if (p === 'ham') return tc('Your radio is in licensed (ham) mode, which doesn’t allow encrypted messages, so OnMyLead won’t send over it.');
  return tc('Your radio’s transmit is turned off in its LoRa settings.');
}

export function radioStatus(r: RadioStatusInput): RadioStatus {
  const l = link(r.link);
  const parts = [l.text];
  if (r.link === 'ready') {
    if (r.battery != null && r.battery > 100) parts.push(tc('Plugged in'));
    else if (r.battery != null && r.battery > 0) parts.push(tc('Battery {n}%', { n: r.battery }));
    if (r.channelUtil != null) parts.push(tc('Channel busy {n}%', { n: Math.round(r.channelUtil) }));
  }
  const problem = r.link === 'ready' && r.problem ? problemText(r.problem) : null;
  return { tone: problem ? 'bad' : l.tone, detail: parts.join(' · '), problem };
}
