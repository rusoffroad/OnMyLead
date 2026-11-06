import { memo, useId, useMemo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { ownDotBox, ownDotSvg, type DotStyle } from '@/core/own-dot-art';

/** A still sample of a Dot Style for the picker: the dot pointing up with the start of its beam. */
export const DotSample = memo(function DotSample({ style, size }: { style: DotStyle; size: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const d = size * 0.5;
  const xml = useMemo(() => {
    const c = ownDotBox(d) / 2;
    const w = d * 2;
    const h = d * 2.3;
    return ownDotSvg(style, d, 0, true, `s${uid}`).replace(/viewBox="[^"]*"/, `viewBox="${c - w / 2} ${c - h + d * 1.05} ${w} ${h}"`);
  }, [style, d, uid]);
  return <SvgXml xml={xml} width={size} height={size * 1.15} />;
});

/**
 * Your own dot in the rider's Dot Style (core/own-dot-art), drawn dead centre in a square
 * `ownDotBox(d)` wide. `angle` is on screen: degrees clockwise from straight up, null when unknown.
 */
export const OwnDot = memo(function OwnDot({ style, d, angle, moving }: { style: DotStyle; d: number; angle: number | null; moving: boolean }) {
  // Gradient ids are shared across the whole page on the website, so each dot gets its own.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const a = angle == null ? null : Math.round(angle);
  const xml = useMemo(() => ownDotSvg(style, d, a, moving, `o${uid}`), [style, d, a, moving, uid]);
  const box = ownDotBox(d);
  return (
    <View pointerEvents="none" style={{ width: box, height: box }}>
      <SvgXml xml={xml} width={box} height={box} />
    </View>
  );
});
