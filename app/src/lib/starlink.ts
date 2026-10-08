/**
 * Reads status straight from a Starlink dish over its local, unofficial gRPC-web API.
 *
 * Only works from the native app while the phone is on the dish's Wi-Fi. SpaceX does not
 * support this API, there is no public cloud API for plan, billing or usage, and firmware
 * updates have broken local access before, so every failure here is expected and shown
 * as a plain "join your Starlink Wi-Fi, then retry". The wire format lives in
 * core/starlink-proto (pure and unit tested); this file only does the network call.
 */
import { Platform } from 'react-native';

import {
  decodeHistory, decodeStatus, historyRequest, parseGrpcWeb, statusRequest, type DishHistory, type DishStatus,
} from '@/core/starlink-proto';

export type { DishHistory, DishStatus } from '@/core/starlink-proto';
export { compassPoint, dishHeadline, formatMbps, formatPercent, formatSeconds, formatUptime } from '@/core/starlink-proto';

export const DISH_HOST = '192.168.100.1';
const ENDPOINT = `http://${DISH_HOST}:9201/SpaceX.API.Device.Device/Handle`;

/** Why the dish could not be read, so the screen can say something useful. */
export type DishErrorKind = 'web' | 'unreachable' | 'timeout' | 'refused' | 'unreadable';

export class DishError extends Error {
  constructor(public kind: DishErrorKind, message: string) {
    super(message);
  }
}

/** The local API can't be reached from a web page (mixed content, CORS, private network rules). */
export const dishReadSupported = Platform.OS !== 'web';

async function call(frame: Uint8Array, timeoutMs: number): Promise<Uint8Array> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc-web+proto',
        Accept: 'application/grpc-web+proto',
        'X-Grpc-Web': '1',
      },
      body: frame as unknown as BodyInit,
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted) throw new DishError('timeout', 'The dish did not answer in time.');
    throw new DishError('unreachable', e instanceof Error ? e.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new DishError('refused', `The dish refused the request (HTTP ${res.status}).`);
  const headerStatus = res.headers.get('grpc-status');
  const body = new Uint8Array(await res.arrayBuffer());
  let reply;
  try {
    reply = parseGrpcWeb(body);
  } catch {
    throw new DishError('unreadable', 'The dish sent something we could not read.');
  }
  const status = reply.status ?? (headerStatus != null ? Number(headerStatus) : 0);
  if (status !== 0) {
    const msg = reply.statusMessage ?? res.headers.get('grpc-message');
    throw new DishError('refused', `The dish said no${msg ? `: ${msg}` : ''} (code ${status}). A firmware update may have changed its API.`);
  }
  if (!reply.message) throw new DishError('unreadable', 'The dish answered with an empty reply.');
  return reply.message;
}

export type DishReading = { status: DishStatus; history: DishHistory | null; readAt: number };

/** Ask the dish for its current status. */
export async function readStatus(timeoutMs = 5000): Promise<DishStatus> {
  if (!dishReadSupported) throw new DishError('web', 'Reading the dish only works in the phone app.');
  const bytes = await call(statusRequest(), timeoutMs);
  try {
    return decodeStatus(bytes);
  } catch (e) {
    throw new DishError('unreadable', e instanceof Error ? e.message : 'Could not read the status.');
  }
}

/** The dish's last 15 minutes, or null if it won't share them (some firmware or routers refuse). */
export async function readHistory(timeoutMs = 8000): Promise<DishHistory | null> {
  if (!dishReadSupported) return null;
  try {
    return decodeHistory(await call(historyRequest(), timeoutMs));
  } catch {
    return null;
  }
}

/** Ask the dish for its status, then (best effort) its recent history. */
export async function readDish(timeoutMs = 5000): Promise<DishReading> {
  const status = await readStatus(timeoutMs);
  const history = await readHistory(timeoutMs);
  return { status, history, readAt: Date.now() };
}
