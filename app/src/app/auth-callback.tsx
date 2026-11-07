import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';

import { Logo } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { afterAuthLink, androidAuthHandoff, appAuthLink, askedInApp, authLinkDone, authLinkError, parseAuthLink, type AuthLink } from '@/core/auth-link';
import { isAppleMobile } from '@/core/ride-link';
import { track } from '@/lib/analytics';
import { completeAuthLink } from '@/lib/session';
import { supabase } from '@/lib/supabase';

import { t as tr } from '@/lib/i18n';
type Next = State | { step: 'go'; to: '/' | '/reset-password' };

/** Signs in with the link and says where the screen goes next. */
async function runLink(link: AuthLink): Promise<Next> {
  const to = afterAuthLink(link);
  try {
    await completeAuthLink(link);
  } catch (e) {
    const { data } = await supabase.auth.getSession();
    // Opened twice, or already signed in on this device: nothing is lost.
    if (data.session) return { step: 'go', to };
    // The built-in email's code only works where the rider asked for it. Supabase has already
    // confirmed the email by now, so all that's left is to sign in here.
    if (link.kind === 'code') return { step: 'elsewhere' };
    return { step: 'failed', message: authLinkError((e as { code?: string }).code ?? null, e instanceof Error ? e.message : null) };
  }
  track('auth_link', { type: link.kind === 'token' ? link.type : link.kind });
  const type = link.kind === 'token' ? link.type : null;
  if (to === '/' && (type === 'signup' || type === 'invite' || type === 'email_change')) return { step: 'done', ...authLinkDone(type), to };
  return { step: 'go', to };
}

/**
 * Goes on from the link. A sign-in link is usually tapped while the sign-in sheet is still open,
 * and this screen opens on top of it, so close everything over Home first; otherwise Home ends up
 * drawn inside the sheet (a floating card on iPad).
 */
function leave(to: '/' | '/reset-password') {
  if (!router.canDismiss()) return router.replace(to);
  router.dismissAll();
  if (to !== '/') router.push(to);
}

type State =
  | { step: 'working' }
  | { step: 'choose' }
  | { step: 'done'; title: string; body: string; to: '/' | '/reset-password' }
  | { step: 'elsewhere' }
  | { step: 'failed'; message: string };

/**
 * Every emailed link (confirm your email, sign-in link, reset password, new email) and every
 * Google or Facebook sign-in lands here, in the app or on the website (see core/auth-link.ts).
 * On an iPhone browser a branded link first offers the app, since the token can only be used once.
 * An Android browser is sent straight on to the app with an intent URL (see androidAuthHandoff),
 * which falls back to this page with web=1 when the app isn't installed; the same choice stays on
 * screen in case the browser holds the hand-off back.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<Record<string, string>>();
  const [link] = useState<AuthLink>(() => parseAuthLink(params));
  const [iphoneWeb] = useState(() => Platform.OS === 'web' && isAppleMobile(typeof navigator === 'undefined' ? null : navigator.userAgent));
  const [androidIntent] = useState(() =>
    Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined'
      ? androidAuthHandoff(window.location.href, navigator.userAgent)
      : null,
  );
  const [state, setState] = useState<State>(() =>
    link.kind === 'error'
      ? { step: 'failed', message: link.message }
      : link.kind === 'token' && (iphoneWeb || androidIntent)
        ? { step: 'choose' }
        : { step: 'working' },
  );
  const openApp = () => (androidIntent ? window.location.assign(androidIntent) : Linking.openURL(appAuthLink(link)));
  const started = useRef(false);

  const finish = () => {
    if (started.current) return;
    started.current = true;
    runLink(link).then((next) => (next.step === 'go' ? leave(next.to) : setState(next)));
  };

  useEffect(() => {
    if (androidIntent) window.location.replace(androidIntent);
    // Asked for in the app but opened in a browser (Gmail and other mail apps do this): open the app.
    else if (iphoneWeb && askedInApp(params)) Linking.openURL(appAuthLink(link)).catch(() => {});
    if (state.step === 'working') finish();
    // Runs once, for the link this screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Email Confirmed" stays up just long enough to read, then the app carries on.
  useEffect(() => {
    if (state.step !== 'done') return;
    const t = setTimeout(() => leave(state.to), 1800);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <Screen top>
      <View style={{ alignItems: 'center', paddingTop: Spacing.five, gap: Spacing.four }}>
        <Logo height={96} />
      </View>
      {state.step === 'working' ? (
        <View style={{ alignItems: 'center', gap: Spacing.three }}>
          <ActivityIndicator color={Colors.text} />
          <ThemedText>{tr('Signing you in…')}</ThemedText>
        </View>
      ) : null}

      {state.step === 'choose' ? (
        <Card style={{ gap: Spacing.three, borderLeftWidth: 4, borderLeftColor: Colors.accent }}>
          <ThemedText type="subtitle">{tr('Open OnMyLead')}</ThemedText>
          <ThemedText themeColor="textSecondary">{tr('Finish signing in inside the app, or carry on here in the browser.')}</ThemedText>
          <Button title={tr('Open in the App')} big onPress={openApp} />
          <Button
            title={tr('Continue on the Website')}
            kind="secondary"
            onPress={() => {
              setState({ step: 'working' });
              finish();
            }}
          />
        </Card>
      ) : null}

      {state.step === 'done' ? (
        <Card style={{ gap: Spacing.two, borderLeftWidth: 4, borderLeftColor: Colors.sky }}>
          <ThemedText type="subtitle" accessibilityLiveRegion="polite">{state.title}</ThemedText>
          <ThemedText themeColor="textSecondary">{tr(state.body)}</ThemedText>
          <Button title={tr('Let’s Ride')} onPress={() => leave(state.to)} />
        </Card>
      ) : null}

      {state.step === 'elsewhere' ? (
        <Card style={{ gap: Spacing.three, borderLeftWidth: 4, borderLeftColor: Colors.sky }}>
          <ThemedText type="subtitle">{tr('Your Email Is Confirmed')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {tr('This link opened somewhere other than where you signed up, so sign in once more with your email and password.')}
          </ThemedText>
          {iphoneWeb ? <Button title={tr('Open in the App')} big onPress={() => Linking.openURL(appAuthLink(link))} /> : null}
          <Button title={tr('Sign In')} kind={iphoneWeb ? 'secondary' : 'primary'} big={!iphoneWeb} onPress={() => router.replace('/sign-in')} />
        </Card>
      ) : null}

      {state.step === 'failed' ? (
        <Card style={{ gap: Spacing.three, borderLeftWidth: 4, borderLeftColor: Colors.danger }}>
          <ThemedText type="subtitle">{tr('That Link Didn’t Work')}</ThemedText>
          <ThemedText themeColor="textSecondary">{state.message}</ThemedText>
          <Button title={tr('Back to Sign In')} onPress={() => router.replace('/sign-in')} />
        </Card>
      ) : null}
    </Screen>
  );
}
