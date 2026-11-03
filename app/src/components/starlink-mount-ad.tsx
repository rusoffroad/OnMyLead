import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { useFlag } from '@/lib/app-settings';
import { STARLINK_MOUNT, findBySlug, formatPrice, openFeatured, rusProducts, type RusProduct } from '@/lib/rus';
import { ThemedText } from './themed-text';
import { Button, Card } from './ui';

const CAMPAIGN = 'starlink page mount';
// Chris's product photo (2026-11-03), bundled so the ad always shows it.
const PHOTO = require('../../assets/images/starlink-mini-mount-v2.webp');

/**
 * A clearly labelled ad for the RUS Starlink Mini Mount V2 (Morelock Series) on the Starlink page.
 * The name, copy and photo are fixed here; only the price comes from the live store, so store
 * wording never shows. Without the store it still shows (no price) and links to the product page. The owner
 * can switch it off on the Admin Dashboard (Starlink Mount Ad).
 */
export function StarlinkMountAd() {
  const theme = useTheme();
  const { wide } = useLayout();
  const on = useFlag('starlink_mount_ad');
  const [product, setProduct] = useState<RusProduct | null>(null);

  useEffect(() => {
    let live = true;
    rusProducts().then((products) => live && setProduct(findBySlug(products, STARLINK_MOUNT.slug)));
    return () => {
      live = false;
    };
  }, []);

  if (!on) return null;

  const price = formatPrice(product?.priceCents ?? null);
  const size = wide ? 160 : 112;
  return (
    <Card>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 700, letterSpacing: 1 }}>
        AD · FROM RUS OFFROAD
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
        <Image
          source={PHOTO}
          style={{ width: size, height: size, borderRadius: 14, backgroundColor: '#fff' }}
          contentFit="contain"
          accessibilityLabel={`${STARLINK_MOUNT.title}, ${STARLINK_MOUNT.series}`}
          accessibilityIgnoresInvertColors
        />
        <View style={{ flex: 1, gap: 4 }}>
          <ThemedText type="subtitle">{STARLINK_MOUNT.title}</ThemedText>
          <ThemedText style={{ color: theme.accent, fontWeight: 700 }}>{STARLINK_MOUNT.series}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Ride with your Starlink Mini mounted on your rig. Made by RUS Offroad, the team behind OnMyLead.
          </ThemedText>
          {price ? <ThemedText style={{ fontWeight: 700 }}>{price}</ThemedText> : null}
        </View>
      </View>
      <Button
        title="Shop the Mount"
        accessibilityLabel={`Shop the ${STARLINK_MOUNT.title} ${STARLINK_MOUNT.series} at rusoffroad.com`}
        accessibilityRole="link"
        onPress={() => openFeatured(product, STARLINK_MOUNT.url, CAMPAIGN)}
      />
    </Card>
  );
}
