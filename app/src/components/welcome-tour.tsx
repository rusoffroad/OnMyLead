import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Modal, PanResponder, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { ProChip } from '@/components/pro-tag';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { ACTIVITIES } from '@/core/activities';
import { cardBody, tourCards, WHATS_NEW_VERSION, whatsNewItems, type TourCard, type TourImage, type TourMode } from '@/core/welcome-tour';
import { useLayout } from '@/hooks/use-layout';
import { t, tx } from '@/lib/i18n';
import { useTourFlags } from '@/lib/welcome-tour';
import { useFlag } from '@/lib/app-settings';

const IMAGES: Record<TourImage, number> = {
  welcome: require('../../assets/images/tour/welcome.jpg'),
  join: require('../../assets/images/tour/join.jpg'),
  live: require('../../assets/images/tour/live.jpg'),
  status: require('../../assets/images/tour/status.jpg'),
  bluetooth: require('../../assets/images/tour/bluetooth.jpg'),
  mapMode: require('../../assets/images/tour/map-mode.jpg'),
  weather: require('../../assets/images/tour/weather.jpg'),
  outRiding: require('../../assets/images/tour/out-riding.jpg'),
  places: require('../../assets/images/tour/places.jpg'),
  social: require('../../assets/images/tour/social.jpg'),
  badges: require('../../assets/images/tour/badges.jpg'),
  starlink: require('../../assets/images/tour/starlink.jpg'),
};

const RED = '#E5262E';

/** Where the swipe and key handlers (made once) send Next and Back. */
class TourNav {
  private onNext = () => {};
  private onBack = () => {};
  set(next: () => void, back: () => void) {
    this.onNext = next;
    this.onBack = back;
  }
  next() {
    this.onNext();
  }
  back() {
    this.onBack();
  }
}

/**
 * The Welcome Tour (4.0, rules in core/welcome-tour.ts) as a full-screen pop-up over Home.
 * Phones: picture on top, words and buttons below. Tablets and the website: a card centred over a
 * dimmed Home, picture on the left. Skip, swipe, Back and Next; arrow keys and Esc on a keyboard.
 */
export function WelcomeTour({ mode, onClose }: { mode: TourMode | null; onClose: () => void }) {
  const { wide } = useLayout();
  return (
    <Modal visible={!!mode} transparent={wide} animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      {mode ? <TourPager mode={mode} onClose={onClose} /> : null}
    </Modal>
  );
}

/** The tour itself: also the You > Help > Take the Tour screen (app/tour.tsx). */
export function TourPager({ mode: start, onClose }: { mode: TourMode; onClose: () => void }) {
  const on = useTourFlags();
  const cards = useMemo(() => tourCards(on), [on]);
  const [mode, setMode] = useState<TourMode>(start);
  const [i, setI] = useState(0);
  const { wide, landscape, height } = useLayout();
  // A phone turned sideways: less room above and below, so the card fills more of it.
  const short = height < 500;
  const insets = useSafeAreaInsets();
  const last = i >= cards.length - 1;

  const next = () => {
    if (mode !== 'tour') return;
    if (last) onClose();
    else setI((n) => Math.min(n + 1, cards.length - 1));
  };
  const back = () => {
    if (mode === 'tour') setI((n) => Math.max(n - 1, 0));
  };
  // The swipe and key handlers are made once; this keeps them pointed at the current card.
  const [nav] = useState(() => new TourNav());
  useEffect(() => nav.set(next, back));
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -50) nav.next();
        else if (g.dx > 50) nav.back();
      },
    }),
  );

  // A keyboard (the website, an iPad keyboard in a browser): arrows move, Esc closes.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nav.next();
      else if (e.key === 'ArrowLeft') nav.back();
      else if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [nav, onClose]);

  const card = cards[i];
  const image = mode === 'news' ? IMAGES.welcome : IMAGES[card.image];

  const words =
    mode === 'news' ? (
      <WhatsNew
        onTour={() => {
          setMode('tour');
          setI(0);
        }}
        onClose={onClose}
      />
    ) : (
      <CardWords card={card} index={i} count={cards.length} last={last} onBack={back} onNext={next} />
    );

  const showSkip = mode === 'tour' && !last;
  const skipButton = (
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.skipPill} hitSlop={10}>
      <Text style={styles.skipText}>{t('Skip')}</Text>
    </Pressable>
  );
  // Phones and tablet portrait: Skip sits in its own bar above the picture, so it never covers
  // anything in the screenshot (like Ride Mode's "1 Separated"). Landscape: over the words side.
  const skipBar = <View style={styles.skipBar}>{showSkip ? skipButton : null}</View>;

  if (wide) {
    return (
      <View style={styles.scrim}>
        <View style={[styles.wideCard, !landscape && styles.tallCard, short && styles.shortCard]} {...pan.panHandlers} accessibilityViewIsModal>
          {landscape ? null : skipBar}
          <View style={landscape ? styles.wideArt : styles.tallArt}>
            <Image source={image} style={styles.fill} contentFit="cover" contentPosition="top" accessibilityIgnoresInvertColors />
            <Fade direction={landscape ? 'right' : 'down'} />
          </View>
          <View style={[landscape ? styles.wideBody : styles.tallBody, short && styles.shortBody]}>{words}</View>
          {landscape && showSkip ? <View style={styles.skipCorner}>{skipButton}</View> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.phone, { paddingBottom: insets.bottom + Spacing.three }]} {...pan.panHandlers} accessibilityViewIsModal>
      <View style={{ marginTop: insets.top, paddingRight: insets.right }}>{skipBar}</View>
      <View style={styles.phoneArt}>
        <Image source={image} style={styles.fill} contentFit="cover" contentPosition="top" accessibilityIgnoresInvertColors />
        <Fade direction="down" />
      </View>
      <View style={styles.phoneBody}>{words}</View>
    </View>
  );
}

