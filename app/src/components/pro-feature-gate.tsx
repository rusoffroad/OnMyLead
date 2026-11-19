import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ProShield } from '@/components/pro-gate';
import { ProChip } from '@/components/pro-tag';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import type { FeatureKey } from '@/core/entitlements';
import { FEATURE_INFO } from '@/core/pro';
import { track } from '@/lib/analytics';
import { useCan } from '@/lib/pro';

import { t } from '@/lib/i18n';

/**
 * A whole screen that is part of Pro (4.0 plan: Places to Ride, Trip Planner, Starlink, Where You
 * Ride). Pro, Pro Trial and Admin see the screen; a Free rider sees what it does, the Pro tag and
 * See OnMyLead Pro instead. Nothing the rider already has is hidden by it: while the 4.0 plan is
 * off (or the server doesn't gate the feature) every rider sees the screen as before. One readable
 * column on phones and tablets, portrait or landscape.
 */
export function ProFeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  if (useCan(feature)) return <>{children}</>;
  return <ProFeaturePage feature={feature} />;
}

/** The Pro page on its own, for a screen that decides for itself (Create a Ride on the 4.0 plan). */
export function ProFeaturePage({ feature }: { feature: FeatureKey }) {
  const info = FEATURE_INFO[feature];
  return (
    <Screen width="readable">
        <View style={styles.column} testID={`pro-page-${feature}`}>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <ProShield size={44} />
              <ProChip />
            </View>
            <ThemedText style={styles.title} accessibilityRole="header">{t(info.title)}</ThemedText>
            <ThemedText style={styles.lead}>{t(info.body, info.vars)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{t('Part of OnMyLead Pro.')}</ThemedText>
          </View>
          <Button
            title={t('See OnMyLead Pro')}
            big
            onPress={() => {
              track('pro_gate_shown', { feature });
              router.push('/pro');
            }}
          />
          <Button title={t('Not Now')} kind="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: Spacing.three, paddingTop: Spacing.three },
  card: { gap: Spacing.two, padding: Spacing.four, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border },
  title: { fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 34, color: Colors.text },
  lead: { color: Colors.textSecondary, fontSize: 17, lineHeight: 24 },
}));
