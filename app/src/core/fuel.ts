/** Fuel range: (tank + extra fuel) x mpg, with the overlander's thirds rule for a safe turnaround. */

export type FuelProfile = {
  tankGallons: number;
  extraGallons: number;
  mpg: number;
};

export type FuelRange = {
  totalGallons: number;
  fullRangeMiles: number;
  /** One third out, one third back, one third reserve. */
  safeTurnaroundMiles: number;
  /** Total distance that keeps a one-third reserve (out and back combined). */
  safeTripMiles: number;
};

export function fuelRange(p: FuelProfile): FuelRange {
  const totalGallons = Math.max(0, p.tankGallons) + Math.max(0, p.extraGallons);
  const fullRangeMiles = totalGallons * Math.max(0, p.mpg);
  return {
    totalGallons,
    fullRangeMiles,
    safeTurnaroundMiles: fullRangeMiles / 3,
    safeTripMiles: (fullRangeMiles * 2) / 3,
  };
}

export type RangeCheck = 'ok' | 'tight' | 'over';

/** Compare a planned ride distance with a machine's range. */
export function checkRideRange(rideMiles: number, p: FuelProfile): RangeCheck {
  const r = fuelRange(p);
  if (rideMiles > r.fullRangeMiles) return 'over';
  if (rideMiles > r.safeTripMiles) return 'tight';
  return 'ok';
}
