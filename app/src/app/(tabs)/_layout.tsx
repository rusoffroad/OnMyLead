import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { TabBar } from '@/components/tab-bar';
import { Colors, font } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { useFlag } from '@/lib/app-settings';
import { useSession } from '@/lib/session';
import { t } from '@/lib/i18n';

/**
 * The app's homes (3.0, approved mock v4): Home, Rides, Map Mode, Events and Social. Every other
 * screen (a ride, the Garage, settings) opens full screen on top of these and comes back here. On a
 * phone they sit in a bar at the bottom with Map Mode as the raised blue key in the middle; on a
 * tablet (or a wide window) in a rail down the left edge, with You at the end. Riding Groups live
 * inside Social, and You opens from your photo at the top of Home.
 */
export default function TabsLayout() {
  const { session } = useSession();
  const findOn = useFlag('find_a_ride');
  const mapOn = useFlag('nav_mode');
  // On onmylead.com, signed-out visitors get the showcase homepage with no app chrome.
  const showBar = Platform.OS !== 'web' || !!session;
  const { wide } = useLayout();

  return (
    <Tabs
      tabBar={(props) => (showBar ? <TabBar {...props} hidden={findOn ? [] : ['find']} signedIn={!!session} rail={wide} map={mapOn} /> : null)}
      screenOptions={{
        tabBarPosition: wide ? 'left' : 'bottom',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleAlign: 'left',
        headerTitleStyle: { fontFamily: font(800, 'display'), fontSize: 30, color: Colors.text },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'OnMyLead', headerShown: false }} />
      <Tabs.Screen name="find" options={{ title: t('Rides Near You') }} />
      <Tabs.Screen name="events-tab" options={{ title: t('Events and Group Rides') }} />
      <Tabs.Screen name="social-tab" options={{ title: t('Social') }} />
      <Tabs.Screen name="groups" options={{ title: t('Riding Groups') }} />
      <Tabs.Screen name="profile" options={{ title: t('You') }} />
    </Tabs>
  );
}
