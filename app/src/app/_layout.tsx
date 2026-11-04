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
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { DirectionsHost } from '@/components/directions';
import { MessageAlerts } from '@/components/message-alerts';
import { ProGateHost } from '@/components/pro-gate';
import { TabletProGate } from '@/components/tablet-pro-gate';
import { RiderAgreementGate } from '@/components/rider-agreement';
import { UpdateRequired } from '@/components/update-required';
import { Colors, currentScheme, font, NavigationColors } from '@/constants/theme';
// Starts crash reporting before anything else can fail (off when no DSN is set).
import { setCrashScreen, withCrashReporting } from '@/lib/crash';
import { logScreen, startAppLog } from '@/lib/app-log';
import { startAppearance, takeReturnPath, useAppearance } from '@/lib/appearance';
import { startAppSettings } from '@/lib/app-settings';
import { startEntitlements } from '@/lib/entitlements';
import { startOrientationRule } from '@/lib/orientation';
// Registers the background location task at startup, before any screen mounts.
import '@/lib/location';
import { startPurchaseUpdates } from '@/lib/purchases';
import { startReferrals } from '@/lib/referrals';
import { startRiderAgreement } from '@/lib/rider-agreement';
import { startSettingsSync } from '@/lib/settings-sync';
import { startAppearanceSync } from '@/lib/appearance-sync';
import { startLanguageSync } from '@/lib/language-sync';
import { backupTrailsNow } from '@/lib/trail-backup';
import { t, takeLanguageReturnPath, useLanguage } from '@/lib/i18n';

// The activity log a bug report carries: errors, failed requests, screens (lib/app-log.ts).
startAppLog();
// The rider's theme (Dark / Light / Match Phone, Color Blind Mode), before anything draws.
startAppearance();

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 400, fade: true });

// The logo stays up for a moment on every cold start, even when the app is ready sooner.
const SPLASH_MIN_MS = 1800;
const launchedAt = Date.now();

// On the phone apps, Home sits under any screen opened straight from a notification or a link, so
// Back returns to it instead of leaving the app. The website keeps its own history.
export const unstable_settings = Platform.OS === 'web' ? {} : { initialRouteName: '(tabs)' };

function navigationTheme(): Theme {
  const base = currentScheme() === 'light' ? DefaultTheme : DarkTheme;
  return { ...base, dark: currentScheme() === 'dark', colors: { ...base.colors, ...NavigationColors } };
}

