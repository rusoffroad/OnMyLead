import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

// Registers the background location task at startup, before any screen mounts.
import '@/lib/location';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ title: 'Rides' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
        <Stack.Screen name="ride/new" options={{ title: 'Create a ride' }} />
        <Stack.Screen name="r/[code]" options={{ title: 'Ride' }} />
        <Stack.Screen name="ride/[id]/live" options={{ title: 'Ride Mode', headerShown: false }} />
        <Stack.Screen name="garage/index" options={{ title: 'Garage' }} />
        <Stack.Screen name="garage/new" options={{ title: 'Add to garage' }} />
        <Stack.Screen name="garage/[id]/index" options={{ title: 'Vehicle' }} />
        <Stack.Screen name="garage/[id]/edit" options={{ title: 'Edit machine' }} />
        <Stack.Screen name="trips/index" options={{ title: 'Trip planner' }} />
        <Stack.Screen name="trips/new" options={{ title: 'New trip' }} />
        <Stack.Screen name="trips/[id]/index" options={{ title: 'Trip' }} />
        <Stack.Screen name="trips/[id]/edit" options={{ title: 'Edit trip' }} />
        <Stack.Screen name="share" options={{ title: 'Share my location' }} />
        <Stack.Screen name="f/[token]" options={{ title: 'Shared location' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
