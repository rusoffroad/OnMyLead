import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { deviceLine } from '@/core/contact';

/** "iPhone 16 Pro, iOS 27.0, OnMyLead 1.0.1 (4)", or the browser on the website. Goes with bug reports. */
export function deviceSummary(): string {
  const web = Platform.OS === 'web';
  const cfg = Constants.expoConfig;
  const build = Platform.OS === 'ios' ? cfg?.ios?.buildNumber : Platform.OS === 'android' ? cfg?.android?.versionCode : null;
  return deviceLine({
    model: web ? `Website, ${Device.osName ?? 'browser'}` : Device.modelName,
    os: web ? null : Device.osName,
    osVersion: web ? null : Device.osVersion,
    version: web ? null : cfg?.version,
    build: build == null ? null : String(build),
  });
}

export const isTablet = () => Device.deviceType === Device.DeviceType.TABLET;
