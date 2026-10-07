import { useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { Button, Field } from './ui';

const label = (min: number | null, openLabel: string) =>
  min == null ? openLabel : min < 60 ? `${min} min` : `${min / 60} hours`;

/** Duration choice for a share. Includes a custom length in hours. */
export function SharePicker({
  options, openLabel, onPick, busy,
}: {
  options: (number | null)[];
  openLabel: string;
  onPick: (minutes: number | null) => void;
  busy?: boolean;
}) {
  const [custom, setCustom] = useState('');
  const customMin = Math.round(parseFloat(custom) * 60);
  return (
    <View style={{ gap: Spacing.two }}>
      {options.map((o) => (
        <Button key={String(o)} title={label(o, openLabel)} big disabled={busy} onPress={() => onPick(o)} />
      ))}
      <ThemedText type="small" themeColor="textSecondary">Or pick your own length</ThemedText>
      <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field label="Hours" value={custom} onChangeText={setCustom} keyboardType="decimal-pad" placeholder="3.5" />
        </View>
        <Button title="Share" disabled={busy || !(customMin > 0 && customMin <= 24 * 60)} onPress={() => onPick(customMin)} />
      </View>
    </View>
  );
}
