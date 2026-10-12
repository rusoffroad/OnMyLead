import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { font } from '@/constants/theme';
import { fmtInt } from '@/core/admin-format';
import { AdminColors, tabular, toneColor, type Tone } from './tokens';

export type Series = { label: string; color: string; points: { t: string; v: number }[] };

const PAD = { top: 10, right: 8, bottom: 24, left: 40 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Counts over time. Lines for trends, bars for per-period totals. Hover (or tap) a period to
 * read its exact values.
 */
export function TimeSeriesChart({ series, height = 200, format = fmtInt, kind = 'line' }: {
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  kind?: 'line' | 'bar';
}) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(0, ...series.map((s) => s.points.length));
  const max = useMemo(() => niceMax(Math.max(0, ...series.flatMap((s) => s.points.map((p) => Number(p.v) || 0)))), [series]);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : kind === 'bar' ? (innerW / n) * (i + 0.5) : (innerW * i) / (n - 1));
  const y = (v: number) => PAD.top + innerH - (innerH * (Number(v) || 0)) / max;
  const labels = n === 0 ? [] : n < 3 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
  const ref = series[0]?.points ?? [];
  const empty = n === 0 || series.every((s) => s.points.every((p) => !Number(p.v)));

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
            {hover != null && s.points[hover] ? <Text style={[styles.legendValue, tabular]}>{format(Number(s.points[hover].v))}</Text> : null}
          </View>
        ))}
        {hover != null && ref[hover] ? <Text style={styles.legendDate}>{shortDate(ref[hover].t)}</Text> : null}
      </View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[0, 0.5, 1].map((f) => (
              <Line key={f} x1={PAD.left} x2={width - PAD.right} y1={y(max * f)} y2={y(max * f)} stroke={AdminColors.line} strokeWidth={1} />
            ))}
            {kind === 'bar'
              ? series.map((s, si) => {
                  const slot = innerW / Math.max(1, n);
                  const bw = Math.max(2, (slot * 0.7) / series.length);
                  return s.points.map((p, i) => (
                    <Rect key={`${si}-${i}`} x={x(i) - (bw * series.length) / 2 + si * bw} y={y(p.v)} width={bw - 1} height={Math.max(0, PAD.top + innerH - y(p.v))}
                      rx={2} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.45} />
                  ));
                })
              : series.map((s) => (
                  <Path key={s.label} d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}
                    stroke={s.color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                ))}
            {hover != null && kind === 'line' ? <Line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke={AdminColors.dim} strokeWidth={1} strokeDasharray="3 3" /> : null}
          </Svg>
        ) : null}
        {width > 0 ? (
          <>
            {[0, 0.5, 1].map((f) => (
              <Text key={f} style={[styles.axis, tabular, { top: y(max * f) - 8, left: 0, width: PAD.left - 6, textAlign: 'right' }]}>{format(max * f)}</Text>
            ))}
            {labels.map((i) => ref[i] ? (
              <Text key={i} style={[styles.axis, { top: height - 18, left: Math.min(Math.max(0, x(i) - 40), width - 80), width: 80, textAlign: i === 0 && n > 1 ? 'left' : i === n - 1 && n > 1 ? 'right' : 'center' }]}>
                {shortDate(ref[i].t)}
              </Text>
            ) : null)}
            <View style={[StyleSheet.absoluteFill, { left: PAD.left, right: PAD.right, bottom: PAD.bottom, flexDirection: 'row' }]}>
              {Array.from({ length: n }, (_, i) => (
                <Pressable key={i} accessibilityLabel={ref[i] ? shortDate(ref[i].t) : undefined}
                  onHoverIn={() => setHover(i)} onHoverOut={() => setHover((h) => (h === i ? null : h))} onPress={() => setHover(i)}
                  style={{ flex: 1 }} />
              ))}
            </View>
            {empty ? <Text style={[styles.emptyNote, { top: height / 2 - 20 }]}>Nothing in this period yet.</Text> : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

/** Ranked horizontal bars, for "how many of each". */
export function BarList({ items, format = fmtInt }: { items: { label: string; value: number; tone?: Tone }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return (
    <View style={{ gap: 10 }}>
      {items.map((i) => (
        <View key={i.label} style={{ gap: 4 }}>
          <View style={styles.barHead}>
            <Text style={styles.barLabel}>{i.label}</Text>
            <Text style={[styles.barValue, tabular]}>{format(Number(i.value) || 0)}</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${((Number(i.value) || 0) / max) * 100}%`, backgroundColor: toneColor(i.tone ?? 'pro') }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', minHeight: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: font(600), fontSize: 13, color: AdminColors.dim },
  legendValue: { fontFamily: font(700), fontSize: 13, color: AdminColors.text },
  legendDate: { fontFamily: font(600), fontSize: 13, color: AdminColors.faint, marginLeft: 'auto' },
  axis: { position: 'absolute', fontFamily: font(500), fontSize: 11.5, color: AdminColors.faint },
  emptyNote: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: font(500), fontSize: 14, color: AdminColors.faint },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barLabel: { fontFamily: font(600), fontSize: 14, color: AdminColors.text },
  barValue: { fontFamily: font(700), fontSize: 14, color: AdminColors.text },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: AdminColors.page, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
});
