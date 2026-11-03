import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Colors, font, Glass, Radius, Spacing, themedStyles } from '@/constants/theme';
import { EVENT_OR_RIDE } from '@/core/events';
import { openHelpCenter } from '@/lib/help-center';

type From = 'events' | 'find' | 'create-ride' | 'create-event';

/**
 * "Event or Public Ride?": a quiet row that opens to say what each one is. The same words on
 * Events, Find a Ride and both Create screens, on iPhone, iPad, Android and the website. It
 * starts closed so it never pushes the screen down, and it opens in place (no sheet), so it reads
 * the same in a phone column, a tablet side pane and a desktop window.
 */
export function EventOrRide({ from }: { from: From }) {
  const [open, setOpen] = useState(false);
  const other =
    from === 'events' || from === 'create-event'
      ? { title: 'Find a Public Ride', go: () => router.push('/find') }
      : { title: 'See Events', go: () => router.push('/events') };

  return (
    <View style={styles.box}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${EVENT_OR_RIDE.question} ${EVENT_OR_RIDE.link}`}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.7 }]}>
        <Icon name="help" size={18} color={Colors.sky} />
        <Text style={styles.question}>{EVENT_OR_RIDE.question}</Text>
        <Text style={styles.link}>{open ? 'Hide' : EVENT_OR_RIDE.link}</Text>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <Item icon="flag" title={EVENT_OR_RIDE.ride.title} text={EVENT_OR_RIDE.ride.text} />
          <Item icon="calendar" title={EVENT_OR_RIDE.event.title} text={EVENT_OR_RIDE.event.text} />
          <Text style={styles.text}>{EVENT_OR_RIDE.pick}</Text>
          <View style={styles.links}>
            <Pressable accessibilityRole="link" hitSlop={8} onPress={other.go}>
              <Text style={styles.link}>{other.title}</Text>
            </Pressable>
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => openHelpCenter('events')}>
              <Text style={styles.link}>Learn More</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Item({ icon, title, text }: { icon: 'flag' | 'calendar'; title: string; text: string }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemIcon}><Icon name={icon} size={16} color={Colors.text} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  box: { borderRadius: Radius.card, borderWidth: 1, borderColor: Glass.edge, backgroundColor: Colors.backgroundElement, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44 },
  question: { flex: 1, color: Colors.text, fontFamily: font(600), fontSize: 15 },
  link: { color: Colors.sky, fontFamily: font(600), fontSize: 14 },
  body: { gap: Spacing.three, paddingHorizontal: 14, paddingBottom: 14 },
  item: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  itemIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  text: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 20 },
  links: { flexDirection: 'row', gap: Spacing.four, flexWrap: 'wrap' },
}));
