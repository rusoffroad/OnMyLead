// Points the map colours the core modules export (trail ratings, Track Line days, trail pins) at
// the rider's palette. constants/theme.ts calls this whenever the appearance changes; the app then
// redraws, so every screen reads the new colours from the same exports it always used.

import type { MapInk, Scheme } from './appearance';
import { DIFFICULTIES } from './nav-trails';
import { OBSTACLE_INK } from './obstacles';
import { TRACK_DAY_COLORS } from './track-line';

/** Black-diamond trails draw white on dark screens and near-black on light ones. */
const HARD_ON_LIGHT = '#1A1D22';

export function applyMapInk(ink: MapInk, scheme: Scheme) {
  for (const d of DIFFICULTIES) d.color = d.value === 'hard' && scheme === 'light' ? HARD_ON_LIGHT : ink.difficulty[d.value];
  TRACK_DAY_COLORS.splice(0, TRACK_DAY_COLORS.length, ...ink.trackDays);
  Object.assign(OBSTACLE_INK, ink.obstacle);
}
