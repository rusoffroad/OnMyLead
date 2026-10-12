import { router } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { updatePassword, useSession } from '@/lib/session';

/** The password-reset email lands here, already signed in for this one step. */
export default function ResetPassword() {
  const { session, loading } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <Screen>
        <ThemedText>Opening your reset link…</ThemedText>
      </Screen>
    );
  }
  if (!session) {
    return (
      <Screen>
        <ThemedText type="subtitle">This Link Has Expired</ThemedText>
        <ThemedText>Ask for a new reset link from the sign-in screen, and open it on this device.</ThemedText>
        <Button title="Back to Sign In" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }
  return (
    <Screen>
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