function CardWords({ card, index, count, last, onBack, onNext }: { card: TourCard; index: number; count: number; last: boolean; onBack: () => void; onNext: () => void }) {
  const on = useTourFlags();
  // 4.0 plan: creating rides, Places to Ride and Starlink carry the Pro tag once it is on.
  const plan4 = useFlag('pro_plan_4');
  const pro = card.pro ?? (plan4 ? card.proWithPlan4 : undefined);
  return (
    <View style={styles.words}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ gap: Spacing.two }} showsVerticalScrollIndicator={false}>
        {card.isNew || pro ? (
          <View style={styles.kicker}>
            {card.isNew ? <Text style={styles.newTag}>{t('New')}</Text> : null}
            {pro ? <ProChip /> : null}
            {pro ? <Text style={styles.kickerText}>{tx(pro)}</Text> : null}
          </View>
        ) : null}
        <Text style={styles.title} accessibilityRole="header">
          {tx(card.title)}
        </Text>
        <Text style={styles.body}>{tx(cardBody(card, on))}</Text>
        {card.chips && on('activities') ? (
          <View style={styles.chips}>
            {ACTIVITIES.map((a) => (
              <View key={a.id} style={[styles.chip, { borderColor: a.colors?.bright ?? RED }]}>
                <View style={[styles.chipDot, { backgroundColor: a.colors?.bright ?? RED }]} />
                <Text style={styles.chipText}>{tx(a.name)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <Trail index={index} count={count} />
      <View style={styles.buttons}>
        {index > 0 ? (
          <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.btn, styles.back, pressed && styles.pressed]}>
            <Text style={styles.btnText}>{t('Back')}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onNext} style={({ pressed }) => [styles.btn, styles.next, pressed && styles.pressed]}>
          <Text style={[styles.btnText, styles.nextText]}>{last ? t('Let’s Ride') : t('Next')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WhatsNew({ onTour, onClose }: { onTour: () => void; onClose: () => void }) {
  const on = useTourFlags();
  const items = whatsNewItems(on);
  return (
    <View style={styles.words}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ gap: Spacing.two }} showsVerticalScrollIndicator={false}>
        <View style={styles.kicker}>
          <Text style={styles.newTag}>{t('New')}</Text>
          <Text style={styles.kickerText}>{t('Since your last update')}</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t('What’s New in {version}', { version: WHATS_NEW_VERSION })}
        </Text>
        {items.map((it) => (
          <View key={it.title} style={styles.newsRow}>
            <View style={styles.newsIcon}>
              <View style={[styles.newsDot, { backgroundColor: it.color }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.newsTitle}>{tx(it.title)}</Text>
              <Text style={styles.newsBody}>{tx(it.body)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.btn, styles.back, { flex: 1 }, pressed && styles.pressed]}>
          <Text style={styles.btnText}>{t('Got It')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onTour} style={({ pressed }) => [styles.btn, styles.next, pressed && styles.pressed]}>
          <Text style={[styles.btnText, styles.nextText]}>{t('Take the Tour')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Progress as a trail of rider dots, like the rider line in Ride Mode: done in red, you on the current card. */
function Trail({ index, count }: { index: number; count: number }) {
  const W = 300;
  const H = 22;
  const pad = 11;
  const step = count > 1 ? (W - pad * 2) / (count - 1) : 0;
  const pts = Array.from({ length: count }, (_, k) => [pad + k * step, k % 2 ? 8 : 14] as const);
  const path = (p: readonly (readonly [number, number])[]) => p.map(([x, y], k) => `${k ? 'L' : 'M'}${x} ${y}`).join(' ');
  return (
    <View accessible accessibilityLabel={t('Card {n} of {count}', { n: index + 1, count })} style={styles.trail}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Path d={path(pts)} stroke={Colors.border} strokeWidth={2} strokeDasharray="3 4" fill="none" />
        {index > 0 ? <Path d={path(pts.slice(0, index + 1))} stroke={RED} strokeWidth={3} strokeLinecap="round" fill="none" /> : null}
        {pts.map(([x, y], k) =>
          k === index ? (
            <Circle key={k} cx={x} cy={y} r={7} fill={RED} stroke={Colors.text} strokeWidth={2} />
          ) : (
            <Circle key={k} cx={x} cy={y} r={4.5} fill={k < index ? Colors.text : Colors.backgroundSelected} stroke={k < index ? RED : Colors.border} strokeWidth={2} />
          ),
        )}
      </Svg>
    </View>
  );
}

/** Blends the picture into the page. */
function Fade({ direction }: { direction: 'down' | 'right' }) {
  const down = direction === 'down';
  return (
    <Svg style={styles.fillAbs} width="100%" height="100%" preserveAspectRatio="none" pointerEvents="none">
      <Defs>
        <LinearGradient id={`fade-${direction}`} x1="0" y1="0" x2={down ? '0' : '1'} y2={down ? '1' : '0'}>
          <Stop offset="0" stopColor={Colors.background} stopOpacity={down ? 0.5 : 0} />
          <Stop offset={down ? '0.2' : '0.6'} stopColor={Colors.background} stopOpacity={0} />
          <Stop offset={down ? '0.62' : '0.6'} stopColor={Colors.background} stopOpacity={0} />
          <Stop offset="1" stopColor={Colors.background} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#fade-${direction})`} />
    </Svg>
  );
}

const styles = themedStyles(() => ({
  phone: { flex: 1, backgroundColor: Colors.background },
  phoneArt: { flexBasis: '46%', flexGrow: 0, flexShrink: 1, overflow: 'hidden' },
  phoneBody: { flex: 1, paddingHorizontal: 24 },
  scrim: { flex: 1, backgroundColor: 'rgba(4,10,18,0.78)', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  wideCard: {
    width: '100%',
    maxWidth: 880,
    height: '80%',
    maxHeight: 580,
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  // Tablet portrait: the phone's picture-over-words layout, in a card.
  tallCard: { flexDirection: 'column', maxWidth: 560, height: '82%', maxHeight: 900 },
  shortCard: { height: '92%' },
  shortBody: { paddingTop: 18, paddingBottom: 16, paddingRight: 96 },
  wideArt: { flex: 1 },
  tallArt: { flexBasis: '48%', flexGrow: 0, flexShrink: 1 },
  tallBody: { flex: 1, paddingHorizontal: 28, paddingBottom: 24 },
  wideBody: { flex: 1, padding: 28, paddingTop: 56 },
  fill: { width: '100%', height: '100%' },
  fillAbs: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  words: { flex: 1, gap: Spacing.three },
  scroll: { flex: 1 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerText: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14 },
  newTag: { color: '#FFFFFF', backgroundColor: RED, fontFamily: font(700), fontSize: 13, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, overflow: 'hidden' },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 32, lineHeight: 34 },
  body: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 16, lineHeight: 23 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
  newsRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  newsIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  newsDot: { width: 12, height: 12, borderRadius: 6 },
  newsTitle: { color: Colors.text, fontFamily: font(600), fontSize: 16 },
  newsBody: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
  trail: { height: 24, width: '100%' },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: { height: 52, borderRadius: Radius.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  back: { backgroundColor: Colors.backgroundSelected, minWidth: 90 },
  next: { flex: 1, backgroundColor: RED },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  btnText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19 },
  nextText: { color: '#FFFFFF' },
  skipBar: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 16 },
  skipCorner: { position: 'absolute', top: 14, right: 16 },
  skipPill: { backgroundColor: Colors.backgroundSelected, borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  skipText: { color: Colors.text, fontFamily: font(600), fontSize: 15 },
}));
