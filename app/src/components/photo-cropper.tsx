import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { SheetModal } from '@/components/sheet-modal';
import { SheetRoot } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Choice, ErrorText } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import {
  clampView, coverScale, CROP_SHAPES, CROP_ZOOM_STEP, cropRect, frameSize, keyNudge, panBy, shapeAspect, zoomAt,
  type CropShape, type CropView, type Size,
} from '@/core/photo-crop';
import { t } from '@/lib/i18n';
import { applyCrop, preparePhoto, type CropSave, type CropSource } from '@/lib/photo-crop';

/**
 * The crop screen every photo upload goes through: the photo sits behind a frame; drag it, pinch
 * (or double-tap, use - and +, the mouse wheel, or the arrow and +/- keys on the website) to pick
 * what's inside, then Use Photo. Uploads that need one shape (a square profile picture, a 16:9 group
 * photo, a 4:3 vehicle) lock the frame; the rest offer Original, Square, 4:3, 16:9 and 4:5.
 *
 * Phones show the photo above the controls; tablets and phones held sideways put the controls
 * in a side panel beside the photo.
 *
 * Use it through the hook, and render `cropper` in the screen (inside the screen's own sheet, if
 * it has one, so the crop screen shows on top of it):
 *
 *   const { cropper, crop } = usePhotoCrop();
 *   const photo = await crop(picked, { aspect: 1, round: true });   // null when they cancel
 *   ...
 *   return <>{...}{cropper}</>;
 */

export type CropOptions = CropSave & {
  /** Locks the frame to this width / height. Leave it out to let the rider pick a shape. */
  aspect?: number;
  /** Shows a circle in the frame (the profile picture shows round). */
  round?: boolean;
  /** The heading, e.g. "Crop Your Picture". */
  title?: string;
};

type Answer = ImagePickerAsset | null | 'rest';
type Request = { asset: ImagePickerAsset; options: CropOptions; step?: { index: number; total: number }; resolve: (a: Answer) => void };

export function usePhotoCrop(): {
  cropper: ReactNode;
  /** The cropped photo, or null when the rider cancels. */
  crop: (asset: ImagePickerAsset, options?: CropOptions) => Promise<ImagePickerAsset | null>;
  /** Several photos one after another; "Use the Rest As They Are" skips the rest. Null when they cancel. */
  cropMany: (assets: ImagePickerAsset[], options?: CropOptions) => Promise<ImagePickerAsset[] | null>;
} {
  const [request, setRequest] = useState<Request | null>(null);
  const [api] = useState(() => {
    const ask = (asset: ImagePickerAsset, options: CropOptions, step?: Request['step']) =>
      new Promise<Answer>((resolve) => setRequest({ asset, options, step, resolve }));
    return {
      crop: async (asset: ImagePickerAsset, options: CropOptions = {}) => {
        const a = await ask(asset, options);
        return a === 'rest' ? asset : a;
      },
      cropMany: async (assets: ImagePickerAsset[], options: CropOptions = {}) => {
        if (assets.length <= 1) {
          const one = assets[0] ? await ask(assets[0], options) : null;
          if (!assets[0]) return [];
          return one == null ? null : [one === 'rest' ? assets[0] : one];
        }
        const out: ImagePickerAsset[] = [];
        for (let i = 0; i < assets.length; i++) {
          const a = await ask(assets[i], options, { index: i + 1, total: assets.length });
          if (a == null) return null;
          if (a === 'rest') return [...out, ...assets.slice(i)];
          out.push(a);
        }
        return out;
      },
    };
  });
  const cropper = request ? (
    <PhotoCropSheet
      key={request.asset.uri + (request.step?.index ?? '')}
      request={request}
      onAnswer={(a) => {
        setRequest(null);
        request.resolve(a);
      }}
    />
  ) : null;
  return { cropper, crop: api.crop, cropMany: api.cropMany };
}

const web = Platform.OS === 'web';
const PAD = Spacing.four;

/** What the gestures need, kept current by the screen (gesture callbacks are made once). */
class Geometry {
  photo: Size = { width: 1, height: 1 };
  frame: Size = { width: 1, height: 1 };
  area: Size = { width: 1, height: 1 };
  private setView: (fn: (v: CropView) => CropView) => void = () => {};
  update(photo: Size, frame: Size, area: Size, setView: (fn: (v: CropView) => CropView) => void) {
    this.photo = photo;
    this.frame = frame;
    this.area = area;
    this.setView = setView;
  }
  /** Changes the view from the latest one, kept in range for the current photo and frame. */
  set(fn: (v: CropView) => CropView) {
    this.setView((v) => fn(clampView(v, this.photo, this.frame)));
  }
}

