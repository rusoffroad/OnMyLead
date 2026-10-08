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

export type RideFuelAdvice = {
  check: RangeCheck;
  /** Rough share of fuel left at the end of the ride, 0-100, rounded to 5. */
  percentLeft: number;
  /** One plain-language line for the ride page. */
  line: string;
};

/** Fuel check for a planned ride: ok / tight / over with a plain-language line. */
export function rideFuelAdvice(rideMiles: number, p: FuelProfile): RideFuelAdvice {
  const r = fuelRange(p);
  const check = checkRideRange(rideMiles, p);
  const left = r.fullRangeMiles > 0 ? Math.max(0, 1 - rideMiles / r.fullRangeMiles) : 0;
  const percentLeft = Math.round((left * 100) / 5) * 5;
  const extra = p.extraGallons > 0 ? ' (counting your extra fuel)' : '';
  let line: string;
  if (check === 'ok') {
    line = `You’ll have about ${percentLeft}% left${extra}.`;
  } else if (check === 'tight') {
    line = percentLeft > 0
      ? `Tight: about ${percentLeft}% left at the end${extra}. Bring extra fuel or plan a fill-up.`
      : `Tight: you’ll be close to empty${extra}. Bring extra fuel or plan a fill-up.`;
  } else {
    const short = Math.max(1, Math.round(rideMiles - r.fullRangeMiles));
    line = `About ${short} miles more than your range${extra}. Bring extra fuel.`;
  }
  return { check, percentLeft, line };
}
