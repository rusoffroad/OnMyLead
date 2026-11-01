/**
 * Press-and-hold to send, used by the Emergency screen's Alert My Group button. Holding guards
 * against a pocket tap, and the button shows its progress so a rider knows to keep holding.
 */

/** How long a rider holds Alert My Group before the alert goes out. */
export const HOLD_TO_SEND_MS = 1500;

/** What the button says while idle, while held, and after a hold that was let go too early. */
export type HoldPhase = 'idle' | 'holding' | 'too-short';

/** The label under a hold-to-send button for each phase. */
export function holdHint(phase: HoldPhase, holdMs = HOLD_TO_SEND_MS): string {
  const secs = `${Math.round(holdMs / 100) / 10} seconds`;
  if (phase === 'holding') return 'Sends when the bar fills. Let go to stop.';
  if (phase === 'too-short') return `Not sent. Hold the button for ${secs} until the bar fills.`;
  return `Press and hold for ${secs} to send.`;
}

/** Whether a press that lasted `heldMs` counts as a hold (the timer fired) or was let go early. */
export function holdOutcome(heldMs: number, holdMs = HOLD_TO_SEND_MS): 'send' | 'too-short' {
  return heldMs >= holdMs ? 'send' : 'too-short';
}
