import { Colors, RideColors } from '@/constants/theme';
import { RIDER_TRAIL_INK, type LocalTrail } from '@/core/nav-trails';

/** Where a trail stands: on this phone only, shared, hidden after ratings, or saved from a rider. */
export function shareBadge(t: LocalTrail): { label: string; color: string } {
  if (t.savedFrom) return { label: `Saved from ${t.savedFrom.mapper}`, color: RIDER_TRAIL_INK };
  if (!t.shared) return { label: 'On This Phone Only', color: Colors.textSecondary };
  if (t.shared.status === 'public') return { label: 'Shared with Everyone', color: RIDER_TRAIL_INK };
  if (t.shared.hiddenReason === 'admin') return { label: 'Removed from Public Map', color: RideColors.red };
  return { label: 'Hidden: Rated Inaccurate', color: RideColors.yellow };
}

