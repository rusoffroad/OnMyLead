import { tc } from './i18n';

/**
 * Music Controls: play/pause, skip and volume for the music already playing on the phone, without
 * leaving OnMyLead. The native side (modules/onmylead-music) reports a raw state; this file turns
 * it into what the Music sheet shows. Pure, so it is unit tested.
 *
 * What each platform allows (docs/feature-parity.md, Exceptions):
 *   * Android phones and tablets: any app with a media session (Spotify, Apple Music, YouTube
 *     Music, Pandora, podcasts). The buttons work at once (media keys); song names need the rider to
 *     allow OnMyLead notification access, which is how Android shares what is playing.
 *   * iPhone and iPad: volume for anything. Play/pause/skip only for Apple Music (the system music
 *     player); Apple gives apps no way to control Spotify or other apps.
 *   * Website: none.
 * Nothing about what a rider listens to leaves the phone.
 */

export type MusicCommand = 'toggle' | 'next' | 'previous';

/** What the Music sheet asks for: Apple's media library (song names on iPhone) or Android's notification access. */
export type MusicAccess = 'ios_library' | 'android_listener';

export type MusicView = {
  /** controls: play/pause and skip work. volume_only: another iPhone app is playing. */
  mode: 'controls' | 'volume_only';
  /** Which app the buttons control, in Title Case ("Spotify", "Apple Music", "Your Music"). */
  source: string;
  title: string | null;
  artist: string | null;
  playing: boolean;
  /** 0 to 1, or null when the phone doesn't say (fixed-volume Android devices). */
  volume: number | null;
  /** Something the rider can allow to see song names, or null. */
  ask: MusicAccess | null;
  /** One line under the buttons, or null. */
  note: string | null;
};

/** Android package names of the common music apps, for when Android won't say an app's name. */
export const KNOWN_MUSIC_APPS: Record<string, string> = {
  'com.spotify.music': 'Spotify',
  'com.apple.android.music': 'Apple Music',
  'com.google.android.apps.youtube.music': 'YouTube Music',
  'com.google.android.youtube': 'YouTube',
  'com.pandora.android': 'Pandora',
  'com.amazon.mp3': 'Amazon Music',
  'com.aspiro.tidal': 'Tidal',
  'deezer.android.app': 'Deezer',
  'com.soundcloud.android': 'SoundCloud',
  'com.clearchannel.iheartradio.controller': 'iHeartRadio',
  'com.sirius': 'SiriusXM',
  'tunein.player': 'TuneIn Radio',
  'au.com.shiftyjelly.pocketcasts': 'Pocket Casts',
  'com.audible.application': 'Audible',
  'com.google.android.apps.podcasts': 'Google Podcasts',
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const bool = (v: unknown): boolean => v === true;
const unit = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;

/** The app's name: what Android said, else a known package, else null. */
export function musicAppName(pkg: unknown, label: unknown): string | null {
  const l = str(label);
  if (l) return l;
  const p = str(pkg);
  return p ? KNOWN_MUSIC_APPS[p] ?? null : null;
}

/** Reads the native module's answer for this platform. Anything malformed gives a safe "Your Music" view. */
export function musicView(raw: unknown, os: string): MusicView {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const volume = unit(o.volume);
  if (os === 'ios') {
    const applePlaying = bool(o.applePlaying);
    const otherAudio = bool(o.otherAudio) && !applePlaying;
    if (otherAudio) {
      return {
        mode: 'volume_only', source: 'Another App', title: null, artist: null, playing: true, volume, ask: null,
        note: tc('Apple lets OnMyLead change the volume of music from other apps, like Spotify, but not skip songs. Use your headset or helmet buttons to skip.'),
      };
    }
    const access = str(o.access);
    const title = str(o.title);
    return {
      mode: 'controls', source: 'Apple Music', title, artist: str(o.artist), playing: applePlaying, volume,
      ask: !title && access === 'ask' && bool(o.appleHasItem) ? 'ios_library' : null,
      note: applePlaying || bool(o.appleHasItem) ? null : tc('Nothing is playing. Play starts Apple Music.'),
    };
  }
  // Android. With notification access the phone says which app is playing and what; without it the
  // buttons still work, sent as the media keys a headset sends.
  const access = bool(o.access);
  const hasSession = bool(o.hasSession);
  const app = musicAppName(o.package, o.appName);
  const playing = bool(o.playing);
  return {
    mode: 'controls',
    source: access && hasSession ? app ?? 'Your Music' : 'Your Music',
    title: access ? str(o.title) : null,
    artist: access ? str(o.artist) : null,
    playing,
    volume,
    ask: access ? null : 'android_listener',
    note: playing || (access && hasSession) ? null : tc('Nothing is playing. Play resumes the app you last listened to.'),
  };
}

/** Volume steps the − and + buttons move: 16, like the phone's own buttons. */
export const VOLUME_STEPS = 16;

/** The volume one step up or down, snapped to a step and kept between 0 and 1. */
export function stepVolume(v: number | null, dir: 1 | -1): number {
  const now = Math.round((v ?? 0.5) * VOLUME_STEPS);
  return Math.min(VOLUME_STEPS, Math.max(0, now + dir)) / VOLUME_STEPS;
}

/** "62%" for the meter and screen readers. */
export function volumePercent(v: number | null): string | null {
  return v == null ? null : `${Math.round(v * 100)}%`;
}

/** What the Music button says to a screen reader. */
export function musicButtonLabel(view: MusicView | null): string {
  if (!view || !view.playing) return tc('Music Controls');
  const what = view.title ? `${view.title}${view.artist ? ` by ${view.artist}` : ''}` : view.source;
  return tc('Music Controls. Playing {what}', { what });
}

/** The two lines at the top of the sheet. */
export function nowPlaying(view: MusicView): { line1: string; line2: string } {
  if (view.title) return { line1: view.title, line2: [view.artist, view.source].filter(Boolean).join(', ') };
  if (view.mode === 'volume_only') return { line1: 'Playing in Another App', line2: 'Volume works here' };
  // The source already shows in the chip above, so say why there is no song name instead.
  return { line1: view.playing ? 'Playing' : 'Paused', line2: view.ask ? 'Song names are off' : view.source };
}
