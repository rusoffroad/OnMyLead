import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { socialLine, type SocialProfile } from '@/core/social-profile';
import { ProviderMark } from './social-button';

/** Under a rider's name: their Apple, Google or Facebook account, when they chose to show it. */
export function SocialTag({ profile }: { profile: SocialProfile }) {
  return (
    <View style={styles.tag} accessible accessibilityLabel={socialLine(profile)}>
      <ProviderMark provider={profile.provider} size={14} light />
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>{socialLine(profile)}</ThemedText>
    </View>
  );
}

/** The account's photo in place of the initial, falling back to `fallback` if it won't load. */
export function SocialPhoto({ profile, size, fallback }: { profile: SocialProfile | undefined; size: number; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!profile?.photo_url || failed) return <>{fallback}</>;
  return (
    <Image
      source={{ uri: profile.photo_url }}
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.backgroundSelected }}
    />
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