function RootLayout() {
  const [loaded, error] = useFonts({
    Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, Barlow_800ExtraBold,
    BarlowCondensed_500Medium, BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold,
  });
  const ready = loaded || !!error;
  // The route pattern ("ride/[id]/live"), not the path, so reports group by screen.
  const screen = '/' + useSegments().join('/');
  // Every colour comes from the rider's theme; when it changes, the app redraws from the top.
  const { version } = useAppearance();
  // The same for the language: a new one redraws every screen in it.
  const { version: langVersion } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    // The redraw starts the phone apps on Home: go back to the screen the change was made on.
    const to = takeReturnPath() ?? takeLanguageReturnPath();
    if (!to || Platform.OS === 'web') return;
    const t = setTimeout(() => {
      router.navigate('/profile');
      router.push(to as never);
    }, 0);
    return () => clearTimeout(t);
  }, [version, langVersion, router]);

  useEffect(() => {
    setCrashScreen(screen);
    logScreen(screen);
  }, [screen]);
  // The rider's plan (Free, Pro Trial, Pro, Admin), kept fresh for every screen.
  useEffect(() => startEntitlements(), []);
  // The owner's announcement, maintenance notice, feature flags and release controls.
  useEffect(() => startAppSettings(), []);
  // Phones stay upright, tablets turn (Android; the Apple app does this in its Info.plist).
  useEffect(() => startOrientationRule(), []);
  // Who has agreed to the Rider Safety and Liability Agreement, and sending each record to the server.
  useEffect(() => startRiderAgreement(), []);
  // A friend link opened before signing up counts as an invite once the new account signs in.
  useEffect(() => startReferrals(), []);
  // Settings and Map Mode trails follow the account to the rider's other devices.
  useEffect(() => {
    startAppearanceSync();
    startLanguageSync();
    startSettingsSync(backupTrailsNow);
  }, []);

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
    <ThemeProvider key={`${version}.${langVersion}`} value={navigationTheme()}>
      <StatusBar style={currentScheme() === 'light' ? 'dark' : 'light'} />
      <Stack
        // A function, so the header picks up the new theme when the app redraws.
        screenOptions={() => ({
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontFamily: font(700, 'display'), fontSize: 21, color: Colors.text },
          contentStyle: { backgroundColor: Colors.background },
        })}>
        <Stack.Screen name="(tabs)" options={{ title: 'OnMyLead', headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: t('Welcome'), presentation: 'modal' }} />
        <Stack.Screen name="reset-password" options={{ title: t('New Password') }} />
        <Stack.Screen name="ride/new" options={{ title: t('Create a Ride') }} />
        <Stack.Screen name="r/[code]" options={{ title: '' }} />
        <Stack.Screen name="invite-friends" options={{ title: t('Invite Friends') }} />
        <Stack.Screen name="events/index" options={{ title: t('Events') }} />
        <Stack.Screen name="events/new" options={{ title: t('Create an Event') }} />
        <Stack.Screen name="e/[code]" options={{ title: '' }} />
        <Stack.Screen name="ride/[id]/live" options={{ title: t('Ride Mode'), headerShown: false }} />
        <Stack.Screen name="ride/[id]/route" options={{ title: t('Route'), headerShown: false }} />
        <Stack.Screen name="ride/[id]/waypoints" options={{ title: t('Waypoints'), headerShown: false }} />
        <Stack.Screen name="garage/index" options={{ title: t('Garage') }} />
        <Stack.Screen name="garage/new" options={{ title: t('Add to Garage') }} />
        <Stack.Screen name="garage/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="garage/[id]/edit" options={{ title: t('Edit Machine') }} />
        <Stack.Screen name="trips/index" options={{ title: t('Trip Planner') }} />
        <Stack.Screen name="trips/new" options={{ title: t('New Trip') }} />
        <Stack.Screen name="trips/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="trips/[id]/edit" options={{ title: t('Edit Trip') }} />
        <Stack.Screen name="starlink" options={{ title: 'Starlink' }} />
        <Stack.Screen name="ride-name" options={{ title: t('Your Name and Picture') }} />
        <Stack.Screen name="inbox" options={{ title: t('Notifications') }} />
        <Stack.Screen name="notifications" options={{ title: t('Notification Settings') }} />
        <Stack.Screen name="badges" options={{ title: t('Badges') }} />
        <Stack.Screen name="leaderboard" options={{ title: t('Leaderboard') }} />
        <Stack.Screen name="leaderboard-area" options={{ title: t('Where You Ride') }} />
        <Stack.Screen name="blocked" options={{ title: t('Blocked Riders') }} />
        <Stack.Screen name="report-rider" options={{ title: t('Report a Rider') }} />
        <Stack.Screen name="battery" options={{ title: t('Battery Saver') }} />
        <Stack.Screen name="appearance" options={{ title: t('Appearance') }} />
        <Stack.Screen name="language" options={{ title: t('Language') }} />
        <Stack.Screen name="tilt" options={{ title: t('Tilt') }} />
        <Stack.Screen name="voice" options={{ title: t('Voice') }} />
        <Stack.Screen name="pro" options={{ title: '' }} />
        <Stack.Screen name="subscription" options={{ title: t('Subscription') }} />
        <Stack.Screen name="maps/index" options={{ title: t('Offline Maps') }} />
        <Stack.Screen name="maps/area" options={{ title: t('Pick an Area'), headerShown: false }} />
        <Stack.Screen name="nav/index" options={{ title: t('Map Mode'), headerShown: false }} />
        <Stack.Screen name="nav/trails" options={{ title: t('My Trails') }} />
        <Stack.Screen name="nav/trail/[id]" options={{ title: t('Trail') }} />
        <Stack.Screen name="nav/public/[id]" options={{ title: t('Rider Trail') }} />
        <Stack.Screen name="share" options={{ title: t('Share My Location') }} />
        <Stack.Screen name="f/[token]" options={{ title: t('Shared Location') }} />
        <Stack.Screen name="groups/new" options={{ title: t('New Group') }} />
        <Stack.Screen name="groups/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="groups/[id]/chat" options={{ title: t('Group Chat'), headerShown: false }} />
        <Stack.Screen name="out-riding" options={{ title: t('Out Riding') }} />
        <Stack.Screen name="messages/index" options={{ title: t('Messages') }} />
        <Stack.Screen name="messages/[id]" options={{ title: t('Message'), headerShown: false }} />
        <Stack.Screen name="g/[code]" options={{ title: t('Riding Group') }} />
        <Stack.Screen name="friends" options={{ title: t('Friends') }} />
        <Stack.Screen name="friend/[code]" options={{ title: t('Add Friend') }} />
        <Stack.Screen name="social/index" options={{ title: t('Social') }} />
        <Stack.Screen name="social/item" options={{ title: t('Post'), headerShown: false }} />
        <Stack.Screen name="social/new" options={{ title: t('New Post'), presentation: 'modal' }} />
        <Stack.Screen name="social/rider/[id]" options={{ title: '' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ title: '' }} />
        <Stack.Screen name="privacy" options={{ title: '' }} />
        <Stack.Screen name="rider-agreement" options={{ title: '' }} />
        <Stack.Screen name="support" options={{ title: '' }} />
        <Stack.Screen name="contact" options={{ title: '' }} />
        <Stack.Screen name="admin" options={{ title: 'OnMyLead Admin', headerShown: false }} />
      </Stack>
      <MessageAlerts />
      {/* iPad, Android tablets and the website are Pro; joining and Ride Mode stay open. */}
      <TabletProGate />
      <ProGateHost />
      <DirectionsHost />
      {/* Before You Ride: the safety and liability agreement, until the rider agrees. */}
      <RiderAgreementGate />
      {/* The owner's minimum version (Admin Dashboard > Releases), over everything, with Not Now. */}
      <UpdateRequired />
    </ThemeProvider>
  );
}

export default withCrashReporting(RootLayout);
