import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { parseAuthLink } from '@/core/auth-link';
import { completeAuthLink, updatePassword, useSession } from '@/lib/session';

/**
 * The password-reset email lands here (Supabase's built-in email), or on /auth-callback first (our
 * branded one). Either way the link signs the rider in for this one step.
 */
export default function ResetPassword() {
  const params = useLocalSearchParams<Record<string, string>>();
  const { session, loading: sessionLoading } = useSession();
  const [linking, setLinking] = useState(() => parseAuthLink(params, { reset: true }).kind !== 'none');
  useEffect(() => {
    const link = parseAuthLink(params, { reset: true });
    if (link.kind === 'none') return;
    completeAuthLink(link)
      .catch(() => {})
      .finally(() => setLinking(false));
    // Runs once, for the link this screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const loading = sessionLoading || linking;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <Screen width="readable">
        <ThemedText>Opening your reset link…</ThemedText>
      </Screen>
    );
  }
  if (!session) {
    return (
      <Screen width="readable">
        <ThemedText type="subtitle">This Link Has Expired</ThemedText>
        <ThemedText>Ask for a new reset link from the sign-in screen, and open it on this device.</ThemedText>
        <Button title="Back to Sign In" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }
  return (
    <Screen width="readable">
      <ThemedText type="subtitle">Choose a New Password</ThemedText>
      <Field label="New Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" />
      <Button
        title="Save Password"
        loading={busy}
        disabled={password.length < 8}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await updatePassword(password);
            router.replace('/');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong.');
          } finally {
            setBusy(false);
          }
        }}
      />
      <ErrorText error={error} />
    </Screen>
  );
}
