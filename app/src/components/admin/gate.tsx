import type { Session } from '@supabase/supabase-js';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from 'react-native';

import { Logo } from '@/components/logo';
import { font } from '@/constants/theme';
import { signInWithPassword, signOut } from '@/lib/session';
import { isBackendConfigured, supabase } from '@/lib/supabase';
import { AdminButton } from './button';
import { AdminColors } from './tokens';

type Step =
  | { kind: 'loading' }
  | { kind: 'sign_in' }
  | { kind: 'not_admin' }
  | { kind: 'not_switched_on' }
  | { kind: 'enroll'; factorId: string; qr: string; secret: string }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

/**
 * Lets the page through only for an admin who has entered an authenticator code this session.
 * The server checks the same two things on every call (require_admin()); this only decides
 * which screen to show.
 *   1. Signed out: email and password.
 *   2. Signed in but not an admin: says so (no MFA set-up is offered).
 *   3. Admin without an authenticator yet: scan the QR code and enter a code to finish set-up.
 *   4. Admin with an authenticator: enter the 6-digit code.
 */
export function AdminGate({ session, loading, children }: { session: Session | null; loading: boolean; children: ReactNode }) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const token = session?.access_token;

  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let current = true;
    nextStep(session, loading).then((s) => current && setStep(s));
    return () => {
      current = false;
    };
    // The token changes when the authenticator code is accepted (aal1 -> aal2).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, token, attempt]);

  if (step.kind === 'ready') return <>{children}</>;

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <View style={{ height: 64, marginBottom: 4 }}><Logo height={64} /></View>
        <Text style={styles.kicker}>Admin Dashboard</Text>
        {step.kind === 'loading' ? <ActivityIndicator color={AdminColors.dim} style={{ marginVertical: 24 }} /> : null}
        {step.kind === 'sign_in' ? <SignIn /> : null}
        {step.kind === 'not_admin' ? (
          <Message
            title="Not an Admin Account"
            text={`${session?.user.email ?? 'This account'} can't open the dashboard. Sign in with the owner's account.`}
            action={<AdminButton title="Sign Out" onPress={() => signOut()} />}
          />
        ) : null}
        {step.kind === 'not_switched_on' ? (
          <Message title="Not Switched On Yet" text="The dashboard needs the latest server update before it can open." action={session ? <AdminButton title="Sign Out" onPress={() => signOut()} /> : null} />
        ) : null}
        {step.kind === 'error' ? <Message title="Something Went Wrong" text={step.message} action={<AdminButton title="Try Again" onPress={retry} />} /> : null}
        {step.kind === 'enroll' ? <Enroll factorId={step.factorId} qr={step.qr} secret={step.secret} onDone={retry} /> : null}
        {step.kind === 'challenge' ? <Challenge factorId={step.factorId} onDone={retry} /> : null}
      </View>
      <Text style={styles.foot}>Owner-only. Every action here is logged.</Text>
    </View>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (e) {
      setError((e as Error).message === 'Invalid login credentials' ? 'That email and password don\'t match.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.title}>Sign In</Text>
      <Input label="Email" value={email} onChange={setEmail} autoComplete="email" />
      <Input label="Password" value={password} onChange={setPassword} secure onSubmit={go} autoComplete="current-password" />
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      <AdminButton title="Sign In" kind="primary" onPress={go} loading={busy} disabled={!email.includes('@') || password.length < 6} />
    </View>
  );
}

function Enroll({ factorId, qr, secret, onDone }: { factorId: string; qr: string; secret: string; onDone: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.title}>Set Up Your Authenticator</Text>
      <Text style={styles.text}>
        The dashboard needs a code from an authenticator app every time you sign in. Scan this with your authenticator app (Apple Passwords, Google Authenticator, 1Password or similar), then enter the 6-digit code it shows.
      </Text>
      <View style={styles.qrTile}>
        <Image source={{ uri: svgDataUri(qr) }} style={{ width: 184, height: 184 }} resizeMode="contain" accessibilityLabel="Authenticator QR code" />
      </View>
      <Text style={styles.small}>Can&apos;t scan? Enter this key in the app instead:</Text>
      <Text selectable style={styles.secret}>{secret.replace(/(.{4})/g, '$1 ').trim()}</Text>
      <CodeForm factorId={factorId} onDone={onDone} label="Finish Set-Up" />
    </View>
  );
}

