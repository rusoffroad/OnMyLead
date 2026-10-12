import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { RouteSketch } from './route-sketch';

/** The web build has no native map: draw the route with the waypoints on it as blazes. */
export function WaypointMap({
  waypoints, route,
}: {
  waypoints: Waypoint[];
  route?: LatLng[] | null;
  center: LatLng | null;
  trail: TrailMap;
  onPressWaypoint: (w: Waypoint) => void;
  onLongPressMap?: (p: LatLng) => void;
}) {
  const dots = waypoints.map((w) => ({ id: w.id, lat: w.lat, lng: w.lng, name: w.name, color: w.shared ? Colors.sky : Colors.text, diamond: true }));
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]}>
      {(route?.length ?? 0) > 1 || dots.length ? (
        <RouteSketch points={route ?? []} dots={dots} width={360} height={300} style={{ borderRadius: 0 }} label="The route with the waypoints on it" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 70, backgroundColor: '#0D1C31' },
});
