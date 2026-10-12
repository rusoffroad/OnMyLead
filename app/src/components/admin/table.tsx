import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font } from '@/constants/theme';
import { fmtInt } from '@/core/admin-format';
import { Empty, Loading } from './page';
import { AdminColors, tabular, useLayoutSize } from './tokens';

export type Column<T> = {
  key: string;
  title: string;
  render: (row: T) => ReactNode | string;
  /** Fixed width in px; otherwise the column shares space by flex (default 1). */
  width?: number;
  flex?: number;
  align?: 'left' | 'right';
  /** Left out of the phone card view. */
  hideOnPhone?: boolean;
};

/**
 * A list of records. Columns on tablet and desktop; on a phone each row becomes a small card
 * with the first column as its title.
 */
export function DataTable<T>({ columns, rows, rowKey, onRowPress, loading, empty = 'Nothing here yet.' }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowPress?: (r: T) => void;
  loading?: boolean;
  empty?: string;
}) {
  const size = useLayoutSize();
  if (loading && rows.length === 0) return <Loading />;
  if (rows.length === 0) return <Empty text={empty} />;

  const cell = (c: Column<T>, r: T) => {
    const v = c.render(r);
    return typeof v === 'string' || typeof v === 'number'
      ? <Text style={[styles.cellText, tabular, c.align === 'right' && { textAlign: 'right' }]} numberOfLines={2}>{v}</Text>
      : v;
  };

  if (size === 'phone') {
    const [first, ...rest] = columns.filter((c) => !c.hideOnPhone);
    return (
      <View style={{ gap: 8, opacity: loading ? 0.6 : 1 }}>
        {rows.map((r) => (
          <Pressable
            key={rowKey(r)}
            disabled={!onRowPress}
            accessibilityRole={onRowPress ? 'link' : undefined}
            onPress={() => onRowPress?.(r)}
            style={({ pressed }) => [styles.card, pressed && { backgroundColor: AdminColors.raised }]}>
            <View>{cell(first, r)}</View>
            {rest.map((c) => (
              <View key={c.key} style={styles.cardRow}>
                <Text style={styles.cardKey}>{c.title}</Text>
                <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{cell({ ...c, align: 'right' }, r)}</View>
              </View>
            ))}
          </Pressable>
        ))}
      </View>
    );
  }

  const colStyle = (c: Column<T>) => (c.width ? { width: c.width } : { flex: c.flex ?? 1, minWidth: 0 });
  return (
    <View style={{ opacity: loading ? 0.6 : 1 }} accessibilityRole="list">
      <View style={[styles.row, styles.headRow]}>
        {columns.map((c) => (
          <Text key={c.key} style={[styles.headText, colStyle(c), c.align === 'right' && { textAlign: 'right' }]} numberOfLines={1}>{c.title}</Text>
        ))}
      </View>
      {rows.map((r) => (
        <Pressable
          key={rowKey(r)}
          disabled={!onRowPress}
          accessibilityRole={onRowPress ? 'link' : undefined}
          onPress={() => onRowPress?.(r)}
          style={({ hovered, pressed }) => [styles.row, (hovered || pressed) && onRowPress ? { backgroundColor: AdminColors.raised } : null]}>
          {columns.map((c) => (
            <View key={c.key} style={[colStyle(c), c.align === 'right' && { alignItems: 'flex-end' }]}>{cell(c, r)}</View>
          ))}
        </Pressable>
      ))}
    </View>
  );
}

/** Previous and Next, with "51–100 of 340". page is 0-based. */
export function Pager({ page, pageSize, total, count, onPage }: { page: number; pageSize: number; total?: number | null; count: number; onPage: (p: number) => void }) {
  if (page === 0 && count < pageSize && (total == null || total <= pageSize)) {
    return total != null ? <Text style={styles.pagerText}>{fmtInt(total)} {total === 1 ? 'result' : 'results'}</Text> : null;
  }
  const start = page * pageSize + 1;
  const end = page * pageSize + count;
  const hasMore = total != null ? end < total : count === pageSize;
  return (
    <View style={styles.pager}>
      <Text style={[styles.pagerText, tabular]}>
        {count === 0 ? 'No results' : `${fmtInt(start)}–${fmtInt(end)}`}{total != null ? ` of ${fmtInt(total)}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PagerButton label="Previous" disabled={page === 0} onPress={() => onPage(page - 1)} />
        <PagerButton label="Next" disabled={!hasMore} onPress={() => onPage(page + 1)} />
      </View>
    </View>
  );
}

function PagerButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.pagerBtn, disabled && { opacity: 0.35 }]}>
      <Text style={styles.pagerBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: AdminColors.line, borderRadius: 0 },
  headRow: { borderTopWidth: 0, paddingVertical: 8 },
  headText: { fontFamily: font(600), fontSize: 13, color: AdminColors.faint },
  cellText: { fontFamily: font(500), fontSize: 14.5, lineHeight: 20, color: AdminColors.text },
  card: { backgroundColor: AdminColors.page, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: AdminColors.line },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  cardKey: { fontFamily: font(500), fontSize: 13, color: AdminColors.faint },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingTop: 4 },
  pagerText: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  pagerBtn: { backgroundColor: AdminColors.raised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  pagerBtnText: { fontFamily: font(600), fontSize: 14, color: AdminColors.text },
});
