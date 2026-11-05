/** How big your own dot is drawn on every live map (Map Settings > Your Dot > Dot Size). */
export type DotSize = 'small' | 'medium' | 'large';

export const DOT_SIZES: readonly DotSize[] = ['small', 'medium', 'large'];

/** The dot's disc size in points. Medium is 1.5 times the 2.0 dot (22); the native puck images are drawn at Medium. */
export const DOT_D: Record<DotSize, number> = { small: 26, medium: 33, large: 42 };

export const DOT_SIZE_NAME: Record<DotSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

/** A saved value back to a size; anything unknown is Medium. */
export function parseDotSize(v: string | null | undefined): DotSize {
  return v === 'small' || v === 'large' ? v : 'medium';
}

/** How much the native puck (images drawn at Medium) is scaled for a size. */
export function dotScale(size: DotSize): number {
  return Math.round((DOT_D[size] / DOT_D.medium) * 1000) / 1000;
}
