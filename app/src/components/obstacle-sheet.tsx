import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { TextBox } from '@/components/keyboard';
import { Button } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { cleanName, MAX_OBSTACLE_NAME, OBSTACLE_INK, OBSTACLE_KINDS, type ObstacleKind } from '@/core/obstacles';

import { t } from '@/lib/i18n';
/**
 * Name a spot on a trail: "Waterfall Ledge", "Deep Crossing". Used while drawing a custom trail,
 * while recording, and on the trail's page. `editing` adds Remove.
 */
export function ObstacleSheet({
  visible, initial, editing, onSave, onRemove, onClose,
}: {
  visible: boolean;
  initial: { name: string; kind: ObstacleKind };
  editing?: boolean;
  onSave: (name: string, kind: ObstacleKind) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<ObstacleKind>(initial.kind);
  const [opened, setOpened] = useState(false);
  // Start from the spot's own name each time the sheet opens.
  if (visible !== opened) {
    setOpened(visible);
    if (visible) {
      setName(initial.name);
      setKind(initial.kind);
    }
  }
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit Spot' : 'Mark a Spot'}
      footer={
        <View style={{ gap: Spacing.two }}>
          <Button title={editing ? 'Save' : 'Add to Trail'} onPress={() => onSave(cleanName(name, kind), kind)} />
          {editing && onRemove ? <Button title={t('Remove')} kind="ghost" onPress={onRemove} /> : null}
        </View>
      }>
      <View style={styles.kinds}>
        {OBSTACLE_KINDS.map((k) => (
          <Pressable
            key={k.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: kind === k.value }}
            onPress={() => setKind(k.value)}
            style={[styles.kind, kind === k.value && { borderColor: OBSTACLE_INK[k.value], backgroundColor: 'rgba(255,255,255,0.05)' }]}>
            <View style={[styles.dot, { backgroundColor: OBSTACLE_INK[k.value] }]} />
            <Text style={styles.kindText}>{t(k.label)}</Text>
          </Pressable>
        ))}
      </View>
      <TextBox
        value={name}
        onChangeText={setName}
        maxLength={MAX_OBSTACLE_NAME}
        placeholder={t('Name, e.g. Waterfall Ledge')}
        placeholderTextColor={Colors.textSecondary}
        accessibilityLabel={t('Spot name')}
        returnKeyType="done"
        onSubmitEditing={() => onSave(cleanName(name, kind), kind)}
        style={styles.input}
      />
      <Text style={styles.hint}>{t('Riders who follow this trail see the name on the map. Shared trails show spots along the shared line only.')}</Text>
    </BottomSheet>
  );
}

const styles = themedStyles(() => ({
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.pill, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, minHeight: 40,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  kindText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
  input: {
    minHeight: 50, borderRadius: Radius.control, backgroundColor: Colors.backgroundSelected, color: Colors.text, paddingHorizontal: 14,
    fontFamily: font(600), fontSize: 17,
  },
  hint: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
}));
