import { describe, expect, it } from 'vitest';
import { carPlayState, parseCarPlayAction } from '../carplay';
import { QUICK_REPLIES } from '../chat';

const base = { rideName: 'Moab Saturday', separated: [], watchesBubble: false, canRegroup: false, riders: [], helpCalls: [] };

describe('CarPlay screen', () => {
  it('fits Apple\'s 8-button grid and always has EMERGENCY', () => {
    for (const canRegroup of [true, false]) {
      const s = carPlayState({ ...base, canRegroup });
      expect(s.buttons.length).toBeLessThanOrEqual(8);
      expect(s.buttons.at(-1)!.id).toBe('emergency');
      expect(s.buttons.some((b) => b.id === 'regroup')).toBe(canRegroup);
    }
  });

  it('only sends quick replies the chat accepts', () => {
    const s = carPlayState(base);
    for (const b of s.buttons.filter((x) => x.id.startsWith('reply:'))) {
      expect(QUICK_REPLIES).toContain(b.id.slice(6));
    }
  });

  it('shows separation only to Leader and Sweep', () => {
    const separated = [{ riderId: 'b', message: 'Ben is 1.2 miles behind' }];
    expect(carPlayState({ ...base, separated }).alert).toBeNull();
    const s = carPlayState({ ...base, separated, watchesBubble: true });
    expect(s.title).toBe('Moab Saturday · 1 separated');
    expect(s.alert).toEqual({ id: 'sep:b', text: 'Ben is 1.2 miles behind' });
  });

  it('puts a help call ahead of separation', () => {
    const s = carPlayState({
      ...base, watchesBubble: true,
      separated: [{ riderId: 'b', message: 'Ben is 1.2 miles behind' }],
      helpCalls: [{ name: 'Cara', status: 'Flat tire' }],
    });
    expect(s.alert?.text).toBe('Cara: Flat tire');
  });

  it('turns button ids back into actions', () => {
    expect(parseCarPlayAction('status:need_fuel')).toEqual({ type: 'status', kind: 'need_fuel' });
    expect(parseCarPlayAction('reply:Running late')).toEqual({ type: 'reply', body: 'Running late' });
    expect(parseCarPlayAction('emergency_confirmed')).toEqual({ type: 'emergency' });
    // The bare EMERGENCY tap only opens the confirm alert on the car screen.
    expect(parseCarPlayAction('emergency')).toEqual({ type: 'none' });
  });
});
