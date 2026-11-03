import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { HELP_CENTER_DISPLAY, HELP_CENTER_TITLE } from '@/core/help-link';
import { openHelpCenter } from '@/lib/help-center';

/**
 * The way into the Help Center at onmylead.com/help: step-by-step guides for every feature. Shown
 * at the top of Help and Support so it's the first thing riders see when they need help.
 */
export function HelpCenterCard() {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${HELP_CENTER_TITLE}. Step-by-step instructions for everything in OnMyLead.`}
      accessibilityHint={`Opens ${HELP_CENTER_DISPLAY}`}
      onPress={() => openHelpCenter()}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.tile}>
        <Icon name="book" size={28} color={Colors.sky} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{HELP_CENTER_TITLE}</Text>
        <Text style={styles.detail}>
          Step-by-step instructions for everything in OnMyLead, from your first ride to offline maps and Pro.
        </Text>
        <View style={styles.url}>
          <Text style={styles.urlText}>{HELP_CENTER_DISPLAY}</Text>
          <Icon name="external" size={15} color={Colors.sky} strokeWidth={2.2} />
        </View>
      </View>
    </Pressable>
  );
}

/** A small "Read the Guide" link under a topic, to its article in the Help Center. */
export function GuideLink({ slug, title = 'Read the Guide' }: { slug: string; title?: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={`Opens the guide on ${HELP_CENTER_DISPLAY}`}
      hitSlop={8}
      onPress={() => openHelpCenter(slug)}
      style={({ pressed }) => [styles.guide, pressed && { opacity: 0.7 }]}>
      <Icon name="book" size={17} color={Colors.sky} />
      <Text style={styles.guideText}>{title}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: 'rgba(59,134,247,0.45)',
    backgroundColor: Colors.backgroundElement,
  },
  pressed: { backgroundColor: Colors.backgroundSelected },
  tile: {
    width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(59,134,247,0.14)',
  },
  body: { flex: 1, gap: 4 },
  title: { color: Colors.text, fontFamily: font(700), fontSize: 18, lineHeight: 23 },
  detail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 15, lineHeight: 21 },
  url: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  urlText: { color: Colors.sky, fontFamily: font(700), fontSize: 15, lineHeight: 20 },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
  guideText: { color: Colors.sky, fontFamily: font(700), fontSize: 15, lineHeight: 20 },
}));
