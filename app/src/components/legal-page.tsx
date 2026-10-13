import { router } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export type LegalSection = { title: string; body: string[] };

/**
 * A plain reading page for the Terms of Use, the Privacy Policy and Help.
 */
export function LegalPage({ title, updated, intro, sections, action }: {
  title: string; updated: string; intro: string; sections: LegalSection[];
  /** A button under the intro, e.g. Contact Us on the Support page. */
  action?: { title: string; href: '/contact' };
}) {
  return (
    <Screen>
      <Head>
        <title>{`${title} | OnMyLead`}</title>
      </Head>
      <View style={styles.wrap}>
        <ThemedText type="subtitle" accessibilityRole="header">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Last updated {updated}</ThemedText>
        <ThemedText style={styles.p}>{intro}</ThemedText>
        {action ? <Button title={action.title} onPress={() => router.push(action.href)} style={{ alignSelf: 'flex-start', paddingHorizontal: Spacing.four }} /> : null}
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
  section: { gap: Spacing.two, marginTop: Spacing.three },
  p: { lineHeight: 24 },
});
