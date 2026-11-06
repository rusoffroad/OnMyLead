import { describe, expect, it } from 'vitest';

import { DOT_D, DOT_SIZES, dotScale, parseDotSize } from '../dot-size';

describe('dot size', () => {
  it('defaults to Medium for anything unknown', () => {
    expect(parseDotSize(null)).toBe('medium');
    expect(parseDotSize('huge')).toBe('medium');
    expect(parseDotSize('small')).toBe('small');
    expect(parseDotSize('large')).toBe('large');
  });
  it('grows from Small to Large, Medium is 1.5x the 2.0 dot', () => {
    expect(DOT_SIZES.map((s) => DOT_D[s])).toEqual([...DOT_SIZES.map((s) => DOT_D[s])].sort((a, b) => a - b));
    expect(DOT_D.medium).toBe(33);
    expect(dotScale('medium')).toBe(1);
    expect(dotScale('large')).toBeGreaterThan(1);
    expect(dotScale('small')).toBeLessThan(1);
  });
});
