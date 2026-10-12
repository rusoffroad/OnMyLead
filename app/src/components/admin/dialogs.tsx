import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { font } from '@/constants/theme';
import { AdminColors, toneColor, type Tone } from './tokens';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'danger' | 'normal';
  /** The admin must type this exactly (e.g. the account's email) before confirming. */
  requireText?: string;
  /** Adds a text box; its text comes back as reason. */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonInitial?: string;
  /** The confirm button stays off until the reason has at least 3 characters. */
  reasonRequired?: boolean;
  /** Number keyboard and digits only, for things like "days to add". */
  reasonNumeric?: boolean;
};
export type ConfirmResult = { ok: boolean; reason?: string };

type Ctx = { confirm: (o: ConfirmOptions) => Promise<ConfirmResult>; toast: (message: string, tone?: Tone) => void };
const DialogContext = createContext<Ctx | null>(null);

/** Confirmation dialogs for anything destructive or money-related. */
export function useConfirm() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useConfirm needs AdminDialogs');
  return ctx.confirm;
}

/** A short message at the bottom of the screen after an action. */
export function useToast() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useToast needs AdminDialogs');
  return ctx.toast;
}

/** Hosts the dialog and toasts. The admin layout mounts it once around every page. */
export function AdminDialogs({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(ConfirmOptions & { resolve: (r: ConfirmResult) => void }) | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: Tone }[]>([]);
  const seq = useRef(0);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<ConfirmResult>((resolve) => setOpen({ ...o, resolve })), []);
  const toast = useCallback((message: string, tone: Tone = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, toast }}>
      {children}
      {open ? (
        <ConfirmDialog
          options={open}
          onClose={(r) => {
            open.resolve(r);
            setOpen(null);
          }}
        />
      ) : null}
      <View pointerEvents="none" style={styles.toasts} accessibilityLiveRegion="polite">
        {toasts.map((t) => (
          <View key={t.id} style={[styles.toast, { borderLeftColor: toneColor(t.tone) }]}>
            <Text style={styles.toastText}>{t.message}</Text>
          </View>
        ))}
      </View>
    </DialogContext.Provider>
  );
}

function ConfirmDialog({ options: o, onClose }: { options: ConfirmOptions; onClose: (r: ConfirmResult) => void }) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState(o.reasonInitial ?? '');
  const danger = o.tone === 'danger';
  const ready = (!o.requireText || typed.trim().toLowerCase() === o.requireText.trim().toLowerCase())
    && (!o.reasonRequired || reason.trim().length >= (o.reasonNumeric ? 1 : 3));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose({ ok: false });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <View style={styles.scrim}>
      <Pressable accessibilityLabel="Cancel" style={StyleSheet.absoluteFill} onPress={() => onClose({ ok: false })} />
      <View style={styles.dialog} accessibilityRole="alert" aria-modal>
        <Text accessibilityRole="header" style={styles.title}>{o.title}</Text>
        <Text style={styles.message}>{o.message}</Text>
        {o.reasonLabel ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>{o.reasonLabel}</Text>
            <TextInput
              autoFocus
              value={reason}
              onChangeText={(t) => setReason(o.reasonNumeric ? t.replace(/[^0-9]/g, '') : t)}
              placeholder={o.reasonPlaceholder}
              placeholderTextColor={AdminColors.faint}
              keyboardType={o.reasonNumeric ? 'number-pad' : 'default'}
              multiline={!o.reasonNumeric}
              maxLength={o.reasonNumeric ? 4 : 500}
              style={[styles.input, !o.reasonNumeric && { minHeight: 76, textAlignVertical: 'top' }]}
            />
          </View>
        ) : null}
        {o.requireText ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Type {o.requireText} to confirm</Text>
            <TextInput value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} style={styles.input} accessibilityLabel={`Type ${o.requireText} to confirm`} />
          </View>
        ) : null}
        <View style={styles.buttons}>
          <Pressable accessibilityRole="button" onPress={() => onClose({ ok: false })} style={[styles.btn, styles.btnQuiet]}>
            <Text style={styles.btnQuietText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!ready}
            onPress={() => onClose({ ok: true, reason: reason.trim() || undefined })}
            style={[styles.btn, { backgroundColor: danger ? AdminColors.danger : AdminColors.red }, !ready && { opacity: 0.4 }]}>
            <Text style={styles.btnText}>{o.confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'fixed' as 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(3,8,16,0.78)', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 },
  dialog: { width: '100%', maxWidth: 460, backgroundColor: AdminColors.panel, borderRadius: 18, borderWidth: 1, borderColor: AdminColors.line, padding: 22, gap: 14 },
  title: { fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30, color: AdminColors.text },
  message: { fontFamily: font(500), fontSize: 15, lineHeight: 22, color: AdminColors.dim },
  label: { fontFamily: font(600), fontSize: 13.5, color: AdminColors.dim },
  input: { fontFamily: font(500), fontSize: 15, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  btn: { borderRadius: 12, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' },
  btnText: { fontFamily: font(700), fontSize: 15, color: '#FFFFFF' },
  btnQuiet: { backgroundColor: AdminColors.raised },
  btnQuietText: { fontFamily: font(600), fontSize: 15, color: AdminColors.text },
  toasts: { position: 'fixed' as 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center', gap: 8, zIndex: 60 },
  toast: { backgroundColor: AdminColors.raised, borderRadius: 12, borderLeftWidth: 4, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 480, marginHorizontal: 16 },
  toastText: { fontFamily: font(600), fontSize: 14.5, color: AdminColors.text },
});
