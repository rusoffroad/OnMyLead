import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, themedStyles } from '@/constants/theme';
import { APP_FLAGS, liveNotice, noticeKey, type AppFlag, type Notice } from '@/core/app-settings';
import { dismissNotice, useAppSettings, useFlag } from '@/lib/app-settings';
import { openStore, useUpdateState, useVersionNotice } from '@/lib/app-update';
import { useEntitlements } from '@/lib/entitlements';
import { shortDate } from '@/core/pro';

import { t } from '@/lib/i18n';
const untilText = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * The owner's notices, set on the Admin Dashboard:
 *   * a notice for this exact app version (Releases page), amber, such as a known problem;
 *   * "Update Available" when a newer version is in the store (Releases page), closable;
 *   * maintenance (Settings page), amber, stays until the owner clears it or its time runs out;
 *   * the announcement (Settings page), logo blue, closable (new wording shows again);
 *   * while a Pro trial runs, the day it ends, closable (a new end date, such as the 2.1 launch
 *     trial, shows again).
 */
export function AppNotices() {
  const { settings, dismissed } = useAppSettings();
  const versionNotice = useVersionNotice();
  const update = useUpdateState();
  const maintenance = liveNotice(settings.maintenance);
  const announcement = liveNotice(settings.announcement);
  const showAnnouncement = announcement && !dismissed.includes(noticeKey(announcement));
  const updateKey = update.kind === 'available' ? `update-${update.latest}` : null;
  const showUpdate = updateKey && !dismissed.includes(updateKey);
  const { ent } = useEntitlements();
  const trialKey = ent.proSource === 'trial' && ent.trialEndsAt ? `trial-${ent.trialEndsAt}` : null;
  const trialEnds = trialKey ? shortDate(ent.trialEndsAt) : '';
  const showTrial = !!trialKey && !!trialEnds && !dismissed.includes(trialKey);
  if (!versionNotice && !showUpdate && !maintenance && !showAnnouncement && !showTrial) return null;
  return (
    <View style={{ gap: 10 }}>
      {versionNotice ? (
        <NoticeCard notice={versionNotice} color={RideColors.yellow} tint={Colors.backgroundElement} icon="warning" title={t('About This Version')} />
      ) : null}
      {showUpdate && update.kind === 'available' ? (
        <NoticeCard
          notice={{ text: t('Version {latest} is in {v}.', { latest: update.latest, v: Platform.OS === 'android' ? 'Google Play' : 'the App Store' }) }}
          color={Colors.sky}
          tint="rgba(59,134,247,0.12)"
          icon="bell"
          title={t('Update Available')}
          closeLabel="Close update notice"
          onClose={() => dismissNotice(updateKey)}
          action={<Button title={t('Update')} onPress={openStore} style={{ alignSelf: 'flex-start', marginTop: 6 }} />}
        />
      ) : null}
      {maintenance ? (
        <NoticeCard notice={maintenance} color={RideColors.yellow} tint={Colors.backgroundElement} icon="warning" title={t('Planned Maintenance')} />
      ) : null}
      {showTrial && trialKey ? (
        <NoticeCard
          notice={{ text: t('Every Pro feature is yours free until {date}. After that you keep riding on Free, and joining rides, Ride Mode and EMERGENCY stay free.', { date: trialEnds }) }}
          color={Colors.gold}
          tint="rgba(230,194,122,0.12)"
          icon="star"
          title={t('Your Pro Trial Runs Until {date}', { date: trialEnds })}
          closeLabel="Close trial notice"
          onClose={() => dismissNotice(trialKey)}
          action={<Button title={t('See Pro')} onPress={() => router.push('/pro')} style={{ alignSelf: 'flex-start', marginTop: 6 }} />}
        />
      ) : null}
      {showAnnouncement ? (
        <NoticeCard notice={announcement} color={Colors.sky} tint="rgba(59,134,247,0.12)" icon="megaphone" onClose={() => dismissNotice(noticeKey(announcement))} />
      ) : null}
    </View>
  );
}

function NoticeCard({ notice, color, tint, icon, title, onClose, closeLabel = 'Close announcement', action }: {
  notice: Notice; color: string; tint: string; icon: IconName; title?: string; onClose?: () => void; closeLabel?: string; action?: ReactNode;
}) {
  return (
    <View
      accessible={!action}
      accessibilityRole={title ? 'alert' : 'summary'}
      style={[styles.card, { backgroundColor: tint, borderColor: color }]}>
      <Icon name={icon} size={24} color={color} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <ThemedText style={[styles.title, { color }]}>{title}</ThemedText> : null}
        <ThemedText style={styles.text}>{notice.text}</ThemedText>
        {notice.until && title ? <ThemedText type="small" themeColor="textSecondary">{t('Until {v}', { v: untilText(notice.until) })}</ThemedText> : null}
        {action}
      </View>
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={10} onPress={onClose} style={styles.close}>
          <Icon name="close" size={18} color={Colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A screen the owner switched off: shows why instead of the screen, for links into it. */
export function FlagGate({ flag, children }: { flag: AppFlag; children: ReactNode }) {
  const on = useFlag(flag);
  if (on) return children;
  return (
    <Screen>
      <View style={{ gap: 12, paddingTop: 24 }}>
        <ThemedText type="subtitle">{t('{label} Is Off for Now', { label: APP_FLAGS[flag].label })}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('It\'s switched off while we work on it. Everything you saved is kept, and your rides work as usual.')}</ThemedText>
        <Button title={t('Back to Home')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: Radius.card, borderLeftWidth: 4, paddingVertical: 14, paddingLeft: 14, paddingRight: 10 },
  title: { fontFamily: font(700, 'display'), fontSize: 19, lineHeight: 22 },
  text: { fontFamily: font(500), fontSize: 16, lineHeight: 22, color: Colors.text },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
}));
