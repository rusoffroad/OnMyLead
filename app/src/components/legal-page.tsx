import { router } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';

export type LegalSection = { title: string; body: string[] };

/**
 * A plain reading page for the Terms of Use and Privacy Policy. Both are drafts until Chris has
 * reviewed them (and, ideally, a lawyer), so each one carries a visible draft note.
 */
export function LegalPage({ title, updated, intro, sections, draft = true }: {
  title: string; updated: string; intro: string; sections: LegalSection[]; draft?: boolean;
}) {
  return (
    <Screen>
      <Head>
        <title>{`${title} | OnMyLead`}</title>
      </Head>
      <View style={styles.wrap}>
        {draft ? (
          <View style={styles.draft} accessibilityRole="alert">
            <ThemedText type="smallBold">Draft for Review</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">This page is a draft and is not in effect yet.</ThemedText>
          </View>
        ) : null}
        <ThemedText type="subtitle" accessibilityRole="header">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Last updated {updated}</ThemedText>
        <ThemedText style={styles.p}>{intro}</ThemedText>
        {sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <ThemedText type="heading" accessibilityRole="header">{s.title}</ThemedText>
            {s.body.map((p, i) => (
              <ThemedText key={i} style={styles.p} themeColor="textSecondary">{p}</ThemedText>
            ))}
          </View>
        ))}
        <Button
          title="Back to OnMyLead"
          kind="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={{ marginTop: Spacing.four }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: Spacing.two },
  draft: { borderRadius: Radius.card, borderLeftWidth: 4, borderLeftColor: Colors.accent, backgroundColor: Colors.backgroundElement, padding: 14, marginBottom: Spacing.two },
  section: { gap: Spacing.two, marginTop: Spacing.three },
  p: { lineHeight: 24 },
});
