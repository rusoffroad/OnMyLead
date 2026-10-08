import { describe, expect, it } from 'vitest';
import { cleanRideName, initialOf, MAX_RIDE_NAME, rideNameProblem, shownName } from '../profile';

describe('ride names', () => {
  it('tidies spaces', () => {
    expect(cleanRideName('  Dusty \n  Dave ')).toBe('Dusty Dave');
  });

  it('needs a name and keeps it short', () => {
    expect(rideNameProblem('   ')).toMatch(/Type the name/);
    expect(rideNameProblem('Dusty')).toBeNull();
    expect(rideNameProblem('x'.repeat(MAX_RIDE_NAME))).toBeNull();
    expect(rideNameProblem('x'.repeat(MAX_RIDE_NAME + 1))).toMatch(/24 characters/);
  });

  it('counts an emoji as one character', () => {
    expect(rideNameProblem('🏜️'.repeat(4) + 'x'.repeat(MAX_RIDE_NAME - 8))).toBeNull();
  });

  it('falls back to Rider when no name is set', () => {
    expect(shownName('')).toBe('Rider');
    expect(shownName(null)).toBe('Rider');
    expect(shownName(' Moab Mike ')).toBe('Moab Mike');
  });

  it('takes the first letter for pins', () => {
    expect(initialOf('dusty')).toBe('D');
    expect(initialOf('')).toBe('R');
    expect(initialOf('Élan')).toBe('É');
  });
});
