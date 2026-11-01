import type { ComponentProps } from 'react';
import { View } from 'react-native';

/**
 * The root view of every custom map marker (riders, waypoints, stops, search pins, ride pins).
 *
 * react-native-maps sizes and anchors a custom marker by its FIRST child view: on iPhone and iPad
 * it becomes the MapKit annotation's frame, on Android the bitmap that `anchor` is measured on.
 * A View with only layout styles is flattened away by React Native's renderer, so the marker's
 * first child became the small dot or ring inside it, and everything was drawn offset by half the
 * marker's width (about 150 points to the right of the real spot). An offset in screen points is
 * a different distance on the ground at every zoom, so riders looked like they moved when the map
 * zoomed. `collapsable={false}` keeps this view, so the anchor lands on the exact coordinate.
 */
export function MarkerBody(props: ComponentProps<typeof View>) {
  return <View collapsable={false} {...props} />;
}
