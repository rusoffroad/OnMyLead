import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { LogoBanner } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { track } from '@/lib/analytics';
import { sendCode, signInWithProvider, verifyCode, type SocialProvider } from '@/lib/session';

export default function SignIn() {
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  const social = (p: SocialProvider) =>
    run(p, async () => {
      await signInWithProvider(p);
      track('sign_in', { method: p });
      if (router.canGoBack()) router.back();
    });

  // Apple's rules expect Sign in with Apple wherever Google or Facebook sign-in is offered.
  const providers: { id: SocialProvider; title: string }[] = [
    ...(Platform.OS !== 'android' ? [{ id: 'apple' as const, title: 'Continue with Apple' }] : []),
    { id: 'google', title: 'Continue with Google' },
    { id: 'facebook', title: 'Continue with Facebook' },
  ];

  return (
    <Screen>
      <LogoBanner />
      <ThemedText type="subtitle">Join the ride</ThemedText>
      {providers.map((p) => (
        <Button key={p.id} title={p.title} kind="secondary" loading={busy === p.id} onPress={() => social(p.id)} />
      ))}
      <ThemedText themeColor="textSecondary">or use your phone number or email</ThemedText>
      <Field label="Phone or email" value={target} onChangeText={setTarget} autoCapitalize="none" keyboardType="email-address" placeholder="+1 555 123 4567 or you@example.com" />
      {!sent ? (
        <Button title="Send code" loading={busy === 'send'} disabled={!target.trim()} onPress={() => run('send', async () => { await sendCode(target.trim()); setSent(true); })} />
      ) : (
        <>
          <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" />
          <Button
            title="Sign in"
            loading={busy === 'verify'}
            disabled={code.length < 6}
            onPress={() => run('verify', async () => {
              await verifyCode(target.trim(), code.trim());
              track('sign_in', { method: target.includes('@') ? 'email' : 'phone' });
              if (router.canGoBack()) router.back();
            })}
          />
        </>
      )}
      <ErrorText error={error} />
    </Screen>
  );
}
