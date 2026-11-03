import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { AUTO_VOICE, resolveVoice, suggestDownload, VOICE_SAMPLE, voiceChoices, voiceLabel, voiceTier, type PhoneVoice } from '@/core/voice';
import { deviceLanguage, installedVoices, setVoiceChoice, speakWith, stopSpeaking, useVoiceChoice } from '@/lib/voice';
import { t } from '@/lib/i18n';

/** Where a rider gets a better free voice, per device. Steps are the same on iPhone and iPad. */
const DOWNLOAD_STEPS: Record<string, string> = {
  ios: 'On your iPhone or iPad, open Settings > Accessibility > Read & Speak (Spoken Content on older iOS) > Voices > English, and download a Premium or Enhanced voice such as Zoe, Ava or Evan. It’s free, about 100 to 400 MB, and then works with no service. Come back and tap Check Again.',
  android: 'On your Android phone or tablet, open Settings and search for Text-to-Speech, pick Speech Services by Google, then Install Voice Data and download your language. It’s free and then works with no service. Come back and tap Check Again.',
  web: 'Your browser decides which voices this website can use. Chrome, Edge and Safari each have their own; the app on your phone has the best ones.',
};

/**
 * Voice: who reads Ride Mode's spoken alerts (announcements, Regroup Point Set, a rider falling
 * behind, Mechanical Issue). Automatic picks the most natural voice on this device; a rider can
 * pick another and hear each one first. Device-local, offline (core/voice.ts).
 */
export default function VoiceScreen() {
  const saved = useVoiceChoice();
  const [voices, setVoices] = useState<PhoneVoice[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const lang = deviceLanguage();

  const load = useCallback((refresh: boolean) => {
    installedVoices(refresh).then(setVoices);
  }, []);
  useEffect(() => {
    load(false);
    return stopSpeaking;
  }, [load]);

  const choices = voices ? voiceChoices(voices, lang) : [];
  const auto = voices ? resolveVoice(voices, lang, AUTO_VOICE) : null;
  const inUse = voices ? resolveVoice(voices, lang, saved) : null;
  const autoOn = saved === AUTO_VOICE || !inUse || inUse.identifier !== saved;

  function play(key: string, v: PhoneVoice | null) {
    stopSpeaking();
    setPlaying(key);
    speakWith(VOICE_SAMPLE, v);
    setTimeout(() => setPlaying((p) => (p === key ? null : p)), 3000);
  }

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: t('Voice') }} />
      <ThemedText themeColor="textSecondary">
        The voice that reads Ride Mode alerts out loud: announcements, regroup points, a rider falling behind and Mechanical Issue. Every voice here is on this device, so it keeps talking with no service.
      </ThemedText>

      {voices == null ? (
        <ActivityIndicator color={Colors.textSecondary} style={{ marginVertical: Spacing.four }} />
      ) : (
        <View style={styles.list} accessibilityRole="radiogroup">
          <VoiceRow
            title="Automatic"
            detail={auto ? `Best voice on this device: ${voiceLabel(auto, choices)}` : 'This device’s standard voice'}
            on={autoOn}
            recommended
            playing={playing === AUTO_VOICE}
            onPick={() => setVoiceChoice(AUTO_VOICE)}
            onPlay={() => play(AUTO_VOICE, auto)}
          />
          {choices.map((v) => (
            <VoiceRow
              key={v.identifier}
              title={voiceLabel(v, choices)}
              detail={tierDetail(v)}
              on={!autoOn && inUse?.identifier === v.identifier}
              playing={playing === v.identifier}
              onPick={() => setVoiceChoice(v.identifier)}
              onPlay={() => play(v.identifier, v)}
            />
          ))}
        </View>
      )}

      {voices != null && suggestDownload(voices, lang) ? (
        <View style={styles.tip} accessibilityLiveRegion="polite">
          <ThemedText type="smallBold">Get a More Natural Voice</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{DOWNLOAD_STEPS[Platform.OS] ?? DOWNLOAD_STEPS.web}</ThemedText>
          {Platform.OS !== 'web' ? <Button title="Check Again" kind="secondary" onPress={() => load(true)} style={{ marginTop: Spacing.two }} /> : null}
        </View>
      ) : Platform.OS === 'ios' ? (
        <ThemedText type="small" themeColor="textSecondary">
          More voices: Settings &gt; Accessibility &gt; Read &amp; Speak &gt; Voices. Premium voices sound the most natural. Siri’s own voice isn’t available to apps.
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
        This setting is for this device only. Spoken alerts play through your phone speaker, headset or helmet comms.
      </ThemedText>
    </Screen>
  );
}

function tierDetail(v: PhoneVoice): string {
  const t = voiceTier(v);
  if (t === 'premium') return 'Most natural';
  if (t === 'enhanced') return 'Natural';
  return 'Standard';
}

function VoiceRow({ title, detail, on, recommended, playing, onPick, onPlay }: {
  title: string; detail: string; on: boolean; recommended?: boolean; playing: boolean; onPick: () => void; onPlay: () => void;
}) {
  return (
    <View style={[styles.row, on && styles.rowOn]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`${title}${recommended ? ', recommended' : ''}. ${detail}`}
        onPress={onPick}
        style={({ pressed }) => [styles.pick, pressed && { opacity: 0.7 }]}>
        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {recommended ? <Text style={styles.recommended}>Recommended</Text> : null}
          </View>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play Sample, ${title}`}
        hitSlop={6}
        onPress={onPlay}
        style={({ pressed }) => [styles.play, playing && styles.playOn, pressed && { opacity: 0.7 }]}>
        <Icon name="voice" size={20} color={playing ? Colors.text : Colors.sky} />
        <Text style={[styles.playText, playing && { color: Colors.text }]}>{playing ? 'Playing' : 'Play'}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => ({
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, borderWidth: 2, borderColor: 'transparent',
    paddingVertical: Spacing.two, paddingLeft: Spacing.three, paddingRight: Spacing.two,
  },
  rowOn: { borderColor: Colors.sky },
  pick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 4, minHeight: 44 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.sky },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.sky },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  title: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18, lineHeight: 22 },
  detail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
  recommended: {
    color: RideColors.green, fontFamily: font(700), fontSize: 12, overflow: 'hidden',
    backgroundColor: `${RideColors.green}1F`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
  },
  play: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 92, justifyContent: 'center',
    paddingHorizontal: Spacing.three, borderRadius: 999, backgroundColor: `${Colors.sky}1F`,
  },
  playOn: { backgroundColor: Colors.sky },
  playText: { color: Colors.sky, fontFamily: font(700), fontSize: 15 },
  tip: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: RideColors.yellow, padding: Spacing.three, gap: 4 },
}));
