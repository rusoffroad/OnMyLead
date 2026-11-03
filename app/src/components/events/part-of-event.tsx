import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Colors, font, Radius, themedStyles } from '@/constants/theme';
import { eventForRide } from '@/lib/events';

/** "Part of Moab Spring Rally": on a ride's page when the ride is one of an event's group rides. */
export function PartOfEvent({ rideId }: { rideId: string }) {
  const [ev, setEv] = useState<{ share_code: string; title: string; label: string | null } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let gone = false;
      eventForRide(rideId).then((e) => !gone && setEv(e)).catch(() => {});
      return () => {
        gone = true;
      };
    }, [rideId]),
  );
  if (!ev) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Part of ${ev.title}. Open the event`}
      onPress={() => router.push(`/e/${ev.share_code}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <Icon name="calendar" size={16} color={Colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.text} numberOfLines={1}>Part of {ev.title}{ev.label ? `: ${ev.label}` : ''}</Text>
      </View>
      <Icon name="chevron" size={16} color={Colors.textSecondary} />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: 'rgba(229,38,46,0.1)',
    borderWidth: 1, borderColor: 'rgba(229,38,46,0.35)',
  },
  text: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
}));
