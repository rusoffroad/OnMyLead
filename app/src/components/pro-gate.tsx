import { router } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import type { FeatureKey } from '@/core/entitlements';
import { FEATURE_INFO, nextReset, type ProBlock } from '@/core/pro';
import { closeProGate, showProGate, useProGatePrompt } from '@/lib/pro';

/**
 * The Pro mark: a route shield, like the ones on highway and forest road signs, with PRO set in
 * the condensed Barlow the signs are drawn from.
 */
export function ProShield({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.08} viewBox="0 0 100 108" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path
        d="M50 4c14 8 30 8 42 2 4 18 4 40-2 58-7 20-22 32-40 40C32 96 17 84 10 64 4 46 4 24 8 6c12 6 28 6 42-2z"
        fill={Colors.accent}
        stroke="#FFFFFF"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <SvgText x="50" y="70" fill="#FFFFFF" fontSize="36" fontFamily={font(800, 'display')} fontWeight="800" textAnchor="middle" letterSpacing="1">
        PRO
      </SvgText>
    </Svg>
  );
}

/** What the prompt says for a block: a Pro feature, or the Free ride limit. */
function promptCopy(block: ProBlock): { title: string; body: string; need: string } {
  if (block.kind === 'ride_limit') {
    const reset = nextReset().toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
    return {
      title: 'You’ve Created This Month’s Free Ride',
      body: `Free accounts create ${block.allowance === 1 ? 'one ride' : `${block.allowance} rides`} a month, and your next one opens on ${reset}. Joining other rides stays free.`,
      need: 'Pro creates as many rides as you lead.',
    };
  }
  if (!block.feature) return { title: 'OnMyLead Pro', body: 'Upgrade to use this. Joining rides and every safety feature stay free.', need: 'Part of OnMyLead Pro.' };
  const info = FEATURE_INFO[block.feature];
  return { title: info.title, body: info.body, need: 'Part of OnMyLead Pro.' };
}

/**
 * The one Pro prompt, mounted once at the root. It explains the feature, says Pro is needed and
 * offers the upgrade; Not Now (or tapping outside) closes it.
 */
export function ProGateHost() {
  const block = useProGatePrompt();
  const insets = useSafeAreaInsets();
  const copy = block ? promptCopy(block) : null;
  return (
    <Modal visible={!!block} transparent animationType="slide" onRequestClose={closeProGate} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={closeProGate} accessibilityLabel="Close" accessibilityRole="button" />
      {copy ? (
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
          <View style={styles.grip} />
          <View style={styles.head}>
            <ProShield size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
              <Text style={styles.need}>{copy.need}</Text>
            </View>
          </View>
          <ThemedText style={{ color: Colors.text }}>{copy.body}</ThemedText>
          <Button
            title="See OnMyLead Pro"
            big
            onPress={() => {
              closeProGate();
              router.push('/pro');
            }}
          />
          <Button title="Not Now" kind="ghost" onPress={closeProGate} />
        </View>
      ) : null}
    </Modal>
  );
}

/**
 * A quiet in-place row for something Pro adds (older rides, more stats, card layouts). Tapping it
 * opens the Pro prompt; it never covers anything the rider already has.
 */
export function ProLock({ feature, title, detail }: { feature: FeatureKey; title?: string; detail?: string }) {
  const info = FEATURE_INFO[feature];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title ?? info.title}. Part of OnMyLead Pro`}
      onPress={() => showProGate({ kind: 'pro_required', feature })}
      style={({ pressed }) => [styles.lock, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={styles.lockIcon}>
        <Icon name="lock" size={18} color={Colors.accent} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <ThemedText style={{ fontWeight: 700 }}>{title ?? info.title}</ThemedText>
        {detail ? <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText> : null}
      </View>
      <View style={styles.proTag}>
        <Text style={styles.proTagText}>Pro</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(3,9,18,0.72)' },
  sheet: {
    backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three,
    borderTopWidth: 1, borderColor: Colors.border,
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
  need: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14, lineHeight: 19 },
  lock: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.card - 4, padding: 12,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
  },
  lockIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(229,38,46,0.14)', alignItems: 'center', justifyContent: 'center' },
  proTag: { backgroundColor: Colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  proTagText: { color: '#fff', fontFamily: font(800, 'display'), fontSize: 14, letterSpacing: 0.5 },
});
