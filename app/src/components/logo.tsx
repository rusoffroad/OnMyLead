import { Image } from 'expo-image';

const wordmark = require('../../assets/images/logo-wordmark.png');

// The logo artwork cut out of its navy tile, so it sits straight on the app's dark background.
export function Logo({ height = 120 }: { height?: number }) {
  return (
    <Image
      source={wordmark}
      accessibilityLabel="OnMyLead by RUS Offroad"
      contentFit="contain"
      style={{ height, width: '100%' }}
    />
  );
}
