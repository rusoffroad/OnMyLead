import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { RIDER_AGREEMENT, type RiderAgreement } from '@/core/rider-agreement';
import { acceptRiderAgreement, useNeedsRiderAgreement } from '@/lib/rider-agreement';

// Pages a rider can open from the agreement screen (it steps aside while they read them), and the
// Admin Dashboard, which has its own sign-in.
const STEPS_ASIDE = ['/terms', '/privacy', '/rider-agreement', '/support', '/contact', '/auth-callback', '/reset-password'];

/** The agreement's sections, shared by the launch screen and the /rider-agreement page. */
export function AgreementSections({ agreement = RIDER_AGREEMENT }: { agreement?: RiderAgreement }) {
  return (
    <View style={{ gap: Spacing.three }}>
      {agreement.sections.map((s) => (
        <View key={s.title} style={{ gap: 6 }}>
          <ThemedText style={styles.sectionTitle} accessibilityRole="header">{s.title}</ThemedText>
          <ThemedText style={styles.body}>{s.body}</ThemedText>
        </View>
      ))}
    </View>
  );
}

/**
 * "Before You Ride": the Rider Safety and Liability Agreement, over every screen, until the rider
 * ticks the box and taps I Agree. Shown on first launch on iPhone, iPad and Android (before or
 * after signing in) and on onmylead.com once signed in, and again whenever the wording changes.
 * A centred column on phones and tablets, never stretched; the box and button stay pinned under
 * the text so they are always in reach.
 */
export function RiderAgreementGate() {
  const needs = useNeedsRiderAgreement();
  const path = usePathname();
  const [checked, setChecked] = useState(false);
  if (!needs || STEPS_ASIDE.some((p) => path === p) || path.startsWith('/admin')) return null;
  const a = RIDER_AGREEMENT;
  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.column}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
            <View style={styles.badge}>
              <Icon name="warning" size={34} color={Colors.onAccent} strokeWidth={2.2} />
            </View>
            <ThemedText style={styles.title} accessibilityRole="header">Before You Ride</ThemedText>
            <ThemedText style={styles.lead}>{a.summary}</ThemedText>
            <View style={styles.paper}>
              <ThemedText style={styles.paperTitle}>{a.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Version {a.version}, effective {a.effective}</ThemedText>
              <AgreementSections />
            </View>
            <View style={styles.links}>
              <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/terms')}>
                <ThemedText type="small" style={styles.link}>Terms of Use</ThemedText>
              </Pressable>
              <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/privacy')}>
                <ThemedText type="small" style={styles.link}>Privacy Policy</ThemedText>
              </Pressable>
            </View>
          </ScrollView>
          <View style={styles.foot}>
            <Pressable
              onPress={() => setChecked((c) => !c)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={a.checkbox}
              hitSlop={8}
              style={({ pressed }) => [styles.check, pressed && { opacity: 0.8 }]}>
              {/* The whole row is the checkbox: the box and the words never take the touch
                  themselves (on iPhone a Text inside a Pressable can swallow a tap). */}
              <View pointerEvents="none" style={styles.checkInner}>
                <View style={[styles.box, checked && styles.boxOn]}>
                  {checked ? <Icon name="check" size={20} color="#fff" /> : null}
                </View>
                <ThemedText style={styles.checkText} suppressHighlighting accessible={false}>{a.checkbox}</ThemedText>
              </View>
            </Pressable>
            <Button title="I Agree" big disabled={!checked} onPress={acceptRiderAgreement} style={{ alignSelf: 'stretch' }} />
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              If you don&apos;t agree, please don&apos;t use OnMyLead.
            </ThemedText>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = themedStyles(() => ({
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: Colors.background, zIndex: 999, elevation: 999 },
  // Phones and tablets alike: one readable column, never stretched across an iPad or Android tablet.
  column: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center' },
  scroll: { padding: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.three },
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 44, color: Colors.text },
  lead: { fontFamily: font(500), fontSize: 18, lineHeight: 26, color: Colors.text },
  paper: {
    backgroundColor: Colors.backgroundElement, borderRadius: 18, padding: Spacing.three, gap: Spacing.two,
    borderLeftWidth: 4, borderLeftColor: Colors.accent,
  },
  paperTitle: { fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 26, color: Colors.text },
  sectionTitle: { fontFamily: font(700), fontSize: 17, lineHeight: 22, color: Colors.text },
  body: { fontSize: 16, lineHeight: 24, color: Colors.textSecondary },
  links: { flexDirection: 'row', gap: Spacing.four, justifyContent: 'center' },
  link: { color: Colors.sky, textDecorationLine: 'underline' },
  foot: {
    paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two,
    borderTopWidth: 1, borderTopColor: Colors.backgroundElement, backgroundColor: Colors.background,
  },
  check: { paddingVertical: 6, borderRadius: 10 },
  checkInner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  box: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  checkText: { flex: 1, fontFamily: font(600), fontSize: 16, lineHeight: 22, color: Colors.text },
}));
