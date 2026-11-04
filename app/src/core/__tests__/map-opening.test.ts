import { describe, expect, it } from 'vitest';

import {
  OPENING_DELTA, OPENING_MAX_TRIES, OPENING_START, openingMoveWanted, openingReached, type OpeningCamera,
} from '../map-center';

const rider = { lat: 39.06, lng: -108.55 };
const state = { latitude: 39.5, longitude: -105.8, latitudeDelta: 6, longitudeDelta: 6 };
const onRider = { latitude: 39.061, longitude: -108.551, latitudeDelta: OPENING_DELTA, longitudeDelta: OPENING_DELTA };

describe('Map Mode opening camera', () => {
  it('waits for the first fix (cold start with no GPS yet)', () => {
    expect(openingMoveWanted(OPENING_START, null)).toBe(false);
    expect(openingMoveWanted(OPENING_START, rider)).toBe(true);
  });

  it('a map still on the default region (the whole state) has not reached the rider', () => {
    expect(openingReached(state, rider)).toBe(false);
    expect(openingReached(null, rider)).toBe(false);
  });

  it('counts the map as on the rider at riding zoom', () => {
    expect(openingReached(onRider, rider)).toBe(true);
  });

  it('is not on the rider when centred elsewhere or still zoomed out over them', () => {
    expect(openingReached({ ...onRider, latitude: 39.2 }, rider)).toBe(false);
    expect(openingReached({ ...onRider, latitudeDelta: 1, longitudeDelta: 1, latitude: rider.lat, longitude: rider.lng }, rider)).toBe(false);
  });

  it('handles the date line', () => {
    const p = { lat: 10, lng: 179.999 };
    expect(openingReached({ latitude: 10, longitude: -179.999, latitudeDelta: OPENING_DELTA, longitudeDelta: OPENING_DELTA }, p)).toBe(true);
  });

  it('stops once done, once the rider moved the map, or after the last try', () => {
    const s = (o: Partial<OpeningCamera>) => ({ ...OPENING_START, ...o });
    expect(openingMoveWanted(s({ done: true }), rider)).toBe(false);
    expect(openingMoveWanted(s({ userMoved: true }), rider)).toBe(false);
    expect(openingMoveWanted(s({ tries: OPENING_MAX_TRIES - 1 }), rider)).toBe(true);
    expect(openingMoveWanted(s({ tries: OPENING_MAX_TRIES }), rider)).toBe(false);
  });
});
