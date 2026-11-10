import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, Field } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { FOUND_US_ANSWERS, type FoundUsAnswer } from '@/core/found-us';
import { saveFoundUs, useAskFoundUs } from '@/lib/found-us';

import { t } from '@/lib/i18n';
/**
 * Home's one-time question for new accounts (3.0): "How Did You Find OnMyLead?". One tap on a
 * chip, then Send; Not Now hides it for good. Answers are only ever counted on the Admin
 * Dashboard. The chips wrap, so it fits a phone and a tablet column the same way.
 */
export function FoundUsCard() {
  const { ask, uid, hide } = useAskFoundUs();
  const [answer, setAnswer] = useState<FoundUsAnswer | null>(null);
  const [detail, setDetail] = useState('');
  const [thanks, setThanks] = useState(false);
  if (thanks) {
    return (
      <Card style={{ borderLeftWidth: 4, borderLeftColor: Colors.sky }}>
        <ThemedText style={{ fontWeight: 600 }}>{t('Thanks! That helps us reach more riders.')}</ThemedText>
      </Card>
    );
  }
  if (!ask || !uid) return null;
  const send = (a: FoundUsAnswer | 'skipped') => {
    saveFoundUs(uid, a, a === 'other' ? detail.trim() : undefined);
    if (a === 'skipped') hide();
    else {
      setThanks(true);
      setTimeout(() => {
        setThanks(false);
        hide();
      }, 3000);
    }
  };
  return (
    <Card style={{ gap: Spacing.three, borderLeftWidth: 4, borderLeftColor: Colors.sky }}>
      <View style={{ gap: 4 }}>
        <ThemedText type="heading" accessibilityRole="header">{t('How Did You Find OnMyLead?')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('One tap. It tells us where to find more riders like you.')}</ThemedText>
      </View>
      <Choice<FoundUsAnswer | null> options={FOUND_US_ANSWERS} value={answer} onChange={setAnswer} />
      {answer === 'other' ? (
        <Field label={t('Where?')} value={detail} onChangeText={setDetail} maxLength={80} placeholder={t('A trail sign, a forum, a dealer...')} />
      ) : null}
      <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
        <Button title={t('Send')} disabled={!answer} onPress={() => answer && send(answer)} style={{ flexGrow: 1, minHeight: 44 }} />
        <Button title={t('Not Now')} kind="ghost" onPress={() => send('skipped')} style={{ flexGrow: 1, minHeight: 44 }} />
      </View>
    </Card>
  );
}
