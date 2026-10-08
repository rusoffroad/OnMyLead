import { StyleSheet, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';

import { Colors, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';

const coords = (points: LatLng[]) => points.map((p) => ({ latitude: p.lat, longitude: p.lng }));

/**
 * The ride's route on a native map: logo red over a navy casing, so it reads on satellite
 * imagery, desert sand and snow alike.
 */
export function RouteLine({ points }: { points: LatLng[] }) {
  const c = coords(points);
  return (
    <>
      <Polyline coordinates={c} strokeColor={Colors.background} strokeWidth={9} lineCap="round" lineJoin="round" zIndex={1} />
      <Polyline coordinates={c} strokeColor={Colors.accent} strokeWidth={5} lineCap="round" lineJoin="round" zIndex={2} />
    </>
  );
}

/** Start (green) and finish (checkered navy and white ring) of the route. */
export function RouteEnds({ points }: { points: LatLng[] }) {
  if (points.length < 2) return null;
  const a = points[0];
  const b = points[points.length - 1];
  return (
    <>
      <Marker coordinate={{ latitude: a.lat, longitude: a.lng }} anchor={{ x: 0.5, y: 0.5 }} title="Start" tracksViewChanges={false} zIndex={3}>
        <View style={[styles.end, { backgroundColor: RideColors.green }]} />
      </Marker>
      <Marker coordinate={{ latitude: b.lat, longitude: b.lng }} anchor={{ x: 0.5, y: 0.5 }} title="Finish" tracksViewChanges={false} zIndex={3}>
        <View style={[styles.end, { backgroundColor: Colors.text }]}>
          <View style={styles.finishCore} />
        </View>
      </Marker>
    </>
  );
}

const styles = StyleSheet.create({
  end: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  finishCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.background },
});
