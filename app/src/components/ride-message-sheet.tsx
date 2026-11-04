import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { KeyboardLift, keyboardScroll, TextBox } from '@/components/keyboard';
import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { charactersLeft, checkRideMessage, isBuiltInReply, RIDE_MESSAGE_MAX } from '@/core/ride-message';

type Props = {
  visible: boolean;
  tablet: boolean;
  /** The rider's own quick replies, newest first. */
  saved: string[];
  /** Sends to everyone on the ride. `save` keeps it as one of the rider's quick replies. */
  onSend: (body: string, save: boolean) => void;
  onRemove: (body: string) => void;
  onClose: () => void;
};

/**
 * Ride Mode: type a message of your own to the group, or send one of your saved quick replies
 * in one tap. On a phone it slides up from the bottom; on a tablet it is a card in the middle.
 */
export function RideMessageSheet({ visible, tablet, saved, onSend, onRemove, onClose }: Props) {
  const [text, setText] = useState('');
  const [keep, setKeep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const left = charactersLeft(text);
  const canKeep = !isBuiltInReply(text);

  const close = () => {
    setError(null);
    setEditing(false);
    onClose();
  };

  const send = (raw: string, save: boolean) => {
    const check = checkRideMessage(raw);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setText('');
    setKeep(false);
    setError(null);
    setEditing(false);
    onSend(check.body, save);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <SheetRoot style={[styles.wrap, tablet && styles.wrapTablet]}>
        <KeyboardLift style={tablet ? styles.liftTablet : undefined}>
          <SwipeSheet onClose={close} style={[styles.sheet, tablet && styles.sheetTablet]} accessibilityViewIsModal>
            <ThemedText type="subtitle" style={{ color: Colors.text }}>Message the Group</ThemedText>
            <SheetScroll style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12 }} {...keyboardScroll}>
              {saved.length ? (
                <View style={{ gap: 8 }}>
                  <View style={styles.savedHead}>
                    <ThemedText type="smallBold" style={{ color: Colors.textSecondary }}>My Quick Replies</ThemedText>
                    <Pressable
                      onPress={() => setEditing((e) => !e)}
                      accessibilityRole="button"
                      accessibilityLabel={editing ? 'Done removing quick replies' : 'Remove quick replies'}
                      hitSlop={8}>
                      <Text style={styles.link}>{editing ? 'Done' : 'Edit'}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.chips}>
                    {saved.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => (editing ? onRemove(s) : send(s, false))}
                        accessibilityRole="button"
                        accessibilityLabel={editing ? `Remove quick reply: ${s}` : `Send to the group: ${s}`}
                        style={({ pressed }) => [styles.chip, editing && styles.chipEditing, { opacity: pressed ? 0.75 : 1 }]}>
                        {editing ? <Icon name="close" size={16} color={Colors.text} /> : null}
                        <Text style={[styles.chipText, editing && { color: Colors.text }]} numberOfLines={2}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              <TextBox
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  if (error) setError(null);
                }}
                placeholder="Gas stop at the next town"
                placeholderTextColor={Colors.textSecondary}
                autoFocus={!saved.length}
                autoCapitalize="sentences"
                multiline
                submitBehavior="blurAndSubmit"
                returnKeyType="send"
                onSubmitEditing={() => send(text, keep && canKeep)}
                maxLength={RIDE_MESSAGE_MAX + 40}
                accessibilityLabel="Your message to the group"
                style={styles.input}
              />
              <View style={styles.meta}>
                <ThemedText type="small" style={{ color: error ? Colors.danger : Colors.textSecondary, flex: 1 }}>
                  {error ?? 'Goes to everyone on this ride. Pull over before you type.'}
                </ThemedText>
                <Text style={[styles.count, left < 0 && { color: Colors.danger }]}>{left}</Text>
              </View>

              <Pressable
                onPress={() => setKeep((k) => !k)}
                disabled={!canKeep}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: keep && canKeep, disabled: !canKeep }}
                accessibilityLabel="Save as one of my quick replies"
                style={({ pressed }) => [styles.keep, { opacity: !canKeep ? 0.4 : pressed ? 0.75 : 1 }]}>
                <View style={[styles.box, keep && canKeep && styles.boxOn]}>
                  {keep && canKeep ? <Icon name="check" size={18} color="#fff" /> : null}
                </View>
                <ThemedText style={{ color: Colors.text, flex: 1 }}>Save as One of My Quick Replies</ThemedText>
              </Pressable>
            </SheetScroll>
            <Button title="Send to Everyone" big onPress={() => send(text, keep && canKeep)} style={{ backgroundColor: Colors.sky }} />
            <Button title="Cancel" kind="secondary" onPress={close} />
          </SwipeSheet>
        </KeyboardLift>
      </SheetRoot>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  // On a tablet the sheet is a card in the middle of the screen, not a strip across the bottom.
  wrapTablet: { justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  liftTablet: { width: '100%', maxWidth: 560, alignItems: 'stretch' },
  sheet: { flexShrink: 1, backgroundColor: Colors.backgroundElement, padding: Spacing.four, gap: 12, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetTablet: { width: '100%', borderRadius: 28 },
  savedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: Colors.sky, fontFamily: font(700), fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 52, maxWidth: '100%',
    paddingHorizontal: 16, borderRadius: Radius.control, backgroundColor: Colors.sky,
  },
  chipEditing: { backgroundColor: Colors.backgroundSelected },
  chipText: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 18, flexShrink: 1 },
  input: {
    minHeight: 96, borderRadius: Radius.control, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background, color: Colors.text, fontSize: 20, padding: 14, textAlignVertical: 'top',
  },
  meta: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  count: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 15, minWidth: 32, textAlign: 'right' },
  keep: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.sky, borderColor: Colors.sky },
}));
