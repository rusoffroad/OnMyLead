import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { TripCategory } from '@/core/trips';
import { useTheme } from '@/hooks/use-theme';
import {
  formatPrice, matchProducts, openProduct, openStore, rusProducts, type GearSuggestion, type RiderVehicle,
} from '@/lib/rus';
import { ThemedText } from './themed-text';
import { Button, Card } from './ui';

/**
 * A small, clearly labelled block of RUS Offroad products that fit the rider's machine
 * (and checklist, when given). Renders nothing until products load, and nothing at all
 * if the store can't be reached or nothing fits.
 */
export function RusGear({
  vehicle, categories, campaign, limit = 3,
}: {
  vehicle?: RiderVehicle | null;
  categories?: TripCategory[];
  campaign: string;
  limit?: number;
}) {
  const theme = useTheme();
  const [suggestions, setSuggestions] = useState<GearSuggestion[]>([]);
  const catKey = (categories ?? []).join(',');
  const make = vehicle?.make ?? null;
  const model = vehicle?.model ?? null;
  const trim = vehicle?.trim ?? null;
  const year = vehicle?.year ?? null;

  useEffect(() => {
    let live = true;
    rusProducts().then((products) => {
      if (!live) return;
      const cats = catKey ? (catKey.split(',') as TripCategory[]) : undefined;
      setSuggestions(matchProducts(products, { vehicle: { make, model, trim, year }, categories: cats, limit }));
    });
    return () => {
      live = false;
    };
  }, [make, model, trim, year, catKey, limit]);

  if (!suggestions.length) return null;

  return (
    <Card>
      <View style={{ gap: 2 }}>
        <ThemedText type="heading">Gear from RUS Offroad</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Suggestions from RUS Offroad, the team behind OnMyLead.</ThemedText>
      </View>
      {suggestions.map(({ product, reason }) => (
        <View key={product.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: 1, borderTopColor: theme.backgroundSelected, paddingTop: Spacing.two }}>
          {product.image ? (
            <Image source={{ uri: product.image }} style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: '#fff' }} contentFit="contain" accessibilityIgnoresInvertColors />
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText type="small" numberOfLines={2}>{product.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[formatPrice(product.priceCents), reason].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
          <Button title="Buy" kind="secondary" accessibilityLabel={`Buy ${product.name} from RUS Offroad`} onPress={() => openProduct(product, campaign)} />
        </View>
      ))}
      <Pressable accessibilityRole="link" onPress={() => openStore(campaign)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <ThemedText type="small" style={{ color: theme.sky, fontWeight: 700 }}>Shop more at rusoffroad.com</ThemedText>
      </Pressable>
    </Card>
  );
}
