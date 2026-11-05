import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker, type UserLocationChangeEvent } from 'react-native-maps';

import { ownFix, screenAngle, type OwnFix } from '@/core/heading';
import { useCompass } from '@/lib/compass';
import { useOwnMoving } from '@/hooks/use-own-moving';
import { MarkerBody } from './marker-body';
import { useDotStylePref, useOwnDotD } from '@/hooks/use-dot-size';
import { ownDotBox } from '@/core/own-dot-art';
import { OwnDot } from './own-dot';

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
export function OwnHeadingMarker({ own, mapHeading, fixEveryMs }: { own: OwnLocation; mapHeading?: number | null; /** How often the map sends a fix (ms), for how long a quiet spell must last to mean stopped. */ fixEveryMs?: number }) {
  const [fix, setFix] = useState<OwnFix | null>(own.last.current);
  const [lastCourse, setLastCourse] = useState<number | null>(null);
  const [moving, feed] = useOwnMoving(fixEveryMs);
  useEffect(() => own.subscribe((f) => {
    setFix(f);
    feed(f.headingDeg != null, f.atMs);
    if (f.headingDeg != null) setLastCourse(f.headingDeg);
  }), [own, feed]);
  const compass = useCompass();
  const d = useOwnDotD();
  const [style] = useDotStylePref();
  if (!fix) return null;
  // The GPS direction only while you count as moving; stopped, the compass (or the last direction).
  const deg = (moving ? fix.headingDeg : null) ?? (compass != null && compass >= 0 ? compass : lastCourse);
  const box = ownDotBox(d);
  return (
    <Marker
      coordinate={{ latitude: fix.lat, longitude: fix.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tappable={false}
      zIndex={9}
      accessibilityLabel={t('You are here')}>
      <MarkerBody style={{ width: box, height: box }} pointerEvents="none">
        <OwnDot style={style} d={d} moving={moving} angle={deg == null ? null : screenAngle(deg, mapHeading)} />
      </MarkerBody>
    </Marker>
  );
}
