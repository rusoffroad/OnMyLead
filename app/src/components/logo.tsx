import { Image } from 'expo-image';

import { currentScheme } from '@/constants/theme';

import { t } from '@/lib/i18n';
const wordmark = require('../../assets/images/logo-wordmark.png');
// The same artwork with the white lettering and mountains in logo navy, for the light themes.
const wordmarkLight = require('../../assets/images/logo-wordmark-light.png');

// The logo artwork cut out of its navy tile, so it sits straight on the app's background.
export function Logo({ height = 120 }: { height?: number }) {
  return (
    <Image
      source={currentScheme() === 'light' ? wordmarkLight : wordmark}
      accessibilityLabel={t('OnMyLead by RUS Offroad')}
      contentFit="contain"
      style={{ height, width: '100%' }}
    />
  );
}