function Challenge({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.title}>Enter Your Code</Text>
      <Text style={styles.text}>Open your authenticator app and enter the 6-digit code for OnMyLead.</Text>
      <CodeForm factorId={factorId} onDone={onDone} label="Continue" />
      <AdminButton title="Sign Out" onPress={() => signOut()} />
    </View>
  );
}

function CodeForm({ factorId, onDone, label }: { factorId: string; onDone: () => void; label: string }) {
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async (c = code) => {
    if (c.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: c });
    setBusy(false);
    if (err) {
      setCode('');
      return setError(/invalid|expired/i.test(err.message) ? 'That code didn\'t work. Wait for the next one and try again.' : err.message);
    }
    onDone();
  };
  return (
    <View style={{ gap: 10 }}>
      <TextInput
        value={code}
        autoFocus
        onChangeText={(t) => {
          const c = t.replace(/\D/g, '').slice(0, 6);
          setCode(c);
          if (c.length === 6) go(c);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        placeholder="000000"
        placeholderTextColor={AdminColors.faint}
        accessibilityLabel="6-digit code"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.code, focused && { borderColor: AdminColors.blue }]}
      />
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      <AdminButton title={label} kind="primary" onPress={() => go()} loading={busy} disabled={code.length !== 6} />
    </View>
  );
}

function Message({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{text}</Text>
      {action}
    </View>
  );
}

function Input({ label, value, onChange, secure, onSubmit, autoComplete }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean; onSubmit?: () => void; autoComplete?: 'email' | 'current-password' }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        keyboardType={autoComplete === 'email' ? 'email-address' : 'default'}
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        style={[styles.input, focused && { borderColor: AdminColors.blue }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: '100%' as unknown as number, backgroundColor: AdminColors.rail, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 16 },
  card: { width: '100%', maxWidth: 420, backgroundColor: AdminColors.panel, borderRadius: 20, borderWidth: 1, borderColor: AdminColors.line, padding: 24, gap: 8 },
  kicker: { fontFamily: font(700, 'display'), fontSize: 18, color: AdminColors.red, textAlign: 'center', marginBottom: 8 },
  title: { fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 32, color: AdminColors.text },
  text: { fontFamily: font(500), fontSize: 15, lineHeight: 22, color: AdminColors.dim },
  small: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  secret: { fontFamily: font(700), fontSize: 15, letterSpacing: 1, color: AdminColors.text, backgroundColor: AdminColors.page, borderRadius: 10, padding: 10 },
  qrTile: { alignSelf: 'center', backgroundColor: '#E8EDF4', borderRadius: 14, padding: 12 },
  label: { fontFamily: font(600), fontSize: 13.5, color: AdminColors.dim },
  input: { outlineStyle: 'none' as never, fontFamily: font(500), fontSize: 16, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  code: { outlineStyle: 'none' as never, fontFamily: font(800, 'display'), fontSize: 36, letterSpacing: 10, textAlign: 'center', color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 12, paddingVertical: 10 },
  error: { fontFamily: font(600), fontSize: 14.5, color: AdminColors.danger },
  foot: { fontFamily: font(500), fontSize: 13, color: AdminColors.faint },
});

async function nextStep(session: Session | null, loading: boolean): Promise<Step> {
  if (!isBackendConfigured) return { kind: 'not_switched_on' };
  if (loading) return { kind: 'loading' };
  if (!session) return { kind: 'sign_in' };
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error) return error.code === 'PGRST202' ? { kind: 'not_switched_on' } : { kind: 'error', message: error.message };
  if (!isAdmin) return { kind: 'not_admin' };
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') return { kind: 'ready' };
  const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
  if (fErr) return { kind: 'error', message: fErr.message };
  const verified = factors?.totp.find((f) => f.status === 'verified');
  if (verified) return { kind: 'challenge', factorId: verified.id };
  // Clear a set-up that was started and never finished, then start a fresh one.
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data: enrolled, error: eErr } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'OnMyLead Admin', issuer: 'OnMyLead' });
  if (eErr || !enrolled) return { kind: 'error', message: eErr?.message ?? 'Could not start authenticator set-up.' };
  return { kind: 'enroll', factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret };
}

/** Supabase returns the QR code as an un-encoded SVG data URI; base64 renders reliably. */
function svgDataUri(qr: string) {
  const m = qr.match(/^data:image\/svg\+xml;utf-?8,(.*)$/s);
  if (!m || typeof btoa === 'undefined') return qr;
  const svg = m[1].startsWith('%3C') || m[1].startsWith('%3c') ? decodeURIComponent(m[1]) : m[1];
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
