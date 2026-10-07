import { Redirect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';
import { useSession } from '@/lib/session';

/**
 * OAuth and the emailed sign-in link land here. The Supabase client reads the code from the URL
 * on its own; wait for the session before leaving so the code is not dropped mid-exchange.
 */
export default function AuthCallback() {
  const { session, loading } = useSession();
  if (session || !loading) return <Redirect href="/" />;
  return (
    <Screen>
      <ThemedText>Signing you in…</ThemedText>
    </Screen>
  );
}
