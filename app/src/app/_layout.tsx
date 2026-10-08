import { Barlow_400Regular } from '@expo-google-fonts/barlow/400Regular';
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { Barlow_700Bold } from '@expo-google-fonts/barlow/700Bold';
import { Barlow_800ExtraBold } from '@expo-google-fonts/barlow/800ExtraBold';
import { BarlowCondensed_500Medium } from '@expo-google-fonts/barlow-condensed/500Medium';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { MessageAlerts } from '@/components/message-alerts';
import { Colors, font, NavigationColors } from '@/constants/theme';
// Registers the background location task at startup, before any screen mounts.
import '@/lib/location';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 400, fade: true });

// The logo stays up for a moment on every cold start, even when the app is ready sooner.
const SPLASH_MIN_MS = 1800;
const launchedAt = Date.now();

const theme: Theme = { ...DarkTheme, dark: true, colors: { ...DarkTheme.colors, ...NavigationColors } };

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, Barlow_800ExtraBold,
    BarlowCondensed_500Medium, BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold,
  });
  const ready = loaded || !!error;

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), Math.max(0, SPLASH_MIN_MS - (Date.now() - launchedAt)));
    return () => clearTimeout(t);
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={theme}>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontFamily: font(700, 'display'), fontSize: 21, color: Colors.text },
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="index" options={{ title: 'OnMyLead', headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: 'Welcome', presentation: 'modal' }} />
        <Stack.Screen name="reset-password" options={{ title: 'New password' }} />
        <Stack.Screen name="ride/new" options={{ title: 'Create a ride' }} />
        <Stack.Screen name="r/[code]" options={{ title: '' }} />
        <Stack.Screen name="find" options={{ title: 'Find a ride' }} />
        <Stack.Screen name="ride/[id]/live" options={{ title: 'Ride Mode', headerShown: false }} />
        <Stack.Screen name="garage/index" options={{ title: 'Garage' }} />
        <Stack.Screen name="garage/new" options={{ title: 'Add to garage' }} />
        <Stack.Screen name="garage/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="garage/[id]/edit" options={{ title: 'Edit machine' }} />
        <Stack.Screen name="trips/index" options={{ title: 'Trip planner' }} />
        <Stack.Screen name="trips/new" options={{ title: 'New trip' }} />
        <Stack.Screen name="trips/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="trips/[id]/edit" options={{ title: 'Edit trip' }} />
        <Stack.Screen name="starlink" options={{ title: 'Starlink' }} />
        <Stack.Screen name="share" options={{ title: 'Share my location' }} />
        <Stack.Screen name="f/[token]" options={{ title: 'Shared location' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
      </Stack>
      <MessageAlerts />
    </ThemeProvider>
  );
}
