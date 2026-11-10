import { Image } from 'expo-image';

import { currentScheme } from '@/constants/theme';

import { t } from '@/lib/i18n';
const wordmark = require('../../assets/images/logo-wordmark.png');
// The same artwork with the white lettering and mountains in logo navy, for the light themes.
const wordmarkLight = require('../../assets/images/logo-wordmark-light.png');

// The logo artwork cut out of its navy tile, so it sits straight on the app's background.
// `onDark`: always the white-lettered artwork, for a logo drawn over a photo or map (the 3.0 home header).
export function Logo({ height = 120, onDark }: { height?: number; onDark?: boolean }) {
  return (
    <Image
      source={currentScheme() === 'light' && !onDark ? wordmarkLight : wordmark}
      accessibilityLabel={t('OnMyLead by RUS Offroad')}
      contentFit="contain"
      style={{ height, width: '100%' }}
    />
  );
}
