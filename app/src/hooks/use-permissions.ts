import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { needsAttention, permissionsFor, type PermissionDef, type PermissionId, type PermissionStatus } from '@/core/permissions';
import { useFlag } from '@/lib/app-settings';
import { musicAvailable } from '@/lib/music';
import { nearbyAvailable } from '@/lib/nearby';
import { PERMISSION_PLATFORM, readPermissions } from '@/lib/permissions';

export type PermissionRow = { def: PermissionDef; status: PermissionStatus };

/**
 * You > Permissions: every permission row for this device with its status, read again whenever
 * the screen comes into view and whenever the app comes back from Settings.
 */
export function usePermissions() {
  const bluetoothFlag = useFlag('bluetooth_sharing');
  const musicFlag = useFlag('music_controls');
  const starlinkOn = useFlag('starlink');
  const hide: PermissionId[] = [
    ...(!nearbyAvailable || !bluetoothFlag ? (['bluetooth'] as const) : []),
    ...(!musicAvailable || !musicFlag ? (['music'] as const) : []),
    ...(!starlinkOn ? (['localNetwork'] as const) : []),
  ];
  const defs = permissionsFor(PERMISSION_PLATFORM, hide);
  const [statuses, setStatuses] = useState<Partial<Record<PermissionId, PermissionStatus>> | null>(null);
  const [locationServicesOff, setLocationServicesOff] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const r = await readPermissions();
    if (!alive.current) return;
    setStatuses(r.statuses);
    setLocationServicesOff(r.locationServicesOff);
  }, []);

  useEffect(() => {
    alive.current = true;
    const sub = Platform.OS === 'web' ? null : AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      alive.current = false;
      sub?.remove();
    };
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const rows: PermissionRow[] | null = statuses ? defs.map((def) => ({ def, status: statuses[def.id] ?? 'unknown' })) : null;
  const attention = rows ? needsAttention(rows) : [];
  return { rows, attention, locationServicesOff, refresh };
}
