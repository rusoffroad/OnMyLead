import { describe, expect, it } from 'vitest';
import { DISH_MODELS, batteryWhFromAh, budgetSummary, formatHours, formatWh, powerBudget, typicalWatts } from '../power';

describe('dish models', () => {
  it('has typical watts for Mini and Standard', () => {
    expect(DISH_MODELS.find((d) => d.value === 'mini')!.watts).toEqual([25, 40]);
    expect(DISH_MODELS.find((d) => d.value === 'standard')!.watts).toEqual([50, 75]);
    expect(typicalWatts('mini')).toBe(33);
    expect(typicalWatts('standard')).toBe(63);
    expect(typicalWatts('other')).toBeNull();
    expect(typicalWatts(null)).toBeNull();
  });
});

describe('power budget', () => {
  it('runs a Mini off a 100Ah 12V lithium battery with no sun', () => {
    // 30 W / 0.9 = 33.3 W from the battery; 1200 Wh * 0.9 = 1080 Wh usable.
    const b = powerBudget({ dishWatts: 30, hoursPerDay: 8, batteryAh: 100, batteryVolts: 12 });
    expect(batteryWhFromAh(100, 12)).toBe(1200);
    expect(b.batteryWh).toBe(1200);
    expect(b.usableWh).toBeCloseTo(1080);
    expect(b.runtimeHours).toBeCloseTo(32.4);
    expect(b.dailyUseWh).toBeCloseTo(266.67, 1);
    expect(b.dailySolarWh).toBe(0);
    expect(b.daysOfPower).toBeCloseTo(4.05, 2);
  });

  it('prefers Wh when given, and applies usable %, efficiency and solar', () => {
    const b = powerBudget({
      dishWatts: 60, hoursPerDay: 10, batteryWh: 1000, batteryAh: 999, batteryVolts: 99,
      usablePercent: 50, solarWatts: 200, sunHours: 6, solarEfficiencyPercent: 80, conversionEfficiencyPercent: 100,
    });
    expect(b.batteryWh).toBe(1000);
    expect(b.usableWh).toBe(500);
    expect(b.dailyUseWh).toBe(600);
    expect(b.dailySolarWh).toBe(960);
    expect(b.dailyBalanceWh).toBe(360);
    expect(b.daysOfPower).toBeNull();
    expect(b.runtimeHours).toBeCloseTo(8.33, 2);
  });

  it('defaults to 5 sun hours and 75% solar efficiency', () => {
    const b = powerBudget({ dishWatts: 45, hoursPerDay: 12, batteryWh: 500, solarWatts: 100 });
    expect(b.dailySolarWh).toBe(375);
    expect(b.dailyUseWh).toBe(600);
    expect(b.dailyBalanceWh).toBe(-225);
    expect(b.daysOfPower).toBe(2);
  });

  it('clamps nonsense input instead of producing negative numbers', () => {
    const b = powerBudget({ dishWatts: -5, hoursPerDay: 40, batteryWh: -100, solarWatts: -1 });
    expect(b.dailyUseWh).toBe(0);
    expect(b.usableWh).toBe(0);
    expect(b.dailySolarWh).toBe(0);
    expect(b.runtimeHours).toBe(Infinity);
    expect(powerBudget({ dishWatts: 50, hoursPerDay: 30 }).dailyUseWh).toBeCloseTo(50 / 0.9 * 24);
  });
});

describe('formatting', () => {
  it('formats hours, Wh and a summary', () => {
    expect(formatHours(32.4)).toBe('32 h 24 min');
    expect(formatHours(0.5)).toBe('30 min');
    expect(formatHours(3)).toBe('3 h');
    expect(formatHours(Infinity)).toBe('No limit');
    expect(formatWh(1234.4)).toBe('1,234 Wh');
    expect(budgetSummary(powerBudget({ dishWatts: 0, hoursPerDay: 0 }), 0)).toMatch(/Enter the dish watts/);
    expect(budgetSummary(powerBudget({ dishWatts: 30, hoursPerDay: 6, batteryWh: 1200 }), 6)).toBe('At 6 h a day the battery lasts about 5.4 days.');
    expect(budgetSummary(powerBudget({ dishWatts: 30, hoursPerDay: 8, batteryWh: 1200, solarWatts: 200 }), 8)).toMatch(/^Solar keeps up/);
    expect(budgetSummary(powerBudget({ dishWatts: 75, hoursPerDay: 24, batteryWh: 500 }), 24)).toMatch(/runs out on day one, after about 5 h 24 min/);
    expect(budgetSummary(powerBudget({ dishWatts: 30, hoursPerDay: 8 }), 8)).toMatch(/Add your battery or solar/);
  });
});
