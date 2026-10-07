/** Starlink power budget: how long a battery runs the dish and whether solar keeps up. Pure, no I/O. */

export type DishModel = 'mini' | 'standard' | 'standard_actuated' | 'high_performance' | 'flat_high_performance' | 'other';

/** Typical draw while connected. Real use swings with load, heating (snow) and temperature. */
export const DISH_MODELS: { value: DishModel; label: string; watts: [number, number] | null }[] = [
  { value: 'mini', label: 'Mini', watts: [25, 40] },
  { value: 'standard', label: 'Standard', watts: [50, 75] },
  { value: 'standard_actuated', label: 'Standard Actuated', watts: [50, 75] },
  { value: 'high_performance', label: 'High Performance', watts: [110, 150] },
  { value: 'flat_high_performance', label: 'Flat High Perf.', watts: [110, 150] },
  { value: 'other', label: 'Other', watts: null },
];

export const isDishModel = (s: string): s is DishModel => DISH_MODELS.some((d) => d.value === s);

export type PowerSource = 'vehicle_12v' | 'aux_battery' | 'power_station' | 'solar_battery' | 'generator' | 'shore' | 'other';

export const POWER_SOURCES: { value: PowerSource; label: string }[] = [
  { value: 'vehicle_12v', label: 'Vehicle 12V' },
  { value: 'aux_battery', label: 'Aux battery' },
  { value: 'power_station', label: 'Power station' },
  { value: 'solar_battery', label: 'Solar + battery' },
  { value: 'generator', label: 'Generator' },
  { value: 'shore', label: 'Wall / shore' },
  { value: 'other', label: 'Other' },
];

/** Midpoint of the model's typical range, rounded; null when we have no typical figure. */
export function typicalWatts(model: DishModel | null | undefined): number | null {
  const w = DISH_MODELS.find((d) => d.value === model)?.watts;
  return w ? Math.round((w[0] + w[1]) / 2) : null;
}

export const batteryWhFromAh = (ah: number, volts: number) => ah * volts;

export type PowerInput = {
  dishWatts: number;
  hoursPerDay: number;
  /** Battery capacity in watt-hours. Give this, or amp-hours plus volts. */
  batteryWh?: number | null;
  batteryAh?: number | null;
  batteryVolts?: number | null;
  /** Share of the battery you can use: about 90% for lithium (LiFePO4), 50% for lead-acid. Default 90. */
  usablePercent?: number | null;
  solarWatts?: number | null;
  /** Peak sun hours per day. Default 5 (a clear summer day in the US Southwest is 6-7, winter or cloudy 2-3). */
  sunHours?: number | null;
  /** Share of panel rating you actually get (heat, angle, dust, charge controller). Default 75%. */
  solarEfficiencyPercent?: number | null;
  /** DC-DC or inverter efficiency between battery and dish. Default 90%. */
  conversionEfficiencyPercent?: number | null;
};

export type PowerBudget = {
  /** Energy the dish pulls from the battery per day, including conversion loss. */
  dailyUseWh: number;
  batteryWh: number;
  usableWh: number;
  /** Hours of continuous use on a full battery with no sun. */
  runtimeHours: number;
  dailySolarWh: number;
  /** Solar in minus dish use per day. Positive means the battery ends the day fuller. */
  dailyBalanceWh: number;
  /** Days until the battery is flat at this rate; null when solar keeps up (or there is no use). */
  daysOfPower: number | null;
};

const pct = (v: number | null | undefined, dflt: number) => (v == null || !Number.isFinite(v) ? dflt : Math.min(100, Math.max(1, v))) / 100;
const nonNeg = (v: number | null | undefined) => (v == null || !Number.isFinite(v) || v < 0 ? 0 : v);

export function powerBudget(input: PowerInput): PowerBudget {
  const watts = nonNeg(input.dishWatts);
  const hours = Math.min(24, nonNeg(input.hoursPerDay));
  const eff = pct(input.conversionEfficiencyPercent, 90);
  const drawW = watts / eff;

  const batteryWh = input.batteryWh != null && input.batteryWh > 0
    ? input.batteryWh
    : input.batteryAh && input.batteryVolts ? batteryWhFromAh(nonNeg(input.batteryAh), nonNeg(input.batteryVolts)) : 0;
  const usableWh = batteryWh * pct(input.usablePercent, 90);

  const dailyUseWh = drawW * hours;
  const dailySolarWh = nonNeg(input.solarWatts) * Math.min(24, input.sunHours == null ? 5 : nonNeg(input.sunHours)) * pct(input.solarEfficiencyPercent, 75);
  const dailyBalanceWh = dailySolarWh - dailyUseWh;

  return {
    dailyUseWh,
    batteryWh,
    usableWh,
    runtimeHours: drawW > 0 ? usableWh / drawW : Infinity,
    dailySolarWh,
    dailyBalanceWh,
    daysOfPower: dailyBalanceWh >= 0 ? null : usableWh / -dailyBalanceWh,
  };
}

export function formatHours(h: number): string {
  if (!Number.isFinite(h)) return 'No limit';
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (!hh) return `${mm} min`;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

export const formatWh = (wh: number) => `${Math.round(wh).toLocaleString('en-US')} Wh`;

/** One plain sentence about the budget. */
export function budgetSummary(b: PowerBudget, hoursPerDay: number): string {
  if (b.dailyUseWh === 0) return 'Enter the dish watts and hours per day to see your budget.';
  if (b.usableWh === 0 && b.dailySolarWh === 0) return `The dish needs about ${formatWh(b.dailyUseWh)} a day. Add your battery or solar to see how long it lasts.`;
  if (b.daysOfPower == null) return `Solar keeps up: about ${formatWh(b.dailyBalanceWh)} to spare each day at ${hoursPerDay} h a day.`;
  if (b.usableWh === 0) return `Solar covers ${Math.round((b.dailySolarWh / b.dailyUseWh) * 100)}% of the dish's daily use. Add a battery to store it.`;
  const days = b.daysOfPower;
  return days < 1
    ? `At ${hoursPerDay} h a day the battery runs out on day one, after about ${formatHours(b.runtimeHours)} of use.`
    : `At ${hoursPerDay} h a day the battery lasts about ${days >= 10 ? Math.round(days) : days.toFixed(1).replace(/\.0$/, '')} days.`;
}
