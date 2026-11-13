/**
 * Bridge to the CarPlay screen (modules/onmylead-carplay). Safe everywhere: on the web, on
 * Android and in builds without the native module it does nothing.
 */
import { requireOptionalNativeModule } from 'expo';

import { carPlayLabels, type CarChat, type CarPlayLabels, type CarPlayMapState, type CarPlayMessage, type CarPlayState } from '@/core/carplay';
import type { CarLayerRow, CarTrails } from '@/core/car-layers';

type Subscription = { remove(): void };
type CarPlayNative = {
  setRide(state: CarPlayState): void;
  clearRide(): void;
  /** Missing in the first CarPlay builds; optional so an older native module still works. */
  setLabels?(labels: CarPlayLabels): void;
  /** Map Mode's dash (3.0). Optional like setLabels. */
  setMap?(state: CarPlayMapState): void;
  clearMap?(): void;
  /** 3.1, optional like setMap: Map Features on the car map and its Layers screen. */
  setTrails?(data: { trails: CarTrails; rows: CarLayerRow[] }): void;
  /** 3.1: the car's home screen offers Open Ride Mode while this phone shares on a ride. */
  setHome?(data: { sharingRide: boolean }): void;
  /** 3.1: the group chats on the car, and the one open there. */
  setChats?(data: { chats: CarPlayMessage[] }): void;
  setChat?(chat: CarChat): void;
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

/** Map Mode on the car screen. Ride Mode's screen wins while a ride is on the car. */
export function showMapOnCarPlay(state: CarPlayMapState) {
  native?.setMap?.(state);
}

export function clearCarPlayMap() {
  native?.clearMap?.();
}

export function onCarPlayAction(listener: (id: string) => void): Subscription {
  return native?.addListener('onAction', (e) => listener(e.id)) ?? { remove() {} };
}

/**
 * Sends the car screen's fixed words in the rider's language. The root layout calls it at launch,
 * on a language change and when the plan changes (`proNeeded` turns the waiting screen into the Pro notice).
 */
export function syncCarPlayLabels(proNeeded = false) {
  native?.setLabels?.(carPlayLabels(proNeeded));
}

/** The Map Features the car map draws, and the rows of its Layers screen. */
export function showTrailsOnCarPlay(trails: CarTrails, rows: CarLayerRow[]) {
  native?.setTrails?.({ trails, rows });
}

export function setCarPlayHome(sharingRide: boolean) {
  native?.setHome?.({ sharingRide });
}

export function showChatsOnCarPlay(chats: CarPlayMessage[]) {
  native?.setChats?.({ chats });
}

export function showChatOnCarPlay(chat: CarChat) {
  native?.setChat?.(chat);
}
