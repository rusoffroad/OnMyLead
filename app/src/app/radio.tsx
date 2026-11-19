import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { MenuGroup, MenuRow } from '@/components/menu';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Colors, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { radioStatus } from '@/core/radio-status';
import { t } from '@/lib/i18n';
import { useBluetoothSharingSetting } from '@/lib/nearby';
import { forgetRadio, pairRadio, radioAvailable, radioPageOpen, startRadioScan, stopRadioScan, useRadio } from '@/lib/radio';

/**
 * You > Radio Sharing: pair the rider's own Meshtastic radio, see whether it's connected and its
 * battery, and forget it. Bluetooth Sharing's packets then also go over the radio in Ride Mode
 * (lib/radio.ts). Only shown when the Admin switch radio_sharing is on and the build has the module.
 */
export default function RadioScreen() {
  // The website and builds without the module have no radio: back to You.
  if (!radioAvailable) return <Redirect href="/profile" />;
  return <RadioPage />;
}

function RadioPage() {
  const r = useRadio();
  const [bluetoothOn] = useBluetoothSharingSetting();
  useEffect(() => {
    radioPageOpen(true);
    return () => radioPageOpen(false);
  }, []);
  const status = radioStatus(r);

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: t('Radio Sharing') }} />
      <ThemedText themeColor="textSecondary">
        {t('Pair your own Meshtastic radio and Bluetooth Sharing also goes over it. Spots, alerts and messages reach riders on your ride who have a radio too, miles away with no service.')}
      </ThemedText>

      {!bluetoothOn ? (
        <View style={styles.warn}>
          <ThemedText type="small">{t('Turn on Bluetooth Sharing under You first. Radio Sharing sends what Bluetooth Sharing sends.')}</ThemedText>
        </View>
      ) : null}

      {r.saved ? (
        <MenuGroup title={t('Your Radio')}>
          <MenuRow
            icon="signal"
            color={status.tone === 'good' ? RideColors.green : status.tone === 'bad' ? RideColors.yellow : Colors.textSecondary}
            title={r.name || r.saved.name || t('Meshtastic Radio')}
            detail={status.detail}
          />
        </MenuGroup>
      ) : null}

      {r.saved && status.problem ? (
        <View style={styles.warn} accessibilityLiveRegion="polite">
          <ThemedText type="small">{status.problem}</ThemedText>
        </View>
      ) : null}

      {r.saved ? (
        <ThemedText type="small" themeColor="textSecondary">
          {r.sharing ? t('Sharing over the radio on this ride.') : t('Goes to work when you open Ride Mode with Bluetooth Sharing on.')}
          {r.heard || r.sent ? ` ${t('Heard {heard}, sent {sent} this ride.', { heard: r.heard, sent: r.sent })}` : ''}
        </ThemedText>
      ) : null}

      {r.scanning ? (
        <MenuGroup title={t('Radios Nearby')}>
          {r.found.length ? (
            r.found.map((f) => (
              <MenuRow
                key={f.id}
                icon="signal"
                color={Colors.sky}
                title={f.name}
                onPress={() => pairRadio(f)}
                right={<ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>{t('Pair')}</ThemedText>}
              />
            ))
          ) : (
            <MenuRow icon="search" title={t('Looking for Meshtastic radios…')} detail={t('Turn your radio on and keep it close to this device.')} />
          )}
        </MenuGroup>
      ) : null}

      <View style={{ gap: Spacing.two }}>
        {r.scanning ? (
          <Button title={t('Stop Looking')} kind="secondary" onPress={stopRadioScan} />
        ) : (
          <Button title={r.saved ? t('Pair a Different Radio') : t('Pair a Radio')} kind={r.saved ? 'secondary' : 'primary'} onPress={() => void startRadioScan()} />
        )}
        {r.saved ? <Button title={t('Forget This Radio')} kind="secondary" onPress={forgetRadio} /> : null}
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {t('Everything OnMyLead sends over the radio is encrypted for your ride only. OnMyLead doesn’t change your radio’s settings. Radios pass packets on for each other, and on Meshtastic’s default setting each rider’s spot goes out about every 2 minutes. EMERGENCY always goes first.')}
      </ThemedText>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  warn: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: RideColors.yellow, padding: Spacing.three, gap: 4 },
}));
