import { describe, expect, it } from 'vitest';
import { checkRideRange, fuelRange } from '../fuel';
import { decideJoin, Member, promoteFromWaitlist } from '../joining';
import { distanceM, fuzzLocation, metersToMiles } from '../geo';
import { parseTime } from '../time';

describe('fuel range', () => {
  it('adds extra fuel and applies the thirds rule', () => {
    const r = fuelRange({ tankGallons: 9.5, extraGallons: 3.5, mpg: 12 });
    expect(r.fullRangeMiles).toBe(156);
    expect(r.safeTurnaroundMiles).toBe(52);
    expect(r.safeTripMiles).toBe(104);
  });

  it('classifies a ride against range', () => {
    const p = { tankGallons: 9.5, extraGallons: 3.5, mpg: 12 };
    expect(checkRideRange(90, p)).toBe('ok');
    expect(checkRideRange(140, p)).toBe('tight');
    expect(checkRideRange(170, p)).toBe('over');
  });
});

describe('joining and waitlist', () => {
  const m = (userId: string, status: Member['status'], createdAt: number, riders = 1, vehicles = 1): Member => ({
    userId, status, createdAt, riders, vehicles,
  });

  it('applies the join policy and caps', () => {
    const members = [m('a', 'joined', 1), m('b', 'joined', 2)];
    expect(decideJoin('open', false, members, { maxVehicles: 3 }, { riders: 1, vehicles: 1 })).toBe('joined');
    expect(decideJoin('open', false, members, { maxVehicles: 2 }, { riders: 1, vehicles: 1 })).toBe('waitlisted');
    expect(decideJoin('approval', false, members, {}, { riders: 1, vehicles: 1 })).toBe('pending');
    expect(decideJoin('invite_only', false, members, {}, { riders: 1, vehicles: 1 })).toBe('rejected');
    expect(decideJoin('invite_only', true, members, {}, { riders: 1, vehicles: 1 })).toBe('joined');
  });

  it('counts a two-seat machine as one vehicle and two riders', () => {
    const members = [m('a', 'joined', 1, 2, 1)];
    expect(decideJoin('open', false, members, { maxRiders: 3 }, { riders: 2, vehicles: 1 })).toBe('waitlisted');
    expect(decideJoin('open', false, members, { maxVehicles: 2 }, { riders: 2, vehicles: 1 })).toBe('joined');
  });

  it('promotes the waitlist in order without letting anyone skip ahead', () => {
    const members = [
      m('a', 'cancelled', 1),
      m('b', 'joined', 2),
      m('w1', 'waitlisted', 3, 2, 1),
      m('w2', 'waitlisted', 4),
    ];
    const caps = { maxRiders: 2 };
    const after = promoteFromWaitlist(members, caps);
    // w1 needs 2 seats but only 1 is free, so nobody is promoted ahead of w1.
    expect(after.find((x) => x.userId === 'w1')!.status).toBe('waitlisted');
    expect(after.find((x) => x.userId === 'w2')!.status).toBe('waitlisted');
    const roomier = promoteFromWaitlist(members, { maxRiders: 4 });
    expect(roomier.filter((x) => x.status === 'joined').map((x) => x.userId)).toEqual(['b', 'w1', 'w2']);
  });
});

describe('geo', () => {
  it('measures about a mile per 1/69 degree of latitude', () => {
    expect(metersToMiles(distanceM({ lat: 38, lng: -109 }, { lat: 38 + 1 / 69, lng: -109 }))).toBeCloseTo(1, 1);
  });

  it('fuzzes a public meeting point to within about a mile', () => {
    const p = { lat: 38.5733, lng: -109.5498 };
    const f = fuzzLocation(p);
    expect(metersToMiles(distanceM(p, f))).toBeLessThan(0.75);
    expect(f).not.toEqual(p);
  });
});

describe('parseTime', () => {
  it('reads common ways riders type a time', () => {
    expect(parseTime('8:00 am')).toBe(480);
    expect(parseTime('8am')).toBe(480);
    expect(parseTime('2:30 pm')).toBe(870);
    expect(parseTime('14:30')).toBe(870);
    expect(parseTime('12 am')).toBe(0);
    expect(parseTime('12pm')).toBe(720);
    expect(parseTime('13 pm')).toBeNull();
    expect(parseTime('soon')).toBeNull();
  });
});
