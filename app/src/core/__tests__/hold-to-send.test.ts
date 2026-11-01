import { describe, expect, it } from 'vitest';

import { HOLD_TO_SEND_MS, holdHint, holdOutcome } from '../hold-to-send';

describe('hold to send', () => {
  it('holds for a second and a half by default', () => {
    expect(HOLD_TO_SEND_MS).toBe(1500);
  });

  it('tells the rider how to send, to keep holding, and why a quick tap did nothing', () => {
    expect(holdHint('idle')).toBe('Press and hold for 1.5 seconds to send.');
    expect(holdHint('holding')).toBe('Sends when the bar fills. Let go to stop.');
    expect(holdHint('too-short')).toBe('Not sent. Hold the button for 1.5 seconds until the bar fills.');
    expect(holdHint('idle', 2000)).toBe('Press and hold for 2 seconds to send.');
  });

  it('sends only once the full hold is reached', () => {
    expect(holdOutcome(0)).toBe('too-short');
    expect(holdOutcome(1499)).toBe('too-short');
    expect(holdOutcome(1500)).toBe('send');
    expect(holdOutcome(4000)).toBe('send');
  });
});
