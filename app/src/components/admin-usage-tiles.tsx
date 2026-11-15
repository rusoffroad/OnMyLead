import { StatGrid, StatTile } from '@/components/admin';
import { fmtInt } from '@/core/admin-format';
import { usageDuration } from '@/core/usage';
import type { UsageSummary } from '@/lib/admin-usage';

/** The real-use numbers, shared with the Overview's Real Use panel. */
export function UsageTiles({ s, compact }: { s: UsageSummary; compact?: boolean }) {
  return (
    <>
      <StatGrid>
        <StatTile label="Real Riders" value={fmtInt(s.riders_total)} tone="pro" hint={`${fmtInt(s.signups)} new; ${fmtInt(s.test_accounts)} test accounts left out`} />
        <StatTile label="Active Today" value={fmtInt(s.active_1d)} hint={`${fmtInt(s.active_30d)} in the last 30 days`} />
        <StatTile label="Rides Created" value={fmtInt(s.rides_created)} hint="By real riders, in this period" />
        <StatTile label="Rides That Happened" value={fmtInt(s.rides_shared)} tone="ok" hint={`Started with 2+ riders sharing; ${fmtInt(s.rides_started)} started in all`} />
      </StatGrid>
      <StatGrid>
        <StatTile label="App Opens" value={fmtInt(s.app.sessions)} hint={`${fmtInt(s.app.riders)} riders, ${usageDuration(s.app.seconds)} in the app`} />
        <StatTile label="Map Mode Riders" value={fmtInt(s.map_mode.riders)} tone="ok" hint={`${fmtInt(s.map_mode.sessions)} sessions, ${usageDuration(s.map_mode.seconds)}`} />
        <StatTile label="Ride Mode Riders" value={fmtInt(s.ride_mode.riders)} tone="admin" hint={`${fmtInt(s.ride_mode.sessions)} sessions, ${usageDuration(s.ride_mode.seconds)}`} />
        {compact ? null : (
          <StatTile label="Time per Rider" value={usageDuration(s.app.riders ? s.app.seconds / s.app.riders : 0)} hint="Average time in the app, in this period" />
        )}
      </StatGrid>
    </>
  );
}
