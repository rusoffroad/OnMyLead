import { router, usePathname } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Logo } from '@/components/logo';
import { font } from '@/constants/theme';
import { ADMIN_SECTIONS, sectionFor, type AdminSection } from './nav';
import { AdminColors, useLayoutSize } from './tokens';

/**
 * The dashboard frame: a rail on the left on desktop, a slimmer rail on tablets, and a top bar
 * with a menu on phones. The current page is marked with the logo red.
 */
export function AdminShell({ email, onSignOut, children }: { email: string | null; onSignOut: () => void; children: ReactNode }) {
  const size = useLayoutSize();
  const pathname = usePathname();
  const current = sectionFor(pathname);
  const [menu, setMenu] = useState(false);

  if (size === 'phone') {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <View style={{ width: 120, height: 32 }}><Logo height={32} /></View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: menu }} onPress={() => setMenu((m) => !m)} style={styles.menuBtn}>
            <Text style={styles.menuBtnText}>{menu ? 'Close' : current.title}</Text>
          </Pressable>
        </View>
        {/* The page stays mounted under the menu: unmounting the router's Slot resets it to /admin. */}
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>{children}</ScrollView>
          {menu ? (
            <ScrollView style={[StyleSheet.absoluteFill, styles.phoneMenu]} contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
              <Nav current={current} onPick={() => setMenu(false)} />
              <Account email={email} onSignOut={onSignOut} />
            </ScrollView>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { flexDirection: 'row' }]}>
      <View style={[styles.rail, size === 'tablet' && { width: 200 }]}>
        <View style={styles.brand}>
          <View style={{ height: 52, width: 150 }}><Logo height={52} /></View>
          <Text style={styles.brandSub}>Admin</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }}>
          <Nav current={current} />
        </ScrollView>
        <Account email={email} onSignOut={onSignOut} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>{children}</ScrollView>
    </View>
  );
}

function Nav({ current, onPick }: { current: AdminSection; onPick?: () => void }) {
  const groups = [...new Set(ADMIN_SECTIONS.map((s) => s.group))];
  return (
    <View style={{ gap: 14 }} accessibilityRole="menu">
      {groups.map((g) => (
        <View key={g} style={{ gap: 2 }}>
          <Text style={styles.group}>{g}</Text>
          {ADMIN_SECTIONS.filter((s) => s.group === g).map((s) => {
            const on = s.key === current.key;
            return (
              <Pressable
                key={s.key}
                accessibilityRole="link"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onPick?.();
                  router.navigate(s.href as never);
                }}
                style={({ hovered }) => [styles.item, on ? styles.itemOn : hovered ? { backgroundColor: AdminColors.railLine } : null]}>
                <View style={[styles.itemMark, on && { backgroundColor: AdminColors.red }]} />
                <Text style={[styles.itemText, on && { color: AdminColors.text }]}>{s.title}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Account({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <View style={styles.account}>
      <Text style={styles.email} numberOfLines={1}>{email ?? ''}</Text>
      <Pressable accessibilityRole="button" onPress={onSignOut} style={({ hovered }) => [styles.signOut, hovered && { borderColor: AdminColors.dim }]}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AdminColors.page, minHeight: '100%' as unknown as number },
  rail: { width: 240, backgroundColor: AdminColors.rail, borderRightWidth: 1, borderRightColor: AdminColors.railLine, paddingHorizontal: 12, paddingTop: 20 },
  brand: { paddingHorizontal: 8, paddingBottom: 18, gap: 4, alignItems: 'flex-start' },
  brandSub: { fontFamily: font(700, 'display'), fontSize: 17, color: AdminColors.red, marginLeft: 2 },
  group: { fontFamily: font(600), fontSize: 12.5, color: AdminColors.faint, paddingHorizontal: 12, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingVertical: 9, paddingRight: 12 },
  itemOn: { backgroundColor: AdminColors.panel },
  itemMark: { width: 3, height: 18, borderRadius: 2, backgroundColor: 'transparent', marginLeft: 2 },
  itemText: { fontFamily: font(600), fontSize: 15, color: AdminColors.dim },
  account: { borderTopWidth: 1, borderTopColor: AdminColors.railLine, paddingVertical: 14, paddingHorizontal: 8, gap: 10 },
  email: { fontFamily: font(500), fontSize: 13, color: AdminColors.faint },
  signOut: { alignSelf: 'flex-start', borderWidth: 1, borderColor: AdminColors.line, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6 },
  signOutText: { fontFamily: font(600), fontSize: 13.5, color: AdminColors.text },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: AdminColors.rail, borderBottomWidth: 1, borderBottomColor: AdminColors.railLine },
  menuBtn: { backgroundColor: AdminColors.panel, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: AdminColors.line },
  menuBtnText: { fontFamily: font(700), fontSize: 14.5, color: AdminColors.text },
  phoneMenu: { flex: 1, backgroundColor: AdminColors.rail },
});
