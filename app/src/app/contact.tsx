import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { createElement, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { COMPANY } from '@/constants/site';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import {
  CONTACT_TOPICS, contactProblem, MAX_CONTACT_MESSAGE, MAX_CONTACT_NAME, screenBeforeContact, screenshotHint, screenshotProblem, topicHint,
  type ContactTopic,
} from '@/core/contact';
import { canSendBugReports, myRideName, sendContactMessage } from '@/lib/api';
import { appLogText, screenTrail } from '@/lib/app-log';
import { deviceSummary, isTablet } from '@/lib/device-info';
import { useSession } from '@/lib/session';

const TOPIC_ICON: Record<ContactTopic, IconName> = {
  problem: 'wrench',
  feature: 'plus',
  billing: 'star',
  account: 'person',
  safety: 'warning',
  feedback: 'megaphone',
  other: 'mail',
};

/**
 * Contact Us: onmylead.com/contact on the website (works signed out) and You > Contact Us in the
 * app. The message goes to the owner's inbox and the Admin Dashboard, marked with where it came from.
 */
export default function ContactScreen() {
  const { session } = useSession();
  // You > Report a Bug opens this with ?topic=problem.
  const params = useLocalSearchParams<{ topic?: string }>();
  const [topic, setTopic] = useState<ContactTopic | null>(() => CONTACT_TOPICS.find((t) => t.value === params.topic)?.value ?? null);
  const [shot, setShot] = useState<{ uri: string; base64: string; type: string } | null>(null);
  // Screenshots and the log go only to a server that keeps them (see canSendBugReports).
  const [reportsReady, setReportsReady] = useState(false);
  useEffect(() => {
    canSendBugReports().then(setReportsReady);
  }, []);
  // Where the rider was before they opened this screen, for a bug report.
  const [cameFrom] = useState(() => screenBeforeContact(screenTrail()));
  const [name, setName] = useState('');
  // Signed in: the sign-in email until something else is typed.
  const [typedEmail, setEmail] = useState<string | null>(null);
  const email = typedEmail ?? session?.user.email ?? '';
  const [message, setMessage] = useState('');
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // When the form opened. A message sent seconds later is a bot, and the server refuses it.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  // Signed in: fill in the ride name, without overwriting anything typed.
  useEffect(() => {
    if (!session) return;
    myRideName().then((n) => n && setName((v) => v || n)).catch(() => {});
  }, [session]);

  const send = async () => {
    const why = contactProblem({ topic, email, message });
    if (why || !topic) return setError(why);
    setBusy(true);
    setError(null);
    try {
      const report = topic === 'problem' && reportsReady
        ? { device: deviceSummary(), screen: cameFrom, log: appLogText(), screenshot: shot ? { base64: shot.base64, type: shot.type } : null }
        : undefined;
      await sendContactMessage({ topic, name, email: email.trim(), message, elapsedMs: Date.now() - openedAt.current, website: trap, report });
      setSentTo(email.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickShot = async () => {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
      const a = res.canceled ? null : res.assets[0];
      if (!a) return;
      // The website hands back a data URL; the apps hand back base64 beside a file.
      const base64 = a.base64 ?? (a.uri.startsWith('data:') ? a.uri.split(',')[1] : null);
      const why = screenshotProblem(base64);
      if (why || !base64) return setError(why);
      setShot({ uri: a.uri, base64, type: a.mimeType ?? 'image/jpeg' });
    } catch {
      setError('Your pictures couldn’t be opened. Allow OnMyLead to see your photos in Settings, or send the message without one.');
    }
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (sentTo) {
    return (
      <Screen>
        <Head><title>Message Sent | OnMyLead</title></Head>
        <View style={styles.wrap}>
          <View style={styles.sent} accessibilityLiveRegion="polite">
            <View style={styles.sentMark}><Icon name="check" size={34} color={Colors.text} strokeWidth={2.6} /></View>
            <ThemedText type="subtitle" accessibilityRole="header" style={{ textAlign: 'center' }}>Message Sent</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Thanks for writing. We’ll reply to {sentTo}, usually within a day.
            </ThemedText>
          </View>
          <Button title="Back to OnMyLead" onPress={leave} />
          <Button
            title="Send Another Message"
            kind="ghost"
            onPress={() => {
              setSentTo(null);
              setMessage('');
              setTopic(null);
              setShot(null);
              openedAt.current = Date.now();
            }}
          />
        </View>
      </Screen>
    );
  }

  const length = message.length;
  return (
    <Screen>
      <Head>
        <title>Contact Us | OnMyLead</title>
        <meta name="description" content="Report a problem, ask for a feature or get help with billing. A real person at RUS Offroad reads every message." />
      </Head>
      <View style={styles.wrap}>
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="title" accessibilityRole="header">Contact Us</ThemedText>
          <ThemedText themeColor="textSecondary">
            Questions, problems or ideas for OnMyLead go straight to the team at {COMPANY}.
          </ThemedText>
        </View>

        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }} nativeID="topic-label">What’s It About?</ThemedText>
          <View style={styles.topics} accessibilityRole="radiogroup" aria-labelledby="topic-label">
            {CONTACT_TOPICS.map((t) => {
              const on = t.value === topic;
              return (
                <Pressable
                  key={t.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  onPress={() => {
                    setTopic(t.value);
                    setError(null);
                  }}
                  style={({ pressed }) => [styles.topic, on && styles.topicOn, pressed && { opacity: 0.85 }]}>
                  <View style={[styles.topicIcon, on && { backgroundColor: Colors.accent }]}>
                    <Icon name={TOPIC_ICON[t.value]} size={18} color={on ? Colors.onAccent : Colors.textSecondary} />
                  </View>
                  <Text style={[styles.topicText, on && { color: Colors.text }]} numberOfLines={2}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.pair}>
          <View style={styles.half}>
            <Field
              label="Your Name"
              value={name}
              onChangeText={setName}
              placeholder="Optional"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              maxLength={MAX_CONTACT_NAME}
              returnKeyType="next"
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Your Email"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              placeholder="So we can reply"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              maxLength={254}
              returnKeyType="next"
            />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Field
            label="Your Message"
            value={message}
            onChangeText={(t) => {
              setMessage(t);
              setError(null);
            }}
            placeholder="Write your message here"
            multiline
            maxLength={MAX_CONTACT_MESSAGE}
            style={{ minHeight: 180 }}
            accessibilityHint={topicHint(topic, Platform.OS)}
          />
          <View style={styles.meta}>
            <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>{topicHint(topic, Platform.OS)}</ThemedText>
            {length > MAX_CONTACT_MESSAGE * 0.8 ? (
              <ThemedText type="small" themeColor="textSecondary">{length.toLocaleString('en-US')}/{MAX_CONTACT_MESSAGE.toLocaleString('en-US')}</ThemedText>
            ) : null}
          </View>
        </View>

        {topic === 'problem' && reportsReady ? (
          <View style={styles.report}>
            <ThemedText type="smallBold">Add a Screenshot</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{screenshotHint(Platform.OS, Platform.OS !== 'web' && isTablet())}</ThemedText>
            {shot ? (
              <View style={styles.shotRow}>
                <Image source={{ uri: shot.uri }} style={styles.shot} contentFit="cover" accessibilityLabel="Your screenshot" />
                <View style={{ flex: 1, gap: Spacing.two }}>
                  <Button title="Change Screenshot" kind="secondary" onPress={pickShot} />
                  <Button title="Remove" kind="ghost" onPress={() => setShot(null)} />
                </View>
              </View>
            ) : (
              <Button title="Add a Screenshot" kind="secondary" onPress={pickShot} />
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {Platform.OS === 'web'
                ? 'Your browser and a short log of what the page just did go with your message, to help us fix it. Never your location or anything you typed.'
                : 'Your phone model, app version and a short log of what the app just did go with your message, to help us fix it. Never your location or anything you typed.'}
            </ThemedText>
          </View>
        ) : null}

        {/* A box people never see. Bots fill it in, and the server drops what they send. */}
        {Platform.OS === 'web'
          ? createElement('input', {
            type: 'text', name: 'website', tabIndex: -1, autoComplete: 'off', 'aria-hidden': true, value: trap,
            onChange: (e: { target: { value: string } }) => setTrap(e.target.value),
            style: { position: 'absolute', left: -10000, width: 1, height: 1, opacity: 0 },
          })
          : null}

        <ErrorText error={error} />
        <Button title="Send Message" big loading={busy} onPress={send} />
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          In an emergency, call 911 first.
        </ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: Spacing.four },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  topic: {
    flexGrow: 1, flexBasis: '45%', minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.control,
    backgroundColor: Colors.backgroundElement, borderWidth: 1.5, borderColor: Colors.backgroundSelected,
  },
  topicOn: { borderColor: Colors.accent, backgroundColor: '#2A1A26' },
  topicIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  topicText: { flex: 1, color: Colors.textSecondary, fontFamily: font(600), fontSize: 15, lineHeight: 19 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  half: { flexGrow: 1, flexBasis: 240 },
  meta: { flexDirection: 'row', gap: Spacing.two },
  report: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  shotRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  shot: { width: 96, height: 160, borderRadius: Radius.control, backgroundColor: Colors.backgroundSelected },
  sent: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  sentMark: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
});
