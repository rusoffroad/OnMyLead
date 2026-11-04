import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker, type UserLocationChangeEvent } from 'react-native-maps';

import { ownFix, screenAngle, type OwnFix } from '@/core/heading';
import { MarkerBody } from './marker-body';

import { t } from '@/lib/i18n';
/** Around the phone's own blue dot (about 22 points on iPhone, 20 dp on Android) with the wedge just outside it. */
const BOX = 52;

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
 * The arrow on this phone's own dot: the same white wedge every other rider's dot gets, drawn
 * around the blue dot the phone draws itself, only while moving faster than a walk.
 */
export function OwnHeadingMarker({ own, mapHeading }: { own: OwnLocation; mapHeading?: number | null }) {
  const [fix, setFix] = useState<OwnFix | null>(own.last.current);
  useEffect(() => own.subscribe(setFix), [own]);
  if (!fix || fix.headingDeg == null) return null;
  return (
    <Marker
      coordinate={{ latitude: fix.lat, longitude: fix.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tappable={false}
      zIndex={9}
      accessibilityLabel={t('The way you are heading')}>
      <MarkerBody style={styles.box} pointerEvents="none">
        <View style={[styles.box, { transform: [{ rotate: `${Math.round(screenAngle(fix.headingDeg, mapHeading))}deg` }] }]}>
          <View style={styles.edge} />
          <View style={styles.arrow} />
        </View>
      </MarkerBody>
    </Marker>
  );
}

const styles = StyleSheet.create({
  box: { width: BOX, height: BOX, alignItems: 'center' },
  // The same wedge as RiderPin's, drawn with borders so iPhone, iPad and Android render it alike.
  edge: {
    position: 'absolute', top: 0, width: 0, height: 0, borderStyle: 'solid',
    borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 14,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'rgba(10,22,38,0.85)',
  },
  arrow: {
    position: 'absolute', top: 3, width: 0, height: 0, borderStyle: 'solid',
    borderLeftWidth: 7.5, borderRightWidth: 7.5, borderBottomWidth: 10.5,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFFFFF',
  },
});
