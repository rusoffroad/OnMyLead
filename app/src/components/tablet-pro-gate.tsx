import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ProChip } from '@/components/pro-tag';
import { ThemedText } from '@/components/themed-text';
import { Button, Field } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { can } from '@/core/entitlements';
import { FEATURE_INFO } from '@/core/pro';
import { tabletGateCovers } from '@/core/tablet-gate';
import { myRides } from '@/lib/api';
import { isTablet } from '@/lib/device-info';
import { useEntitlements } from '@/lib/entitlements';
import { useSession } from '@/lib/session';
import type { Ride } from '@/lib/types';

import { t } from '@/lib/i18n';
/**
 * OnMyLead on an iPad, an Android tablet or the website is part of Pro (feature tablet_web). For a
 * signed-in Free rider this covers every screen except the ones core/tablet-gate keeps open, so
 * joining a ride and following the leader always work: a Join a Ride box, the rides they're on
 * (straight to the ride page and Ride Mode), See OnMyLead Pro, and the You tab for the account.
 */
export function TabletProGate() {
  const path = usePathname();
  const { session } = useSession();
  const { ent } = useEntitlements();
  const bigScreen = Platform.OS === 'web' || isTablet();
  const covers = tabletGateCovers({ bigScreen, signedIn: !!session, allowed: can(ent, 'tablet_web'), path });
  const [code, setCode] = useState('');
  const [rides, setRides] = useState<Ride[]>([]);

  useEffect(() => {
    if (!covers) return;
    let live = true;
    myRides()
      .then((rows) => live && setRides(rows.map((r) => r.rides).filter((r) => r && (r.status === 'scheduled' || r.status === 'live')).slice(0, 5)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [covers]);

  if (!covers) return null;
  const join = () => code.trim() && router.push(`/r/${code.trim().toUpperCase()}`);
  const info = FEATURE_INFO.tablet_web;
  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.column}>
            <ProChip style={{ alignSelf: 'flex-start' }} />
            <ThemedText style={styles.title} accessibilityRole="header">{t(info.title)}</ThemedText>
            <ThemedText style={styles.lead}>
              {t('OnMyLead on {v} is part of OnMyLead Pro. Joining a ride and following the leader are free on every device.', { v: Platform.OS === 'web' ? 'the website' : 'a tablet' })}
            </ThemedText>

            <View style={styles.card}>
              <ThemedText type="subtitle">{t('Join a Ride')}</ThemedText>
              <Field
                label={t('Ride Code')}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={join}
                placeholder={t('MOAB-2026')}
              />
              <Button title={t('Join')} big disabled={!code.trim()} onPress={join} />
            </View>

            {rides.length ? (
              <View style={styles.card}>
                <ThemedText type="subtitle">{t('Your Rides')}</ThemedText>
                {rides.map((r) => (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/r/${r.invite_code}`)}
                    style={({ pressed }) => [styles.ride, pressed && { opacity: 0.8 }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{r.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{r.status === 'live' ? t('Riding Now. Open Ride Mode') : new Date(r.meet_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</ThemedText>
                    </View>
                    <Icon name="chevron" size={18} color={Colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Button title={t('See OnMyLead Pro')} big onPress={() => router.push('/pro')} />
            <Button title={t('Your Account')} kind="secondary" onPress={() => router.push('/profile')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = themedStyles(() => ({
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: Colors.background, zIndex: 998, elevation: 998 },
  scroll: { flexGrow: 1, padding: Spacing.four, justifyContent: 'center' },
  // One readable column, never stretched across an iPad, an Android tablet or a desktop window.
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: Spacing.three },
  title: { fontFamily: font(800, 'display'), fontSize: 36, lineHeight: 40, color: Colors.text },
  lead: { color: Colors.textSecondary, fontSize: 17, lineHeight: 24 },
  card: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border },
  ride: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 10, borderTopWidth: 1, borderColor: Colors.border },
}));