function PhotoCropSheet({ request, onAnswer }: { request: Request; onAnswer: (a: Answer) => void }) {
  const { asset, options, step } = request;
  const locked = options.aspect != null;
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const side = winW > winH && winW >= 560;
  const [source, setSource] = useState<CropSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shape, setShape] = useState<CropShape>('original');
  const [area, setArea] = useState<Size | null>(null);
  const [view, setView] = useState<CropView>({ zoom: 1, x: 0, y: 0 });
  const [geo] = useState(() => new Geometry());
  const areaRef = useRef<View>(null);

  useEffect(() => {
    let live = true;
    preparePhoto(asset)
      .then((s) => live && setSource(s))
      .catch(() => live && setError(t('That photo couldn’t be opened. Try another one.')));
    return () => {
      live = false;
    };
  }, [asset]);

  const photo: Size = useMemo(() => source ?? { width: asset.width || 1, height: asset.height || 1 }, [source, asset]);
  const aspect = options.aspect ?? shapeAspect(shape, photo);
  const frame = useMemo(
    () => frameSize(area ? { width: area.width - PAD * 2, height: area.height - PAD * 2 } : { width: 1, height: 1 }, aspect),
    [area, aspect],
  );
  const k = coverScale(photo, frame);
  const shown = clampView(view, photo, frame);

  useEffect(() => {
    geo.update(photo, frame, area ?? { width: 1, height: 1 }, setView);
  }, [geo, photo, frame, area]);

  const gesture = useMemo(() => {
    // Gesture callbacks are turned into worklets, which have no `this`: keep the geometry in the closure.
    const focus = (x: number, y: number) => ({ fx: x - geo.area.width / 2, fy: y - geo.area.height / 2 });
    const pan = Gesture.Pan()
      .runOnJS(true)
      .averageTouches(true)
      .onChange((e) => geo.set((v) => panBy(v, e.changeX, e.changeY, geo.photo, geo.frame)));
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onChange((e) => {
        const { fx, fy } = focus(e.focalX, e.focalY);
        geo.set((v) => zoomAt(v, v.zoom * e.scaleChange, fx, fy, geo.photo, geo.frame));
      });
    const twice = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .onEnd((e) => {
        const { fx, fy } = focus(e.x, e.y);
        geo.set((v) => (v.zoom > 1.05 ? clampView({ zoom: 1, x: 0, y: 0 }, geo.photo, geo.frame) : zoomAt(v, 2.5, fx, fy, geo.photo, geo.frame)));
      });
    return Gesture.Simultaneous(pan, pinch, twice);
  }, [geo]);

  const zoomBy = (f: number) => geo.set((v) => zoomAt(v, v.zoom * f, 0, 0, geo.photo, geo.frame));

  const use = async () => {
    if (!source || busy) return;
    setBusy(true);
    setError(null);
    try {
      const rect = cropRect(shown, source, frame, aspect);
      onAnswer(await applyCrop(source, rect, options));
    } catch {
      setError(t('That photo couldn’t be cropped. Try another one.'));
      setBusy(false);
    }
  };

  // The website: mouse wheel (and trackpad pinch) zooms where the pointer is; keys move and zoom.
  useEffect(() => {
    if (!web) return;
    const node = areaRef.current as unknown as HTMLElement | null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = node?.getBoundingClientRect();
      if (!box) return;
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
      const fx = e.clientX - box.left - box.width / 2;
      const fy = e.clientY - box.top - box.height / 2;
      geo.set((v) => zoomAt(v, v.zoom * f, fx, fy, geo.photo, geo.frame));
    };
    node?.addEventListener?.('wheel', onWheel, { passive: false });
    return () => node?.removeEventListener?.('wheel', onWheel);
  }, [geo, source]);

  const keys = useRef({ use, cancel: () => onAnswer(null) });
  useEffect(() => {
    keys.current = { use, cancel: () => onAnswer(null) };
  });
  useEffect(() => {
    if (!web || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea/i.test(target.tagName)) return;
      const nudge = keyNudge(e.key, e.shiftKey);
      if (nudge) {
        e.preventDefault();
        geo.set((v) => panBy(v, nudge.dx, nudge.dy, geo.photo, geo.frame));
      } else if (e.key === '+' || e.key === '=') zoomBy(CROP_ZOOM_STEP);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / CROP_ZOOM_STEP);
      else if (e.key === 'Escape') keys.current.cancel();
      else if (e.key === 'Enter' && !(target && /button/i.test(target.tagName))) keys.current.use();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  const onArea = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  };

  const baseW = photo.width * k;
  const baseH = photo.height * k;
  const areaW = area?.width ?? 0;
  const areaH = area?.height ?? 0;
  const left = (areaW - frame.width) / 2;
  const top = (areaH - frame.height) / 2;

  const title = options.title ?? t('Crop Photo');
  const controls = (
    <View style={styles.controls}>
      {side ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
      {step ? <ThemedText type="small" themeColor="textSecondary">{t('Photo {n} of {total}', { n: step.index, total: step.total })}</ThemedText> : null}
      <ThemedText type="small" themeColor="textSecondary">
        {web ? t('Drag the photo to move it. Zoom with the mouse wheel or the buttons.') : t('Drag the photo to move it. Pinch or double-tap to zoom.')}
      </ThemedText>
      {!locked ? (
        <Choice
          label={t('Shape')}
          options={CROP_SHAPES}
          value={shape}
          onChange={(s) => {
            setShape(s);
            setView({ zoom: 1, x: 0, y: 0 });
          }}
        />
      ) : null}
      <View style={styles.zoomRow}>
        <ZoomButton label={t('Zoom Out')} icon="minus" onPress={() => zoomBy(1 / CROP_ZOOM_STEP)} disabled={shown.zoom <= 1.001} />
        <ZoomButton label={t('Zoom In')} icon="plus" onPress={() => zoomBy(CROP_ZOOM_STEP)} disabled={shown.zoom >= 7.99} />
        <Button title={t('Reset')} kind="ghost" onPress={() => setView({ zoom: 1, x: 0, y: 0 })} disabled={shown.zoom === 1 && shown.x === 0 && shown.y === 0} style={{ flex: 1 }} />
      </View>
      <ErrorText error={error} />
      <Button title={t('Use Photo')} onPress={use} loading={busy} disabled={!source} />
      {step && step.index < step.total ? (
        <Button title={t('Use the Rest As They Are')} kind="ghost" onPress={() => onAnswer('rest')} disabled={busy} />
      ) : null}
      <Button title={t('Cancel')} kind="ghost" onPress={() => onAnswer(null)} disabled={busy} />
    </View>
  );

  return (
    <SheetModal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => !busy && onAnswer(null)}>
      <SheetRoot style={styles.root}>
        {!side ? (
          <View style={[styles.head, { paddingTop: insets.top + Spacing.two }]}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
          </View>
        ) : null}
        <View style={[styles.body, side && { flexDirection: 'row' }]}>
          <GestureDetector gesture={gesture}>
            <View
              ref={areaRef}
              style={[styles.area, side && { marginTop: insets.top, marginLeft: insets.left }]}
              onLayout={onArea}
              accessible
              accessibilityLabel={t('Photo to crop. Drag to move it, pinch to zoom.')}
              accessibilityActions={[{ name: 'increment', label: t('Zoom In') }, { name: 'decrement', label: t('Zoom Out') }]}
              onAccessibilityAction={(e) => zoomBy(e.nativeEvent.actionName === 'increment' ? CROP_ZOOM_STEP : 1 / CROP_ZOOM_STEP)}>
              {source && area ? (
                <>
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute', width: baseW, height: baseH, left: (areaW - baseW) / 2, top: (areaH - baseH) / 2,
                      transform: [{ translateX: shown.x }, { translateY: shown.y }, { scale: shown.zoom }],
                    }}>
                    <Image source={{ uri: source.uri }} style={{ width: '100%', height: '100%' }} contentFit="fill" transition={0} />
                  </View>
                  {/* Dim everything outside the frame. */}
                  <View pointerEvents="none" style={[styles.dim, { left: 0, right: 0, top: 0, height: top }]} />
                  <View pointerEvents="none" style={[styles.dim, { left: 0, right: 0, top: top + frame.height, bottom: 0 }]} />
                  <View pointerEvents="none" style={[styles.dim, { left: 0, width: left, top, height: frame.height }]} />
                  <View pointerEvents="none" style={[styles.dim, { left: left + frame.width, right: 0, top, height: frame.height }]} />
                  <View pointerEvents="none" style={[styles.frame, { left, top, width: frame.width, height: frame.height }]}>
                    <View style={[styles.line, { left: '33.33%', top: 0, bottom: 0, width: 1 }]} />
                    <View style={[styles.line, { left: '66.66%', top: 0, bottom: 0, width: 1 }]} />
                    <View style={[styles.line, { top: '33.33%', left: 0, right: 0, height: 1 }]} />
                    <View style={[styles.line, { top: '66.66%', left: 0, right: 0, height: 1 }]} />
                    {options.round ? <View style={[styles.circle, { borderRadius: frame.width / 2 }]} /> : null}
                  </View>
                </>
              ) : error ? null : (
                <ActivityIndicator color="#fff" size="large" />
              )}
            </View>
          </GestureDetector>
          {side ? (
            <ScrollView
              style={[styles.panel, { width: Math.min(340, Math.round(winW * 0.36)) }]}
              contentContainerStyle={{ paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.three, paddingRight: insets.right + Spacing.three, paddingLeft: Spacing.three }}>
              {controls}
            </ScrollView>
          ) : (
            <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.three }]}>{controls}</View>
          )}
        </View>
      </SheetRoot>
    </SheetModal>
  );
}

function ZoomButton({ label, icon, onPress, disabled }: { label: string; icon: 'plus' | 'minus'; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.zoomButton, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={22} color={Colors.text} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  root: { backgroundColor: Colors.background },
  head: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, alignItems: 'center' },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 22, lineHeight: 26 },
  body: { flex: 1 },
  area: { flex: 1, backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.62)' },
  frame: { position: 'absolute', borderWidth: 2, borderColor: '#fff' },
  line: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)' },
  circle: { ...{ position: 'absolute' as const, left: 0, top: 0, right: 0, bottom: 0 }, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  bottom: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, backgroundColor: Colors.background },
  panel: { flexGrow: 0, backgroundColor: Colors.background },
  controls: { gap: Spacing.two, width: '100%', maxWidth: 560, alignSelf: 'center' },
  zoomRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  zoomButton: {
    width: 48, height: 48, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected,
  },
}));
