/**
 * Bridge to the CarPlay screen (modules/onmylead-carplay). Safe everywhere: on the web, on
 * Android and in builds without the native module it does nothing.
 */
import { requireOptionalNativeModule } from 'expo';

import type { CarPlayState } from '@/core/carplay';

type Subscription = { remove(): void };
type CarPlayNative = {
  setRide(state: CarPlayState): void;
  clearRide(): void;
  addListener(event: 'onAction', listener: (e: { id: string }) => void): Subscription;
};

const native = requireOptionalNativeModule<CarPlayNative>('OnMyLeadCarPlay');

export const carPlayAvailable = native != null;

export function showRideOnCarPlay(state: CarPlayState) {
  native?.setRide(state);
}

export function clearCarPlay() {
  native?.clearRide();
}

export function onCarPlayAction(listener: (id: string) => void): Subscription {
  return native?.addListener('onAction', (e) => listener(e.id)) ?? { remove() {} };
}
