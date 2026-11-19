import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Icon, type IconName } from '@/components/icon';
import { Colors, currentScheme, font, Radius, themedStyles } from '@/constants/theme';
import { ACTIVITIES, activityFill, activityInk, type ActivityId } from '@/core/activities';
import { t } from '@/lib/i18n';
import { homeStyles } from './parts';

/** The picture for each activity (components/icon.tsx). */
export const ACTIVITY_ICON: Record<ActivityId, IconName> = {
  offroad: 'actOffroad',
  motorcycle: 'actMotorcycle',
  road_trip: 'actRoadTrip',
  snowmobile: 'actSnowmobile',
};

/** Offroad's chip wears today's red (BRAND accent in core/appearance.ts, whatever activity is painted); every other activity its own colour. */
function fillFor(id: ActivityId) {
  return activityFill(id, currentScheme()) ?? { fill: currentScheme() === 'dark' ? '#E5262E' : '#D61F27', on: '#FFFFFF' };
}

/**
 * The activity chip in Home's header (4.0, Chris 2026-11-19): filled in the activity's colour and
 * naming it, so a rider always knows which activity they're in. Tap to switch.
 */
export function ActivityChip({ activity, name, onPress }: { activity: ActivityId; name: string; onPress: () => void }) {
  const { fill, on } = fillFor(activity);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Activity: {name}. Switch activity', { name })}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: fill }, pressed && { opacity: 0.85 }]}>
      <Icon name={ACTIVITY_ICON[activity]} size={17} color={on} strokeWidth={2.2} />
      <Text style={[styles.chipText, { color: on }]} numberOfLines={1}>{name}</Text>
      <View style={{ transform: [{ rotate: '90deg' }] }}>
        <Icon name="chevron" size={11} color={on} strokeWidth={3} />
      </View>
    </Pressable>
  );
}

/** Switch Activity: every activity with its colour, the current one marked. */
export function ActivitySheet({
  visible, activity, onPick, onClose,
}: { visible: boolean; activity: ActivityId; onPick: (id: ActivityId) => void; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('Switch Activity')}>
      <Text style={homeStyles.muted}>{t('Rides, events and places change to match. Your friends and groups come with you.')}</Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {ACTIVITIES.map((a) => {
          const on = a.id === activity;
          const ink = activityInk(a.id, currentScheme(), Colors.accent);
          return (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${t(a.name)}. ${t(a.line)}`}
              onPress={() => onPick(a.id)}
              style={({ pressed }) => [styles.tile, on && { borderColor: ink, borderWidth: 2 }, pressed && { opacity: 0.85 }]}>
              <View style={[styles.badge, { backgroundColor: fillFor(a.id).fill }]}>
                <Icon name={ACTIVITY_ICON[a.id]} size={22} color={fillFor(a.id).on} strokeWidth={2.1} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{t(a.name)}</Text>
                <Text style={styles.line} numberOfLines={2}>{t(a.line)}</Text>
              </View>
              {on ? <Icon name="check" size={18} color={ink} strokeWidth={2.6} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.note}>
        <Icon name="warning" size={15} color={Colors.danger} strokeWidth={2.2} />
        <Text style={[homeStyles.muted, { flex: 1, fontSize: 13 }]}>{t('EMERGENCY reaches every OnMyLead rider nearby, whatever their activity.')}</Text>
      </View>
    </BottomSheet>
  );
}

const styles = themedStyles(() => ({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingLeft: 9, paddingRight: 10,
    borderRadius: Radius.pill, maxWidth: 150, flexShrink: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  chipText: { fontFamily: font(700), fontSize: 13, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1, flexBasis: 240, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.control, borderWidth: 1.5, borderColor: Colors.tileEdge,
    backgroundColor: Colors.backgroundElement,
  },
  badge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  name: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19 },
  line: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12.5, lineHeight: 16 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
}));
