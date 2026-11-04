import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { cleanShareCode, type ShareCodeKind } from '@/core/share-code';
import { codeCheckOk, ShareCodeField, type CodeCheck } from './share-code-field';
import { ThemedText } from './themed-text';
import { Button } from './ui';
import { ProTag } from './pro-tag';
import { requirePro } from '@/lib/pro';

import { t } from '@/lib/i18n';
/**
 * "Choose Your Own Code" for a ride, a riding group or a friend link: a link that opens a box to
 * type the new code (checked live against the database), what changing it means, and Save. Only
 * shown to whoever may change the code (the ride's organizers, the group's owner, you).
 */
export function ShareCodeEditor({ kind, id, current, note, save, onSaved }: {
  kind: ShareCodeKind;
  /** The ride or group (null for your friend link). */
  id?: string | null;
  current: string | null;
  /** What happens to the old link, in a sentence or two. */
  note: string;
  save: (code: string) => Promise<string>;
  onSaved: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [check, setCheck] = useState<CodeCheck>('empty');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typed = cleanShareCode(value);

  const close = () => {
    setOpen(false);
    setValue('');
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await save(typed);
      close();
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => requirePro('custom_codes') && setOpen(true)} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }} hitSlop={4}>
        <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>{t('Choose Your Own Code')}</ThemedText>
        <ProTag feature="custom_codes" />
      </Pressable>
    );
  }

  return (
    <View style={{ gap: Spacing.two, padding: 12, borderRadius: Radius.control, borderWidth: 1, borderColor: Colors.border }}>
      <ShareCodeField kind={kind} id={id} label={t('New Code')} value={value} onChange={setValue} onCheck={setCheck} autoFocus />
      <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText>
      {error ? <ThemedText type="small" style={{ color: Colors.danger, fontWeight: 600 }} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button title={t('Cancel')} kind="secondary" style={{ flex: 1, minHeight: 44 }} onPress={close} />
        <Button
          title={t('Save Code')}
          style={{ flex: 1, minHeight: 44 }}
          loading={busy}
          disabled={!typed || typed === current || check === 'empty' || !codeCheckOk(check)}
          onPress={submit}
        />
      </View>
    </View>
  );
}
