import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker, type UserLocationChangeEvent } from 'react-native-maps';

import { ownFix, screenAngle, type OwnFix } from '@/core/heading';
import { useCompass } from '@/lib/compass';
import { MarkerBody } from './marker-body';
import { OWN_PUCK_D } from './own-puck';
import { puckBox, RiderPuck, YOU_INK } from './rider-puck';

import { t } from '@/lib/i18n';
export type OwnLocation = {
  /** The newest fix of the phone's own dot. */
  last: { current: OwnFix | null };
  subscribe: (l: (f: OwnFix) => void) => () => void;
  /** Goes on the MapView: the map reports its own dot, with speed and course, as it moves. */
  onUserLocationChange: (e: UserLocationChangeEvent) => void;
};

/**
 * The phone's own dot as the map reports it. iPhone, iPad and Android draw that dot themselves
 * but never with a direction, which is why riders saw arrows on everyone but themselves. The
 * newest fix is kept in a ref and handed to listeners, so a moving dot redraws only its arrow,
 * not every rider on the map.
 */
export function useOwnLocation(onFix?: (f: OwnFix) => void): OwnLocation {
  const last = useRef<OwnFix | null>(null);
  const listeners = useRef(new Set<(f: OwnFix) => void>());
  const cb = useRef(onFix);
  useEffect(() => {
    cb.current = onFix;
  }, [onFix]);
  const onUserLocationChange = useCallback((e: UserLocationChangeEvent) => {
    const f = ownFix(e.nativeEvent.coordinate);
    if (!f) return;
    last.current = f;
    listeners.current.forEach((l) => l(f));
    cb.current?.(f);
  }, []);
  const subscribe = useCallback((l: (f: OwnFix) => void) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  }, []);
  const [own] = useState(() => ({ last, subscribe, onUserLocationChange }));
  return own;
}

/**
 * This phone's own dot on the flat maps (used when Mapbox is off): the same cyan puck with its
 * arrow built in as on the Mapbox maps, drawn over the dot the phone draws itself. The arrow always
 * shows: the GPS direction while moving, the compass when stopped, else the last direction.
 */
export function OwnHeadingMarker({ own, mapHeading }: { own: OwnLocation; mapHeading?: number | null }) {
  const [fix, setFix] = useState<OwnFix | null>(own.last.current);
  const [lastCourse, setLastCourse] = useState<number | null>(null);
  useEffect(() => own.subscribe((f) => {
    setFix(f);
    if (f.headingDeg != null) setLastCourse(f.headingDeg);
  }), [own]);
  const compass = useCompass();
  if (!fix) return null;
  const moving = fix.headingDeg != null;
  const deg = fix.headingDeg ?? (compass != null && compass >= 0 ? compass : lastCourse);
  const box = puckBox(OWN_PUCK_D, true);
  return (
    <Marker
      coordinate={{ latitude: fix.lat, longitude: fix.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tappable={false}
      zIndex={9}
      accessibilityLabel={t('You are here')}>
      <MarkerBody style={{ width: box, height: box }} pointerEvents="none">
        <RiderPuck color={YOU_INK} d={OWN_PUCK_D} beam moving={moving} angle={deg == null ? null : screenAngle(deg, mapHeading)} />
      </MarkerBody>
    </Marker>
  );
}
