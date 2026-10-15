/**
 * Battery Saver: how hard this phone works to keep the group's map current while it shares.
 * Pure, no I/O. The setting lives on the phone (lib/battery.ts); other riders never see it.
 *
 * Best Accuracy is the default and the safe choice: every rider's dot stays solid and close.
 * The other two send less often and let the GPS rest between fixes, at the cost of a dot that
 * trails the rider. Every mode still checks in well inside freshness LIVE_SEC, so a parked rider
 * on any mode shows as live to the group, never as No Signal (older app builds use the same 60 s
 * rule, so this needs no server change).
 */

export type BatteryMode = 'best' | 'balanced' | 'saver';

export const DEFAULT_BATTERY_MODE: BatteryMode = 'best';

export type BatteryPlan = {
  label: string;
  /** One line for the You tab and Ride Mode. */
  short: string;
  /** What the rider and their group notice, plainly. */
  detail: string;
  /** Send after moving this far... */
  sendEveryM: number;
  /** ...or once this long has passed, even parked. */
  heartbeatSec: number;
  /** GPS precision: 'high' uses the GPS chip throughout, 'balanced' accepts about 100 m. */
  accuracy: 'high' | 'balanced';
  /** How often Android takes a fix (iPhone and iPad deliver as the GPS reports). */
  fixEveryMs: number;
  /** Ride Mode's backup check for other riders, behind the live updates. */
  refreshSec: number;
  /** Ride Mode's own blue dot on the route moves after this many meters. */
  followEveryM: number;
};

export const BATTERY_PLANS: Record<BatteryMode, BatteryPlan> = {
  best: {
    label: 'Best Accuracy',
    short: 'Updates every 15 seconds',
    detail: 'Your dot updates about every 15 seconds or 25 m (80 ft). Best for following the leader and finding someone who stopped.',
    sendEveryM: 25,
    heartbeatSec: 15,
    accuracy: 'high',
    fixEveryMs: 5_000,
    refreshSec: 15,
    followEveryM: 20,
  },
  balanced: {
    label: 'Balanced',
    short: 'Updates every 30 seconds',
    detail: 'Your dot updates about every 30 seconds or 75 m (250 ft). Uses noticeably less battery on long days.',
    sendEveryM: 75,
    heartbeatSec: 30,
    accuracy: 'high',
    fixEveryMs: 10_000,
    refreshSec: 30,
    followEveryM: 50,
  },
  saver: {
    label: 'Max Battery Saver',
    short: 'Updates every 45 seconds, less precise',
    detail: 'Your dot updates about every 45 seconds or 200 m (650 ft) and can be off by up to about 100 m (330 ft). For multi-day trips with no way to charge.',
    sendEveryM: 200,
    heartbeatSec: 45,
    accuracy: 'balanced',
    fixEveryMs: 15_000,
    refreshSec: 45,
    followEveryM: 100,
  },
};

export const BATTERY_MODES = Object.keys(BATTERY_PLANS) as BatteryMode[];

export const isBatteryMode = (v: unknown): v is BatteryMode => typeof v === 'string' && (BATTERY_MODES as string[]).includes(v);

/** A stored value, or the default when it is missing or from some other version. */
export const parseBatteryMode = (v: unknown): BatteryMode => (isBatteryMode(v) ? v : DEFAULT_BATTERY_MODE);

/**
 * The warning shown before switching away from Best Accuracy, or null when no warning is needed
 * (going back to Best Accuracy, or picking the mode already on).
 */
export function batteryWarning(from: BatteryMode, to: BatteryMode): { title: string; message: string; confirm: string } | null {
  if (to === from || to === DEFAULT_BATTERY_MODE) return null;
  const p = BATTERY_PLANS[to];
  const lag = `${p.heartbeatSec} seconds`;
  const extra = p.accuracy === 'balanced' ? ' It can also place you up to about 100 m (330 ft) from where you are.' : '';
  return {
    title: `Switch to ${p.label}?`,
    message:
      `Your group will see you up to ${lag} behind where you really are, so you're harder to follow and harder to find if you stop or need help.${extra} ` +
      'Best Accuracy is recommended whenever you can charge your phone.',
    confirm: `Use ${p.label}`,
  };
}

/** For the Ride Mode sharing banner: empty on Best Accuracy so the usual banner is unchanged. */
export const batteryBannerTag = (mode: BatteryMode): string => (mode === DEFAULT_BATTERY_MODE ? '' : ` · ${BATTERY_PLANS[mode].label}`);
