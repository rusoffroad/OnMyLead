import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetRoot, SwipeSheet } from '@/components/swipe-sheet';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { MAPS_APP_LABEL, mapsAppsFor, pickedApp, type DirectionsRow, type DirectionsTarget } from '@/core/directions';
import { MAPS_APPS_TEXT, openDirections, openIn, useMapsPreference, useWebDirectionsPrompt } from '@/lib/directions';
import { ProTag } from './pro-tag';

import { t as tr } from '@/lib/i18n';
import { SheetModal } from '@/components/sheet-modal';
/**
 * Places to get turn-by-turn directions to, one row each. A tap opens the rider's maps app, or asks
 * Apple Maps or Google Maps first when they haven't picked one in Profile.
 */
export function DirectionsList({ rows, onOpen }: { rows: DirectionsRow[]; onOpen?: (t: DirectionsTarget) => void }) {
  const pref = useMapsPreference();
  const app = pickedApp(pref, Platform.OS);
  return (
    <View style={styles.list} accessibilityRole="list">
      {rows.map((r, i) => (
        <Pressable
          key={r.key}
          accessibilityRole="button"
          accessibilityLabel={tr('Directions to {title}{v}. {detail}', { title: r.title, v: app ? ` in ${MAPS_APP_LABEL[app]}` : '', detail: r.detail })}
          onPress={() => (onOpen ?? openDirections)(r.target)}
          style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { backgroundColor: Colors.backgroundSelected }]}>
          <View style={styles.sign}>
            <Icon name="turn" size={22} color={Colors.sky} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{r.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{tr(r.detail)}</ThemedText>
          </View>
          {app ? <Text style={styles.app}>{tr(MAPS_APP_LABEL[app])}</Text> : <Icon name="chevron" size={20} color={Colors.textSecondary} />}
        </Pressable>
      ))}
    </View>
  );
}

/** For the ride page: where the road part of the ride starts and ends, ready for a maps app. */
export function DirectionsCard({ rows }: { rows: DirectionsRow[] }) {
  if (!rows.length) return null;
  return (
    <View style={{ gap: Spacing.two }}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText type="heading">{tr('Directions')}</ThemedText>
          <ProTag feature="directions" />
        </View>
        <ThemedText type="small" themeColor="textSecondary">{tr('Turn-by-turn on the roads, in {v}.', { v: MAPS_APPS_TEXT })}</ThemedText>
      </View>
      <DirectionsList rows={rows} />
    </View>
  );
}

/** Ride Mode's Directions sheet. It closes before the maps app (or the app chooser) opens. */
export function DirectionsSheet({ visible, rows, onClose }: { visible: boolean; rows: DirectionsRow[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const open = (t: DirectionsTarget) => {
    onClose();
    // iOS presents its app chooser from the top screen, so let this sheet finish closing first.
    setTimeout(() => openDirections(t), Platform.OS === 'ios' ? 400 : 0);
  };
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={tr('Close')} accessibilityRole="button" />
      <SwipeSheet onClose={onClose} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
        <View style={styles.grip} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.title} accessibilityRole="header">{tr('Directions')}</Text>
          <ProTag feature="directions" />
        </View>
        <ThemedText type="small" themeColor="textSecondary">{tr('For the road. Off road, follow the leader and the route on this map.')}</ThemedText>
        {rows.length ? (
          <DirectionsList rows={rows} onOpen={open} />
        ) : (
          <ThemedText themeColor="textSecondary">{tr('Nothing to get directions to yet. Tap a waypoint or a rider to navigate to them.')}</ThemedText>
        )}
        <Button title={tr('Close')} kind="ghost" onPress={onClose} />
      </SwipeSheet>
      </SheetRoot>
    </SheetModal>
  );
}

/** The web's Apple Maps or Google Maps chooser (phones use their own action sheet). Mounted once at the root. */
export function DirectionsHost() {
  const [target, close] = useWebDirectionsPrompt();
  if (Platform.OS !== 'web') return null;
  return (
    <SheetModal visible={!!target} transparent animationType="fade" onRequestClose={close}>
      <SheetRoot>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel={tr('Close')} accessibilityRole="button" />
      {target ? (
        <SwipeSheet onClose={close} style={[styles.sheet, styles.webSheet]} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">{tr('Directions to {title}', { title: target.title })}</Text>
          {target.via?.length ? (
            <ThemedText type="small" themeColor="textSecondary">{tr('Maps keeps to roads between the route’s stops, so off-road parts may differ.')}</ThemedText>
          ) : null}
          {mapsAppsFor('web').map((a) => (
            <Button
              key={a}
              title={tr('Open in {v}', { v: MAPS_APP_LABEL[a] })}
              kind={a === 'apple' ? 'primary' : 'secondary'}
              onPress={() => {
                close();
                openIn(a, target);
              }}
            />
          ))}
          <Button title={tr('Cancel')} kind="ghost" onPress={close} />
        </SwipeSheet>
      ) : null}
      </SheetRoot>
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  list: { borderRadius: 18, overflow: 'hidden', backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 64 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  sign: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  app: { color: Colors.sky, fontFamily: font(700), fontSize: 14 },
  scrim: { flex: 1, backgroundColor: Colors.scrim },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
  },
  webSheet: { alignSelf: 'center', maxWidth: 480, marginHorizontal: 'auto', paddingBottom: Spacing.four, paddingTop: Spacing.four },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26 },
}));
