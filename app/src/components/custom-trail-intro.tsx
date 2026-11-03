import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Icon, type IconName } from '@/components/icon';
import { Button } from '@/components/ui';
import { Colors, font, Radius, themedStyles } from '@/constants/theme';
import { trailRuleWords, type TrailRules } from '@/core/nav-trails';

export const CUSTOM_TRAIL_INTRO_KEY = 'nav.customTrailIntro.v1';

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'draw', title: 'Draw It', body: 'Tap along the trail. Follow Trails snaps to lines on the map; Straight Line is for trails that aren’t marked anywhere. Name spots like ledges and crossings as you go.' },
  { icon: 'lock', title: 'It Stays Private', body: 'Your trail is saved on this phone only. Nobody sees it unless you share it.' },
  { icon: 'people', title: 'Share With Riders (Pro)', body: 'Shared trails show in full on every rider’s map, mint dotted, with your ride name as the mapper.' },
  { icon: 'star', title: 'Riders Rate It', body: 'Riders who ride a quarter of it (or a full kilometer) rate how accurate the line is, 1 to 5 stars.' },
];

/**
 * How Custom Trails Work: shown before a rider maps their first custom trail, so the sharing,
 * rating and take-down rules are clear up front. The take-down numbers are the Admin Dashboard's.
 */
export function CustomTrailIntro({
  visible, rules, onStart, onClose,
}: { visible: boolean; rules: TrailRules; onStart: (dontShowAgain: boolean) => void; onClose: () => void }) {
  const [skip, setSkip] = useState(false);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="How Custom Trails Work" footer={
      <View style={{ gap: 4 }}>
      <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: skip }}
          onPress={() => setSkip(!skip)}
          style={styles.check}>
          <View style={[styles.box, skip && styles.boxOn]}>{skip ? <Icon name="check" size={16} color="#fff" strokeWidth={3} /> : null}</View>
          <Text style={styles.body}>Don’t show this again</Text>
        </Pressable>
        <Button title="Start Mapping" onPress={() => onStart(skip)} />
      </View>
    }>
      {STEPS.map((s, i) => (
        <View key={s.title} style={styles.step}>
          <View style={styles.num}>
            <Icon name={s.icon} size={20} color={Colors.text} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.stepTitle}>{i + 1}. {s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        </View>
      ))}
      <View style={styles.down}>
        <Text style={styles.downTitle}>When a Trail Comes Down</Text>
        <Text style={styles.body}>
          If {trailRuleWords(rules)}, it comes off the public map automatically. You’re told, it stays on your phone, and you can fix it and share it again. The admin can also take down a trail that breaks the rules.
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = themedStyles(() => ({
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  num: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  stepTitle: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  body: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 20 },
  down: { gap: 4, padding: 14, borderRadius: Radius.control, borderWidth: 1, borderColor: 'rgba(240,62,62,0.45)', backgroundColor: 'rgba(240,62,62,0.08)' },
  downTitle: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, alignSelf: 'flex-start' },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
}));
