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
import { DarkTheme, Stack, ThemeProvider, useSegments, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { DirectionsHost } from '@/components/directions';
import { MessageAlerts } from '@/components/message-alerts';
import { ProGateHost } from '@/components/pro-gate';
import { Colors, font, NavigationColors } from '@/constants/theme';
// Starts crash reporting before anything else can fail (off when no DSN is set).
import { setCrashScreen, withCrashReporting } from '@/lib/crash';
import { startAppSettings } from '@/lib/app-settings';
import { startEntitlements } from '@/lib/entitlements';
import { startOrientationRule } from '@/lib/orientation';
// Registers the background location task at startup, before any screen mounts.
import '@/lib/location';
import { startPurchaseUpdates } from '@/lib/purchases';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 400, fade: true });

// The logo stays up for a moment on every cold start, even when the app is ready sooner.
const SPLASH_MIN_MS = 1800;
const launchedAt = Date.now();

// On the phone apps, Home sits under any screen opened straight from a notification or a link, so
// Back returns to it instead of leaving the app. The website keeps its own history.
export const unstable_settings = Platform.OS === 'web' ? {} : { initialRouteName: '(tabs)' };

const theme: Theme = { ...DarkTheme, dark: true, colors: { ...DarkTheme.colors, ...NavigationColors } };

function RootLayout() {
  const [loaded, error] = useFonts({
    Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, Barlow_800ExtraBold,
    BarlowCondensed_500Medium, BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold,
  });
  const ready = loaded || !!error;
  // The route pattern ("ride/[id]/live"), not the path, so reports group by screen.
  const screen = '/' + useSegments().join('/');

  useEffect(() => setCrashScreen(screen), [screen]);
  // The rider's plan (Free, Pro Trial, Pro, Admin), kept fresh for every screen.
  useEffect(() => startEntitlements(), []);
  // The owner's announcement, maintenance notice and feature flags.
  useEffect(() => startAppSettings(), []);
  // Phones stay upright, tablets turn (Android; the Apple app does this in its Info.plist).
  useEffect(() => startOrientationRule(), []);

  // Pro renewals, offer codes and unfinished purchases StoreKit hands back at launch.
  useEffect(() => {
    if (ready) startPurchaseUpdates();
  }, [ready]);

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
        <Stack.Screen name="(tabs)" options={{ title: 'OnMyLead', headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: 'Welcome', presentation: 'modal' }} />
        <Stack.Screen name="reset-password" options={{ title: 'New Password' }} />
        <Stack.Screen name="ride/new" options={{ title: 'Create a Ride' }} />
        <Stack.Screen name="r/[code]" options={{ title: '' }} />
        <Stack.Screen name="ride/[id]/live" options={{ title: 'Ride Mode', headerShown: false }} />
        <Stack.Screen name="ride/[id]/route" options={{ title: 'Route', headerShown: false }} />
        <Stack.Screen name="ride/[id]/waypoints" options={{ title: 'Waypoints', headerShown: false }} />
        <Stack.Screen name="garage/index" options={{ title: 'Garage' }} />
        <Stack.Screen name="garage/new" options={{ title: 'Add to Garage' }} />
        <Stack.Screen name="garage/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="garage/[id]/edit" options={{ title: 'Edit Machine' }} />
        <Stack.Screen name="trips/index" options={{ title: 'Trip Planner' }} />
        <Stack.Screen name="trips/new" options={{ title: 'New Trip' }} />
        <Stack.Screen name="trips/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="trips/[id]/edit" options={{ title: 'Edit Trip' }} />
        <Stack.Screen name="starlink" options={{ title: 'Starlink' }} />
        <Stack.Screen name="ride-name" options={{ title: 'Your Ride Name' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="blocked" options={{ title: 'Blocked Riders' }} />
        <Stack.Screen name="pro" options={{ title: '' }} />
        <Stack.Screen name="subscription" options={{ title: 'Subscription' }} />
        <Stack.Screen name="maps/index" options={{ title: 'Offline Maps' }} />
        <Stack.Screen name="maps/area" options={{ title: 'Pick an Area', headerShown: false }} />
        <Stack.Screen name="share" options={{ title: 'Share My Location' }} />
        <Stack.Screen name="f/[token]" options={{ title: 'Shared Location' }} />
        <Stack.Screen name="groups/new" options={{ title: 'New Group' }} />
        <Stack.Screen name="groups/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="groups/[id]/chat" options={{ title: 'Group Chat', headerShown: false }} />
        <Stack.Screen name="g/[code]" options={{ title: 'Riding Group' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ title: '' }} />
        <Stack.Screen name="privacy" options={{ title: '' }} />
        <Stack.Screen name="support" options={{ title: '' }} />
        <Stack.Screen name="contact" options={{ title: '' }} />
        <Stack.Screen name="admin" options={{ title: 'OnMyLead Admin', headerShown: false }} />
      </Stack>
      <MessageAlerts />
      <ProGateHost />
      <DirectionsHost />
    </ThemeProvider>
  );
}

export default withCrashReporting(RootLayout);
