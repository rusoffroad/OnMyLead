import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

/**
 * One block of a menu: an optional heading over rows that share a surface, divided by hairlines.
 * Falsy children (a row switched off by a flag) are skipped, and an empty group draws nothing.
 */
export function MenuGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  if (!rows.length) return null;
  return (
    <View style={{ gap: Spacing.two }}>
      {title ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityRole="header" style={styles.title}>
          {title}
        </ThemedText>
      ) : null}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/** A menu row: a coloured icon tile, a name, what's in it now, and a chevron when it opens something. */
export function MenuRow({
  icon, color = Colors.textSecondary, title, detail, onPress, right, children,
}: {
  icon: IconName;
  color?: string;
  title: string;
  detail?: string | null;
  onPress?: () => void;
  right?: ReactNode;
  /** Shown under the row, inside it (e.g. a choice that edits the setting in place). */
  children?: ReactNode;
}) {
  const body = (
    <>
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: `${color}1F` }]}>
          <Icon name={icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <ThemedText style={styles.rowTitle}>{title}</ThemedText>
          {detail ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{detail}</ThemedText> : null}
        </View>
        {right ?? (onPress ? <Icon name="chevron" size={20} color={Colors.textSecondary} /> : null)}
      </View>
      {children ? <View style={styles.below}>{children}</View> : null}
    </>
  );
  if (!onPress) return <View>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => pressed && { backgroundColor: Colors.backgroundSelected }}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: 600, paddingHorizontal: Spacing.one },
  group: { borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundElement },
  divider: { height: 1, marginLeft: 66, backgroundColor: Colors.backgroundSelected },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, minHeight: 64, paddingVertical: 10 },
  tile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 17, lineHeight: 22, fontWeight: 600 },
  below: { paddingLeft: 66, paddingRight: 14, paddingBottom: 14 },
});
