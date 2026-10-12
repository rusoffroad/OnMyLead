import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { font } from '@/constants/theme';
import type { AdminError } from '@/lib/admin';
import { AdminColors, useLayoutSize } from './tokens';

/** The frame of every dashboard page: title, optional subtitle and actions, then the content. */
export function AdminPage({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const size = useLayoutSize();
  return (
    <View style={[styles.page, size === 'phone' && styles.pagePhone]}>
      <View style={[styles.head, size === 'phone' && { flexDirection: 'column', alignItems: 'flex-start' }]}>
        <View style={{ flexShrink: 1, gap: 4 }}>
          <Text accessibilityRole="header" style={[styles.title, size === 'phone' && { fontSize: 34, lineHeight: 36 }]}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {children}
    </View>
  );
}

/** A block on a page, with an optional heading and something on its right (a filter, a link). */
export function Panel({ title, right, children, style, pad = true }: { title?: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  return (
    <View style={[styles.panel, !pad && { padding: 0 }, style]}>
      {title || right ? (
        <View style={[styles.panelHead, !pad && { paddingHorizontal: 18, paddingTop: 16 }]}>
          {title ? <Text accessibilityRole="header" style={styles.panelTitle}>{title}</Text> : <View />}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Two or three panels side by side on wide screens, stacked on phones. */
export function Columns({ children, ratio = [1, 1] }: { children: ReactNode[]; ratio?: number[] }) {
  const size = useLayoutSize();
  if (size !== 'desktop') return <View style={{ gap: 16 }}>{children}</View>;
  return (
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
      {children.map((c, i) => <View key={i} style={{ flex: ratio[i] ?? 1, minWidth: 0, gap: 16 }}>{c}</View>)}
    </View>
  );
}

/** Label and value rows, for profiles and ride details. */
export function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <View>
      {rows.map(([k, v], i) => (
        <View key={k} style={[styles.field, i > 0 && styles.fieldLine]}>
          <Text style={styles.fieldKey}>{k}</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            {typeof v === 'string' || typeof v === 'number' ? <Text style={styles.fieldVal}>{v}</Text> : v}
          </View>
        </View>
      ))}
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator color={AdminColors.dim} />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

/** What went wrong and how to retry, in place of the data. */
export function ErrorNote({ error, onRetry }: { error: AdminError | Error; onRetry?: () => void }) {
  const notOn = (error as AdminError).code === 'not_switched_on';
  return (
    <View style={[styles.error, notOn && { borderColor: AdminColors.line }]}>
      <Text style={[styles.errorText, notOn && { color: AdminColors.dim }]}>{error.message}</Text>
      {onRetry && !notOn ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Placeholder for a page another part of the dashboard work is still building. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <AdminPage title={title}>
      <Panel>
        <Text style={styles.empty}>This page is being built. It will show up here once it is ready.</Text>
      </Panel>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  page: { padding: 32, gap: 20, width: '100%', maxWidth: 1360, alignSelf: 'center' },
  pagePhone: { padding: 16, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 4 },
  title: { fontFamily: font(800, 'display'), fontSize: 44, lineHeight: 46, color: AdminColors.text, letterSpacing: -0.4 },
  subtitle: { fontFamily: font(500), fontSize: 15, lineHeight: 21, color: AdminColors.dim, maxWidth: 640 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  panel: { backgroundColor: AdminColors.panel, borderRadius: 16, padding: 18, gap: 14, borderWidth: 1, borderColor: AdminColors.line },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  panelTitle: { fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 26, color: AdminColors.text },
  field: { flexDirection: 'row', gap: 16, paddingVertical: 9, alignItems: 'flex-start' },
  fieldLine: { borderTopWidth: 1, borderTopColor: AdminColors.line },
  fieldKey: { fontFamily: font(600), fontSize: 14, color: AdminColors.dim, width: 150 },
  fieldVal: { fontFamily: font(500), fontSize: 15, color: AdminColors.text, textAlign: 'right' },
  center: { padding: 32, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: font(500), fontSize: 15, lineHeight: 22, color: AdminColors.dim, paddingVertical: 8 },
  error: { borderWidth: 1, borderColor: AdminColors.danger, borderRadius: 12, padding: 14, gap: 10, alignItems: 'flex-start' },
  errorText: { fontFamily: font(600), fontSize: 15, lineHeight: 21, color: AdminColors.danger },
  retry: { backgroundColor: AdminColors.raised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { fontFamily: font(600), fontSize: 14, color: AdminColors.text },
});
