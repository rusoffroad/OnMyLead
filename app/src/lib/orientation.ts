import * as ScreenOrientation from 'expo-screen-orientation';
import { Dimensions, Platform } from 'react-native';

import { isTabletScreen } from '@/core/layout';

/**
 * Phones stay upright; tablets turn either way. On iPhone and iPad the app's Info.plist already
 * says so (app.json: iPhone portrait only, iPad all four ways, which also turns on Split View and
 * Slide Over). Android has one manifest for phones and tablets, so the app leaves rotation open
 * there and locks a phone-sized screen upright here. It checks again when the screen changes size,
 * so a foldable unfolded to tablet size can turn. (Android 16 and later ignore the lock on
 * tablet-sized screens anyway.) Returns a stop function.
 */
export function startOrientationRule(): () => void {
  if (Platform.OS !== 'android') return () => {};
  let phone: boolean | null = null;
  const apply = () => {
    const { width, height } = Dimensions.get('screen');
    const nowPhone = !isTabletScreen(width, height);
    if (nowPhone === phone) return;
    phone = nowPhone;
    const done = nowPhone
      ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      : ScreenOrientation.unlockAsync();
    done.catch(() => {});
  };
  apply();
  const sub = Dimensions.addEventListener('change', apply);
  return () => sub.remove();
}
