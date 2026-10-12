import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { TabBar } from '@/components/tab-bar';
import { Colors, font } from '@/constants/theme';
import { useFlag } from '@/lib/app-settings';
import { useSession } from '@/lib/session';

/**
 * The app's four homes: Rides, Find, Groups and You. Every other screen (a ride, the Garage,
 * settings) opens full screen on top of these and comes back here.
 */
export default function TabsLayout() {
  const { session } = useSession();
  const findOn = useFlag('find_a_ride');
  // On onmylead.com, signed-out visitors get the showcase homepage with no app chrome.
  const showBar = Platform.OS !== 'web' || !!session;

  return (
    <Tabs
      tabBar={(props) => (showBar ? <TabBar {...props} hidden={findOn ? [] : ['find']} signedIn={!!session} /> : null)}
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleAlign: 'left',
        headerTitleStyle: { fontFamily: font(800, 'display'), fontSize: 30, color: Colors.text },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'OnMyLead', headerShown: false }} />
      <Tabs.Screen name="find" options={{ title: 'Find a Ride' }} />
      <Tabs.Screen name="groups" options={{ title: 'Riding Groups' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}
