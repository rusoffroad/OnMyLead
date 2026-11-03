import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { appVersion, openStore, useUpdateState } from '@/lib/app-update';

// "Not Now" lasts until the app is closed and opened again.
let notNow = false;

/**
 * "Update Required", over every screen, when the owner set a minimum version above this build
 * (Admin Dashboard > Releases). It always has Not Now: a rider on a trail with no signal can't
 * download an update, and Ride Mode and Help and SOS must keep working.
 */
export function UpdateRequired() {
  const state = useUpdateState();
  const [hidden, setHidden] = useState(notNow);
  if (state.kind !== 'required' || hidden) return null;
  const store = Platform.OS === 'android' ? 'Google Play' : 'the App Store';
  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.inner}>
            <View style={styles.badge}>
              <Icon name="warning" size={40} color={Colors.text} strokeWidth={2.2} />
            </View>
            <ThemedText style={styles.title} accessibilityRole="header">Please Update OnMyLead</ThemedText>
            <ThemedText style={styles.text}>
              This version ({appVersion()}) has a problem that&apos;s fixed in version {state.minimum} or newer, which is in {store} now. Updating keeps all your rides, groups and settings.
            </ThemedText>
            <Button title="Update Now" big onPress={openStore} style={{ alignSelf: 'stretch' }} />
            <Button
              title="Not Now"
              kind="ghost"
              onPress={() => {
                notNow = true;
                setHidden(true);
              }}
              style={{ alignSelf: 'stretch' }}
            />
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              On a ride with no signal? Tap Not Now. Ride Mode and Help and SOS keep working, and we&apos;ll ask again next time you open the app.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = themedStyles(() => ({
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: Colors.background, zIndex: 1000, elevation: 1000 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four },
  // Phones and tablets alike: a centred column, never stretched across an iPad or Android tablet.
  inner: { width: '100%', maxWidth: 460, alignSelf: 'center', alignItems: 'center', gap: Spacing.three },
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font(800, 'display'), fontSize: 32, lineHeight: 36, color: Colors.text, textAlign: 'center' },
  text: { fontFamily: font(500), fontSize: 17, lineHeight: 24, color: Colors.text, textAlign: 'center' },
}));
