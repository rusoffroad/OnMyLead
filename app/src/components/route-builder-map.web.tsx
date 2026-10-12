import { StyleSheet, Text, View } from 'react-native';

import { Colors, font } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { RouteSketch } from './route-sketch';

/** The web build has no native map: show the route as a drawing. Tapping to draw needs the app. */
export function RouteBuilderMap({
  points, waypoints,
}: {
  points: LatLng[];
  waypoints: LatLng[];
  center: LatLng | null;
  editable: boolean;
  onAdd: (p: LatLng) => void;
  onMove: (index: number, p: LatLng) => void;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]}>
      {points.length > 1 ? (
        <RouteSketch points={points} waypoints={waypoints} width={360} height={330} style={{ borderRadius: 0 }} />
      ) : (
        <Text style={styles.note}>Drawing a route by tapping the map works in the OnMyLead app. Here you can import a GPX file.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 110, backgroundColor: '#0D1C31' },
  note: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 16, lineHeight: 22, padding: 24, paddingTop: 40, textAlign: 'center' },
});
