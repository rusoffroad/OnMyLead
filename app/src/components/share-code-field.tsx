import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { RideColors } from '@/constants/theme';
import {
  cleanShareCode, SHARE_CODE_MAX, SHARE_CODES_NOT_SWITCHED_ON, shareCodeLine, shareCodeProblem, typingShareCode,
  type ShareCodeKind, type ShareCodeStatus,
} from '@/core/share-code';
import { useTheme } from '@/hooks/use-theme';
import { shareCodeStatus, ShareCodesOffError } from '@/lib/share-codes';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { Field } from './ui';
import { ProLock } from './pro-gate';
import { useCan } from '@/lib/pro';

/**
 * What the field knows about the code typed so far. `unchecked`: the server couldn't be asked (no
 * signal), so saving is allowed and the database checks it then. `off`: the server doesn't have
 * custom codes yet.
 */
export type CodeCheck = ShareCodeStatus | 'empty' | 'checking' | 'unchecked' | 'off';

/** True when the code in the field may be saved (an empty field keeps the made-up code). */
export const codeCheckOk = (c: CodeCheck) => c === 'empty' || c === 'unchecked' || c === 'available' || c === 'yours';

/**
 * A box to type your own share code, with a live check under it: the shape and word rules right
 * away, then whether the code is free, asked of the database once typing pauses. Same on every
 * device; on the web it is an ordinary text box.
 */
export function ShareCodeField(props: ShareCodeFieldProps) {
  // Custom codes are Pro: Free riders see the Pro row, and the made-up code is used.
  if (!useCan('custom_codes')) return <ProLock feature="custom_codes" title="Your Own Code" detail="Pick an easy code to share" />;
  return <ShareCodeFieldInner {...props} />;
}

type ShareCodeFieldProps = {
  kind: ShareCodeKind;
  /** The ride or group being changed, so its current code reads as its own. */
  id?: string | null;
  value: string;
  onChange: (code: string) => void;
  onCheck?: (check: CodeCheck) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

function ShareCodeFieldInner({
  kind, id, value, onChange, onCheck, label = 'Your Own Code', hint, placeholder = 'MOAB-2026', autoFocus,
}: ShareCodeFieldProps) {
  const theme = useTheme();
  const code = cleanShareCode(value);
  const problem = code ? shareCodeProblem(code) : null;
  const [answer, setAnswer] = useState<{ code: string; check: CodeCheck } | null>(null);
  const check: CodeCheck = !code ? 'empty' : problem ?? (answer?.code === code ? answer.check : 'checking');

  // Ask the database once typing pauses. Only the answer for the code still in the box is used.
  useEffect(() => {
    if (!code || problem) return;
    let live = true;
    const t = setTimeout(() => {
      shareCodeStatus(kind, code, id)
        .then((s) => live && setAnswer({ code, check: s }))
        .catch((e) => live && setAnswer({ code, check: e instanceof ShareCodesOffError ? 'off' : 'unchecked' }));
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [code, problem, kind, id]);

  useEffect(() => {
    onCheck?.(check);
  }, [check, onCheck]);

  const good = check === 'available' || check === 'yours';
  const line =
    check === 'empty' ? null
    : check === 'checking' ? 'Checking…'
    : check === 'unchecked' ? 'Couldn’t check it right now. It’s checked again when you save.'
    : check === 'off' ? SHARE_CODES_NOT_SWITCHED_ON
    : shareCodeLine(check, kind);

  return (
    <View style={{ gap: 6 }}>
      <Field
        label={label}
        value={value}
        onChangeText={(t) => onChange(typingShareCode(t))}
        placeholder={placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={SHARE_CODE_MAX}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        hint={hint}
      />
      {line ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLiveRegion="polite">
          {check === 'checking' ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : good ? (
            <Icon name="check" color={RideColors.green} size={18} strokeWidth={2.6} />
          ) : null}
          <ThemedText
            type="small"
            style={{ flex: 1, fontWeight: 600, color: good ? RideColors.green : check === 'checking' || check === 'unchecked' ? theme.textSecondary : theme.danger }}>
            {line}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}
