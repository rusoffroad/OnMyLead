import { useWindowDimensions } from 'react-native';

import { Colors, RideColors } from '@/constants/theme';

/**
 * The dashboard sits on the app's navy. The rail is a shade deeper so the page reads as the lit
 * surface; the logo red marks where you are and what will change something, blue marks Pro.
 */
export const AdminColors = {
  rail: '#07101D',
  railLine: '#14243C',
  page: Colors.background,
  panel: Colors.backgroundElement,
  raised: Colors.backgroundSelected,
  line: '#1E3354',
  text: Colors.text,
  dim: Colors.textSecondary,
  faint: '#5F7190',
  red: Colors.accent,
  blue: Colors.sky,
  green: RideColors.green,
  amber: RideColors.yellow,
  violet: RideColors.sweep,
  slate: RideColors.unknown,
  danger: RideColors.red,
} as const;

export type Tone = 'neutral' | 'pro' | 'trial' | 'free' | 'admin' | 'ok' | 'warn' | 'danger' | 'muted';

export function toneColor(tone: Tone = 'neutral'): string {
  switch (tone) {
    case 'pro': return AdminColors.blue;
    case 'trial': return AdminColors.amber;
    case 'free': return AdminColors.slate;
    case 'admin': return AdminColors.red;
    case 'ok': return AdminColors.green;
    case 'warn': return AdminColors.amber;
    case 'danger': return AdminColors.danger;
    case 'muted': return AdminColors.faint;
    default: return AdminColors.text;
  }
}

/** Chart colours that read on the navy, in the order series should use them. */
export const SeriesColors = {
  red: AdminColors.red,
  blue: AdminColors.blue,
  green: AdminColors.green,
  amber: AdminColors.amber,
  violet: AdminColors.violet,
  slate: AdminColors.slate,
} as const;

export type LayoutSize = 'phone' | 'tablet' | 'desktop';

export function useLayoutSize(): LayoutSize {
  const { width } = useWindowDimensions();
  return width < 760 ? 'phone' : width < 1120 ? 'tablet' : 'desktop';
}

/** Numbers line up in columns. */
export const tabular = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };
