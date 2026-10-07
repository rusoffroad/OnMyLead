import { Image } from 'expo-image';

const banner = require('../../assets/images/logo-banner.png');

// The logo artwork is white and orange on near-black, so it always sits on its own dark tile.
export function LogoBanner({ height = 140 }: { height?: number }) {
  return (
    <Image
      source={banner}
      accessibilityLabel="OnMyLead"
      contentFit="contain"
      style={{ height, width: '100%', borderRadius: 16, backgroundColor: '#0B0B0D' }}
    />
  );
}
