import { Colors } from '@/constants/theme';

/** The app has one dark palette; this stays a hook so screens read colours the same way everywhere. */
export function useTheme() {
  return Colors;
}
