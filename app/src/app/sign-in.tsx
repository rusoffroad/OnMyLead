import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Logo } from '@/components/logo';
import { SocialButton } from '@/components/social-button';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen, Segmented } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { signInWithApple } from '@/lib/apple-sign-in';
import { nativeGoogleReady, signInWithGoogleNative } from '@/lib/google-sign-in';
import {
  sendCode,
  sendPasswordReset,
  signInWithPassword,
  signInWithProvider,
  signUpWithPassword,
  useSocialProviders,
  type SocialProvider,
} from '@/lib/session';

type Mode = 'sign_in' | 'create';

export default function SignIn() {
  const params = useLocalSearchParams<{ mode?: string; next?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'create' ? 'create' : 'sign_in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(friendly(e instanceof Error ? e.message : 'Something went wrong.'));
    } finally {
      setBusy(null);
    }
  }

  // `next` (a page on this site, like /ride/new) is where the website sends someone after signing in.
  const next = typeof params.next === 'string' && /^\/(?!\/)[\w\-/?=&.]*$/.test(params.next) ? params.next : null;
  const done = () => (next ? router.replace(next as Href) : router.canGoBack() ? router.back() : router.replace('/'));
  const cleanEmail = email.trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

  const submit = () =>
    run('submit', async () => {
      if (mode === 'create') {
        const { needsConfirmation } = await signUpWithPassword(cleanEmail, password, name.trim());
        track('sign_up', { method: 'password' });
        if (needsConfirmation) {
          setNotice(`Almost done. We sent a link to ${cleanEmail}. Tap it on this device to confirm your email, and you'll be signed in.`);
          return;
        }
      } else {
        await signInWithPassword(cleanEmail, password);
        track('sign_in', { method: 'password' });
      }
      done();
    });

  // Only the providers switched on in Supabase show (Apple first, as Apple's guideline 4.8 expects).
  const providers = useSocialProviders();
  const social = (p: SocialProvider) =>
    run(p, async () => {
      // The website leaves for the provider's page here and comes back on /auth-callback.
      const result =
        p === 'apple' && Platform.OS === 'ios'
          ? await signInWithApple()
          : p === 'google' && nativeGoogleReady
            ? await signInWithGoogleNative()
            : await signInWithProvider(p);
      if (result !== 'signed_in') return;
      track('sign_in', { method: p });
      done();
    });

  return (
    <Screen width="readable">
      <Logo height={104} />
      <Segmented<Mode>
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          setNotice(null);
        }}
        options={[
          { value: 'sign_in', label: 'Sign In' },
          { value: 'create', label: 'Create Account' },
        ]}
      />

      {providers.length ? (
        <>
          <View style={{ gap: Spacing.two }}>
            {providers.map((p) => (
              <SocialButton key={p} provider={p} loading={busy === p} disabled={!!busy && busy !== p} onPress={() => social(p)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }} accessibilityRole="text">
            <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
            <ThemedText type="small" themeColor="textSecondary">{mode === 'create' ? 'Or Create One With Your Email' : 'Or Use Your Email'}</ThemedText>
            <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
          </View>
        </>
      ) : null}

      {mode === 'create' ? (
        <Field label="Your Name" value={name} onChangeText={setName} placeholder="What riders will see" autoComplete="name" />
      ) : null}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
        placeholder={mode === 'create' ? 'At least 8 characters' : ''}
      />
      <Button
        title={mode === 'create' ? 'Create Account' : 'Sign In'}
        big
        loading={busy === 'submit'}
        disabled={!emailOk || password.length < (mode === 'create' ? 8 : 1) || (mode === 'create' && !name.trim())}
        onPress={submit}
      />

      {mode === 'sign_in' ? (
        <Pressable
          accessibilityRole="button"
          disabled={!emailOk}
          style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={() =>
            run('reset', async () => {
              await sendPasswordReset(cleanEmail);
              setNotice(`We sent a link to ${cleanEmail} to set a new password.`);
            })
          }>
          <ThemedText type="link" style={{ color: emailOk ? Colors.sky : Colors.textSecondary }}>
            {emailOk ? 'Forgot your password? Email me a reset link' : 'Forgot your password? Enter your email above first'}
          </ThemedText>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!emailOk}
        style={{ minHeight: 44, justifyContent: 'center' }}
        onPress={() =>
          run('link', async () => {
            await sendCode(cleanEmail);
            track('sign_in_link_sent', {});
            setNotice(`We sent a sign-in link to ${cleanEmail}. Tap it on this device. No password needed, and it creates your account if you're new.`);
          })
        }>
        <ThemedText type="link" style={{ color: emailOk ? Colors.sky : Colors.textSecondary }}>
          {emailOk ? 'Or email me a sign-in link instead (no password)' : 'Or enter your email to get a sign-in link instead'}
        </ThemedText>
      </Pressable>

      {notice ? (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: Colors.sky }}>
          <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText>
        </Card>
      ) : null}
      <ErrorText error={error} />

    </Screen>
  );
}

/** Supabase's messages, in plain words. */
function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match. Try again, or use the reset link.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first. Tap the link we sent you, then sign in.';
  if (/already registered|already exists/i.test(message)) return 'There’s already an account with that email. Switch to Sign In.';
  if (/rate limit|too many/i.test(message)) return 'Too many emails sent just now. Wait a few minutes and try again.';
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return 'Pick a longer password (at least 8 characters).';
  return message;
}
