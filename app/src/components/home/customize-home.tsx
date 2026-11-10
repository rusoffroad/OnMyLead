import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui';
import { Colors, font, Radius, themedStyles } from '@/constants/theme';
import {
  DEFAULT_HOME_LAYOUT, HOME_SECTIONS, isDefaultLayout, moveSection, toggleSection, type HomeLayout,
} from '@/core/home-layout';
import { Home } from './parts';
import { t } from '@/lib/i18n';

/**
 * Customize Home: switch each section under the top cards on or off and move it up or down.
 * Map Mode, Join a Ride, Start a Ride and Events always come first. Saved to the account when the
 * rider taps Done, so every phone and tablet shows the same Home.
 */
export function CustomizeHomeSheet({
  visible, layout, onClose, onSave,
}: { visible: boolean; layout: HomeLayout; onClose: () => void; onSave: (l: HomeLayout) => void }) {
  const [draft, setDraft] = useState(layout);
  // Each time the sheet opens it starts from what's saved.
  const [openedWith, setOpenedWith] = useState<HomeLayout | null>(null);
  if (visible && openedWith !== layout) {
    setOpenedWith(layout);
    setDraft(layout);
  } else if (!visible && openedWith) setOpenedWith(null);
  const title = (id: string) => t(HOME_SECTIONS.find((s) => s.id === id)?.title ?? id);
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('Customize Home')}
      footer={<Button title={t('Done')} onPress={() => { onSave(draft); onClose(); }} />}>
      <View style={styles.note}>
        <Icon name="lock" size={15} color={Colors.textSecondary} />
        <Text style={styles.noteText}>{t('Map Mode, Join a Ride, Start a Ride and Events always show first.')}</Text>
      </View>
      <View style={styles.list}>
        {draft.order.map((id, i) => {
          const on = !draft.hidden.includes(id);
          const name = title(id);
          return (
            <View key={id} style={[styles.row, i > 0 && styles.rowLine]}>
              <View style={styles.moves}>
                <Move label={t('Move {section} up', { section: name })} up disabled={i === 0} onPress={() => setDraft(moveSection(draft, id, -1))} />
                <Move label={t('Move {section} down', { section: name })} disabled={i === draft.order.length - 1} onPress={() => setDraft(moveSection(draft, id, 1))} />
              </View>
              <Text style={[styles.name, !on && { color: Colors.textSecondary }]} numberOfLines={1}>{name}</Text>
              <Switch
                value={on}
                onValueChange={(v) => setDraft(toggleSection(draft, id, v))}
                accessibilityLabel={t('Show {section}', { section: name })}
                trackColor={{ true: Colors.accent, false: Home.panel2 }}
                thumbColor="#fff"
              />
            </View>
          );
        })}
      </View>
      {isDefaultLayout(draft) ? null : (
        <Button title={t('Reset to Default')} kind="ghost" onPress={() => setDraft(DEFAULT_HOME_LAYOUT)} />
      )}
    </BottomSheet>
  );
}

function Move({ label, up, disabled, onPress }: { label: string; up?: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.move, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <View style={{ transform: [{ rotate: up ? '-90deg' : '90deg' }] }}>
        <Icon name="chevron" size={16} color={Colors.text} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteText: { flex: 1, color: Colors.textSecondary, fontFamily: font(500), fontSize: 13.5, lineHeight: 18 },
  list: { borderRadius: Radius.card, borderWidth: 1.5, borderColor: Colors.tileEdge, backgroundColor: Colors.backgroundElement, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 60 },
  rowLine: { borderTopWidth: 1, borderTopColor: Home.line },
  moves: { flexDirection: 'row', gap: 4 },
  move: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: Home.panel2 },
  name: { flex: 1, color: Colors.text, fontFamily: font(600), fontSize: 16 },
}));
