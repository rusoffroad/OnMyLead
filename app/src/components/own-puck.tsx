import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { View } from 'react-native';

import { ownArrow, riderHeading, screenAngle } from '@/core/heading';
import { useDotStylePref, useOwnDotD } from '@/hooks/use-dot-size';
import { useCompass } from '@/lib/compass';
import { OwnDot } from './own-dot';
import { useGlide } from './use-glide';

import { t } from '@/lib/i18n';


export type OwnPuckFix = { lat: number; lng: number; course: number | null; speed: number | null; lastCourse?: number | null };

/**
 * The newest fix of the phone's own dot and the map's turn, kept outside React state so a moving
 * dot redraws only itself, never the map and every rider on it.
 */
export function useOwnPuckStore() {
  const [store] = useState(() => {
    let fix: OwnPuckFix | null = null;
    let lastCourse: number | null = null;
    let mapHeading = 0;
    const listeners = new Set<() => void>();
    const emit = () => listeners.forEach((l) => l());
    return {
      setFix(f: OwnPuckFix) {
        // The last real GPS direction, for when the rider stops and there is no compass.
        lastCourse = riderHeading({ speedMps: f.speed, headingDeg: f.course }, true) ?? lastCourse;
        fix = { ...f, lastCourse };
        emit();
      },
      setHeading(h: number) {
        if (h === mapHeading) return;
        mapHeading = h;
        emit();
      },
      subscribe(l: () => void) {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      },
      fix: () => fix,
      mapHeading: () => mapHeading,
    };
  });
  return store;
}
export type OwnPuckStore = ReturnType<typeof useOwnPuckStore>;

/** The store's fix and map turn, for the component drawing the dot. */
export function useOwnPuck(store: OwnPuckStore) {
  const fix = useSyncExternalStore(store.subscribe, store.fix, store.fix);
  const mapHeading = useSyncExternalStore(store.subscribe, store.mapHeading, store.mapHeading);
  return { fix, mapHeading };
}

/**
 * Your own dot (2.1) in the rider's Dot Style, with its arrow built in and a beam ahead of it. The arrow always
 * shows: the GPS course while moving, the phone's compass when stopped (core/heading ownArrow).
 * `Marker` is the map's own marker (Mapbox on the apps and the website), handed in so this file
 * doesn't depend on which map draws it.
 */
export function OwnPuck({ store, Marker }: { store: OwnPuckStore; Marker: (p: { at: { lat: number; lng: number }; children: ReactNode }) => ReactNode }) {
  const { fix, mapHeading } = useOwnPuck(store);
  if (!fix) return null;
  return <OwnPuckAt fix={fix} mapHeading={mapHeading} Marker={Marker} />;
}

function OwnPuckAt({ fix, mapHeading, Marker }: { fix: OwnPuckFix; mapHeading: number; Marker: (p: { at: { lat: number; lng: number }; children: ReactNode }) => ReactNode }) {
  const at = useGlide(fix.lat, fix.lng);
  const compass = useCompass();
  const d = useOwnDotD();
  const [style] = useDotStylePref();
  const arrow = ownArrow({ speedMps: fix.speed, headingDeg: fix.course }, compass, fix.lastCourse);
  return (
    <Marker at={at}>
      <View accessible accessibilityLabel={t('You are here')}>
        <OwnDot style={style} d={d} moving={arrow.moving} angle={arrow.deg == null ? null : screenAngle(arrow.deg, mapHeading)} />
      </View>
    </Marker>
  );
}
