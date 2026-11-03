import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Colors, font } from '@/constants/theme';
import type { TOOLKIT, ToolKey } from '@/core/home';
import { Gradient, Home, homeStyles, HomeCard } from './parts';

const ICONS: Record<ToolKey, IconName> = {
  out_riding: 'signal', friends: 'people', garage: 'machine', trips: 'calendar',
  maps: 'download', starlink: 'dish', battery: 'battery', share: 'pin',
};

/** Your Toolkit: the tools that used to be buried in the You menu, four to a row. */
export function Toolkit({ tools, columns }: { tools: typeof TOOLKIT; columns: number }) {
  return (
    <View style={styles.grid}>
      {tools.map((t) => (
        <Pressable
          key={t.key}
          accessibilityRole="button"
          accessibilityLabel={t.label}
          onPress={() => router.push(t.href as never)}
          style={({ pressed }) => [styles.tool, { width: `${100 / columns}%` }, pressed && { opacity: 0.75 }]}>
          <View style={styles.icon}>
            <Gradient colors={[Home.panel2, Home.panel]} radius={18} />
            <View>
              <Icon name={ICONS[t.key]} size={24} color={Colors.text} strokeWidth={2} />
            </View>
          </View>
          <Text style={styles.label} numberOfLines={2}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Help & Support: the Help Center's how-to guides, contact, and reporting a problem, one tap from home. */
export function HelpRow() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Help and Support. How-to guides, contact us, report a problem" onPress={() => router.push('/support')}>
      {({ pressed }) => (
        <HomeCard style={[styles.help, pressed && { backgroundColor: Home.panel2 }]}>
          <View style={styles.helpIcon}>
            <Icon name="help" size={22} color={Colors.sky} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={homeStyles.cardTitle}>Help & Support</Text>
            <Text style={homeStyles.muted}>How-to guides, contact us, report a problem</Text>
          </View>
          <Icon name="chevron" color={Home.muted} />
        </HomeCard>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, marginHorizontal: -4 },
  tool: { alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  icon: {
    width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Home.line, overflow: 'hidden',
  },
  label: { color: Colors.text, fontFamily: font(600), fontSize: 12, lineHeight: 15, textAlign: 'center' },
  help: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  helpIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(59,134,247,0.12)', alignItems: 'center', justifyContent: 'center' },
});
