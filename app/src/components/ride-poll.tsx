import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Field } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import {
  checkPoll, MAX_POLL_CHOICE, MAX_POLL_CHOICES, MAX_POLL_QUESTION, MIN_POLL_CHOICES, POLL_STARTERS, tallyPoll, voteCountLabel,
  type PollVote,
} from '@/core/polls';
import type { ChatMessage } from '@/core/chat';

/**
 * A quick poll in the ride chat. Each choice is one big tap target with a bar showing its
 * share of the votes, so the answer reads at a glance; tapping another choice moves the vote.
 */
export function PollCard({
  message, votes, me, onVote,
}: {
  message: ChatMessage;
  votes: PollVote[];
  me: string | undefined;
  onVote: (choice: number) => void;
}) {
  const choices = message.poll_options ?? [];
  const tally = tallyPoll(choices, votes, message.id, me);
  const lead = Math.max(...tally.counts);

  return (
    <View style={{ gap: Spacing.two }} accessibilityRole="radiogroup" accessibilityLabel={`Poll: ${message.body}`}>
      <Text style={styles.question}>{message.body}</Text>
      {choices.map((label, i) => {
        const mine = tally.mine === i;
        const leading = tally.total > 0 && tally.counts[i] === lead;
        return (
          <Pressable
            key={i}
            onPress={() => !mine && me && onVote(i)}
            accessibilityRole="radio"
            accessibilityState={{ selected: mine }}
            accessibilityLabel={`${label}, ${tally.counts[i]} ${tally.counts[i] === 1 ? 'vote' : 'votes'}${mine ? ', your vote' : ''}`}
            style={({ pressed }) => [styles.choice, mine && styles.choiceMine, pressed && { opacity: 0.85 }]}>
            <View
              style={[
                styles.fill,
                { width: `${Math.round(tally.shares[i] * 100)}%`, backgroundColor: leading ? 'rgba(59,134,247,0.42)' : 'rgba(59,134,247,0.22)' },
              ]}
            />
            <Text style={[styles.choiceText, mine && { fontFamily: font(700) }]} numberOfLines={2}>
              {label}
            </Text>
            {mine ? <Text style={styles.yours}>Your Vote</Text> : null}
            <Text style={styles.count}>{tally.counts[i]}</Text>
          </Pressable>
        );
      })}
      <ThemedText type="small" themeColor="textSecondary">
        {voteCountLabel(tally.total)}. {tally.mine == null ? 'Tap A Choice To Vote.' : 'Tap Another Choice To Change Your Vote.'}
      </ThemedText>
    </View>
  );
}

/** The leader's poll composer: a question, two to five choices, or one of the starters. */
export function PollComposer({
  pollsOn, onSend,
}: {
  pollsOn: boolean;
  onSend: (question: string, choices: string[]) => Promise<boolean>;
}) {
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setChoice(i: number, text: string) {
    setChoices((prev) => prev.map((c, j) => (j === i ? text : c)));
  }

  async function post() {
    const check = checkPoll(question, choices);
    if (!check.ok) return setError(check.error);
    setError(null);
    setBusy(true);
    const ok = await onSend(check.question, check.choices);
    setBusy(false);
    if (ok) {
      setQuestion('');
      setChoices(['', '']);
    }
  }

  if (!pollsOn) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Polls aren’t switched on yet. They will be after the next server update.
      </ThemedText>
    );
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.starters}>
        {POLL_STARTERS.map((s) => (
          <Pressable
            key={s.question}
            onPress={() => {
              setQuestion(s.question);
              setChoices(s.choices);
              setError(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Start with ${s.question}`}
            style={({ pressed }) => [styles.starter, pressed && { opacity: 0.8 }]}>
            <Text style={styles.starterText}>{s.question}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Question" value={question} onChangeText={setQuestion} placeholder="Lunch Stop?" maxLength={MAX_POLL_QUESTION} />
      {choices.map((c, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field label={`Choice ${i + 1}`} value={c} onChangeText={(t) => setChoice(i, t)} maxLength={MAX_POLL_CHOICE} />
          </View>
          {choices.length > MIN_POLL_CHOICES ? (
            <Pressable
              onPress={() => setChoices((prev) => prev.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel={`Remove Choice ${i + 1}`}
              hitSlop={8}
              style={styles.remove}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {choices.length < MAX_POLL_CHOICES ? (
        <Button title="Add Choice" kind="secondary" onPress={() => setChoices((prev) => [...prev, ''])} />
      ) : null}
      {error ? <ThemedText style={{ color: Colors.danger, fontWeight: 600 }}>{error}</ThemedText> : null}
      <Button title="Post Poll" loading={busy} onPress={post} />
    </View>
  );
}

const styles = StyleSheet.create({
  question: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 26, letterSpacing: 0.2 },
  choice: {
    minHeight: 50,
    borderRadius: Radius.control,
    backgroundColor: Colors.backgroundSelected,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  choiceMine: { borderColor: Colors.accent },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  choiceText: { flex: 1, color: Colors.text, fontFamily: font(500), fontSize: 17, lineHeight: 22 },
  yours: { color: Colors.text, fontFamily: font(700), fontSize: 12, backgroundColor: Colors.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  count: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 22, minWidth: 24, textAlign: 'right' },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  starter: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  starterText: { color: Colors.text, fontFamily: font(600), fontSize: 15 },
  remove: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.one },
  removeText: { color: Colors.sky, fontFamily: font(600), fontSize: 15 },
});
