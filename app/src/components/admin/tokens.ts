import { useWindowDimensions } from 'react-native';

import { Colors, currentScheme, RideColors } from '@/constants/theme';

const light = () => currentScheme() === 'light';

/**
 * The dashboard follows the rider's theme (dark navy by default). The rail is a shade deeper so the page reads as the lit
 * surface; the logo red marks where you are and what will change something, blue marks Pro.
 */
export const AdminColors = {
  get rail() { return light() ? Colors.backgroundSelected : '#07101D'; },
  get railLine() { return light() ? Colors.border : '#14243C'; },
  get page() { return Colors.background; },
  get panel() { return Colors.backgroundElement; },
  get raised() { return Colors.backgroundSelected; },
  get line() { return light() ? Colors.border : '#1E3354'; },
  get text() { return Colors.text; },
  get dim() { return Colors.textSecondary; },
  get faint() { return light() ? '#6B7A90' : '#5F7190'; },
  get red() { return Colors.accent; },
  get blue() { return Colors.sky; },
  get green() { return RideColors.green; },
  get amber() { return RideColors.yellow; },
  get violet() { return RideColors.sweep; },
  get slate() { return RideColors.unknown; },
  get danger() { return RideColors.red; },
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
  get red() { return AdminColors.red; },
  get blue() { return AdminColors.blue; },
  get green() { return AdminColors.green; },
  get amber() { return AdminColors.amber; },
  get violet() { return AdminColors.violet; },
  get slate() { return AdminColors.slate; },
} as const;

export type LayoutSize = 'phone' | 'tablet' | 'desktop';

export function useLayoutSize(): LayoutSize {
  const { width } = useWindowDimensions();
  return width < 760 ? 'phone' : width < 1120 ? 'tablet' : 'desktop';
}

/** Numbers line up in columns. */
export const tabular = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };
