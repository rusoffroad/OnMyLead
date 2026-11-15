import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { EXPANDED_MIN } from '@/core/layout';
import { permissionAction, type PermissionId, type PermissionPlatform, type PermissionStatus } from '@/core/permissions';
import { usePermissions, type PermissionRow } from '@/hooks/use-permissions';
import { t } from '@/lib/i18n';
import { fixPermission, PERMISSION_PLATFORM } from '@/lib/permissions';
import { useSession } from '@/lib/session';

/**
 * You > Permissions: every permission OnMyLead uses on this device, what the phone says about
 * each one now, and one tap to fix it. A tap shows the system question when the phone can still
 * ask; iPhone and iPad ask only once, so after a no the tap opens OnMyLead in Settings. The list
 * reads itself again when the rider comes back. Rules: core/permissions.ts.
 */
export default function PermissionsScreen() {
  const { session } = useSession();
  const { rows, attention, locationServicesOff, refresh } = usePermissions();
  const { width } = useWindowDimensions();
  const twoColumns = width >= EXPANDED_MIN;
  const [busy, setBusy] = useState<PermissionId | null>(null);
  const platform = PERMISSION_PLATFORM;

  async function tap(row: PermissionRow) {
    if (busy) return;
    setBusy(row.def.id);
    try {
      await fixPermission(row.def.id, row.status, session?.user.id ?? null);
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  const needed = rows?.filter((r) => r.def.essential) ?? [];
  const extras = rows?.filter((r) => !r.def.essential) ?? [];

  return (
    <Screen width={twoColumns ? 'wide' : 'readable'}>
      <Stack.Screen options={{ title: t('Permissions') }} />

      {rows ? <Summary rows={rows} attention={attention} /> : <ActivityIndicator color={Colors.sky} style={{ marginVertical: Spacing.four }} />}

      {locationServicesOff ? (
        <View style={styles.warn} accessibilityLiveRegion="polite">
          <ThemedText type="smallBold">{t('Location Is Off for the Whole Phone')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {platform === 'ios'
              ? t('Turn on Settings > Privacy & Security > Location Services. No app can use location until you do.')
              : t('Turn on Use Location in Settings > Location. No app can use location until you do.')}
          </ThemedText>
        </View>
      ) : null}

      {rows ? (
        <View style={[styles.columns, twoColumns && styles.columnsRow]}>
          <Group title={t('Needed for Group Rides')} rows={needed} platform={platform} busy={busy} onTap={tap} />
          <Group title={t('Optional')} rows={extras} platform={platform} busy={busy} onTap={tap} />
        </View>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
        {platform === 'ios'
          ? t('Apple shows each question only once. After you tap Don’t Allow, only the Settings app can turn it back on, so those rows open OnMyLead in Settings. Come back here and this list updates.')
          : platform === 'android'
            ? t('Android asks again until you turn a permission down twice. After that, the row opens OnMyLead in Settings. Come back here and this list updates.')
            : t('If your browser blocked location, allow it from the lock or settings icon next to onmylead.com in the address bar, then reload the page.')}
      </ThemedText>
      {platform !== 'web' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('Choosing a saved photo never needs Photos access: you pick each photo, and only that one is shared.')}
        </ThemedText>
      ) : null}
      {platform !== 'web' ? (
        <Pressable accessibilityRole="button" onPress={() => Linking.openSettings().catch(() => {})} style={({ pressed }) => [styles.allSettings, pressed && { opacity: 0.7 }]}>
          <Text style={styles.allSettingsText}>{t('Open OnMyLead in Settings')}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

/**
 * The top of the page, like the warning lights on a dash: one light per permission, lit amber
 * when it needs the rider, then one line that says whether a group ride will work.
 */
function Summary({ rows, attention }: { rows: PermissionRow[]; attention: PermissionId[] }) {
  const ok = attention.length === 0;
  const tone = ok ? RideColors.green : RideColors.yellow;
  return (
    <View style={[styles.summary, { borderColor: `${tone}55` }]} accessibilityRole="summary">
      <View style={styles.lights} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {rows.map((r) => {
          const c = lightColor(r);
          return (
            <View key={r.def.id} style={[styles.light, { backgroundColor: `${c}1F`, borderColor: `${c}66` }]}>
              <Icon name={ICONS[r.def.id]} size={16} color={c} />
            </View>
          );
        })}
      </View>
      <Text style={[styles.summaryTitle, { color: ok ? Colors.text : tone }]}>
        {ok ? t('Ready to Ride') : attention.length === 1 ? t('1 Permission Needs Your OK') : t('{n} Permissions Need Your OK', { n: attention.length })}
      </Text>
      <ThemedText type="small" themeColor="textSecondary">
        {ok
          ? t('Everything a group ride needs is allowed. Optional ones are up to you.')
          : t('Tap each one marked below. Your group can’t see you, or reach you with alerts, until they’re allowed.')}
      </ThemedText>
    </View>
  );
}

function lightColor(r: PermissionRow): string {
  if (r.status === 'granted') return RideColors.green;
  if (r.def.essential && r.status !== 'unknown') return RideColors.yellow;
  return Colors.textSecondary;
}

function Group({ title, rows, platform, busy, onTap }: { title: string; rows: PermissionRow[]; platform: PermissionPlatform; busy: PermissionId | null; onTap: (r: PermissionRow) => void }) {
  if (!rows.length) return null;
  return (
    <View style={styles.group}>
      <ThemedText type="small" themeColor="textSecondary" accessibilityRole="header" style={styles.groupTitle}>{title}</ThemedText>
      <View style={styles.list}>
        {rows.map((r, i) => (
          <View key={r.def.id}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <Row row={r} platform={platform} busy={busy === r.def.id} onTap={() => onTap(r)} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Row({ row, platform, busy, onTap }: { row: PermissionRow; platform: PermissionPlatform; busy: boolean; onTap: () => void }) {
  const { title, why } = copy(row.def.id, platform);
  const action = permissionAction(row.def.id, row.status, platform);
  const label = statusLabel(row.def.id, row.status, platform);
  const tone = row.status === 'granted' ? RideColors.green : row.def.essential && row.status !== 'unknown' ? RideColors.yellow : Colors.textSecondary;
  const actionLabel = action === 'ask' ? t('Allow') : action === 'settings' ? t('Open Settings') : null;
  const body = (
    <View style={styles.row}>
      <View style={[styles.tile, { backgroundColor: `${tone}1F` }]}>
        <Icon name={ICONS[row.def.id]} size={20} color={tone} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.titleLine}>
          <Text style={styles.rowTitle}>{title}</Text>
          <View style={[styles.pill, { backgroundColor: `${tone}26` }]}>
            {row.status === 'granted' ? <Icon name="check" size={12} color={tone} /> : null}
            <Text style={[styles.pillText, { color: tone }]}>{label}</Text>
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary">{why}</ThemedText>
      </View>
      {busy ? (
        <ActivityIndicator color={Colors.sky} />
      ) : actionLabel ? (
        <Text style={[styles.action, action === 'ask' && styles.actionAsk]}>{actionLabel}</Text>
      ) : null}
    </View>
  );
  if (!actionLabel) return <View accessible accessibilityLabel={`${title}. ${label}. ${why}`}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${label}. ${actionLabel}`}
      accessibilityHint={why}
      accessibilityState={{ busy }}
      onPress={onTap}
      style={({ pressed }) => pressed && { backgroundColor: Colors.backgroundSelected }}>
      {body}
    </Pressable>
  );
}

const ICONS: Record<PermissionId, IconName> = {
  location: 'pin',
  locationAlways: 'lock',
  preciseLocation: 'locate',
  googleAccuracy: 'locate',
  notifications: 'bell',
  bluetooth: 'bluetooth',
  motion: 'tilt',
  camera: 'image',
  music: 'music',
  localNetwork: 'dish',
  tracking: 'megaphone',
};

function copy(id: PermissionId, platform: PermissionPlatform): { title: string; why: string } {
  switch (id) {
    case 'location':
      return { title: t('Location'), why: t('Shows you on the map and shares your spot with your ride.') };
    case 'locationAlways':
      return { title: t('Location While Locked'), why: t('Keeps sharing with your phone locked on the mount. Needs Location set to Always.') };
    case 'preciseLocation':
      return { title: t('Precise Location'), why: t('Without it, your dot can show a mile or more from where you are.') };
    case 'googleAccuracy':
      return { title: t('Google Location Accuracy'), why: t('Without it, some Android phones place you miles off.') };
    case 'notifications':
      return { title: t('Notifications'), why: t('Status taps, EMERGENCY alerts, chat and ride changes.') };
    case 'bluetooth':
      return { title: t('Bluetooth'), why: t('Passes spots, taps and EMERGENCY between riders when there is no service.') };
    case 'motion':
      return { title: t('Motion and Fitness'), why: t('The tilt meter and Crash Alert.') };
    case 'camera':
      return { title: t('Camera'), why: t('Take a profile, garage, event or group photo.') };
    case 'music':
      return platform === 'android'
        ? { title: t('Notification Access'), why: t('Lets Music Controls show and control what is playing.') }
        : { title: t('Apple Music'), why: t('Song names in Music Controls.') };
    case 'localNetwork':
      return { title: t('Local Network'), why: t('Lets the Starlink page reach your dish. Apple doesn’t let apps read this one, so check it in Settings.') };
    case 'tracking':
      return { title: t('Ad Measurement'), why: t('Tells Meta and TikTok when an ad brought you here. Never your location, rides or messages.') };
  }
}

function statusLabel(id: PermissionId, status: PermissionStatus, platform: PermissionPlatform): string {
  switch (status) {
    case 'granted':
      return t('Allowed');
    case 'limited':
      if (id === 'locationAlways') return t('While Using Only');
      if (id === 'preciseLocation') return t('Approximate');
      return t('Partly Allowed');
    case 'denied':
      return t('Off');
    case 'blocked':
      return platform === 'web' ? t('Blocked by Browser') : t('Off in Settings');
    case 'undetermined':
      return t('Not Asked Yet');
    case 'needsFirst':
      return t('Needs Location First');
    case 'unknown':
      return t('Check in Settings');
  }
}

const styles = themedStyles(() => ({
  summary: {
    backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, borderWidth: 1,
    padding: Spacing.three, gap: Spacing.two,
  },
  lights: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  light: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontFamily: font(700, 'display'), fontSize: 26, lineHeight: 30, marginTop: 2 },
  warn: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: Colors.danger, padding: Spacing.three, gap: 4 },
  columns: { gap: Spacing.four },
  columnsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  group: { flex: 1, gap: Spacing.two },
  groupTitle: { fontWeight: 600, paddingHorizontal: Spacing.one },
  list: { borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundElement },
  divider: { height: 1, marginLeft: 66, backgroundColor: Colors.backgroundSelected },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, minHeight: 72, paddingVertical: 12 },
  tile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  titleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  rowTitle: { color: Colors.text, fontFamily: font(600), fontSize: 17, lineHeight: 22 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontFamily: font(700), fontSize: 12, lineHeight: 16 },
  action: { color: Colors.sky, fontFamily: font(600), fontSize: 15, flexShrink: 0, maxWidth: 110, textAlign: 'right' },
  actionAsk: { color: Colors.text, backgroundColor: Colors.sky, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 6 },
  allSettings: { alignSelf: 'flex-start', paddingVertical: Spacing.two },
  allSettingsText: { color: Colors.sky, fontFamily: font(600), fontSize: 15 },
}));
