import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Cover } from '@/components/events/parts';
import { Gradient, Home } from '@/components/home/parts';
import { Colors, font, themedStyles, TileSurface } from '@/constants/theme';
import { cardPlace, eventDates, eventPhase, nextRsvp, presenterLabel, type EventCard, type Rsvp } from '@/core/events';
import { rsvp } from '@/lib/events';
import { shareEvent } from '@/lib/share-event';
import { useSession } from '@/lib/session';
import { t } from '@/lib/i18n';

/**
 * The next big event, leading the Events list as a full photo: dates, who presents it, the title,
 * the place with how many are going, and I'm Going and Share right on the photo (3.0).
 */
export function FeaturedEvent({ e, height = 320 }: { e: EventCard; height?: number }) {
  const { session } = useSession();
  const [mine, setMine] = useState<Rsvp | null>(e.mine);
  const [going, setGoing] = useState(e.going);
  const [busy, setBusy] = useState(false);
  const phase = eventPhase(e);
  const presenter = presenterLabel(e.presented_by);
  const open = () => router.push(`/e/${e.share_code}`);

  const tapGoing = async () => {
    if (!session) return router.push('/sign-in?mode=create');
    if (e.i_host) return open();
    const to = nextRsvp(mine, 'going');
    setBusy(true);
    try {
      await rsvp(e.id, to);
      setGoing((g) => Math.max(0, g + (to === 'going' ? 1 : 0) - (mine === 'going' ? 1 : 0)));
      setMine(to);
    } catch {
      open();
    } finally {
      setBusy(false);
    }
  };

  const facts = [
    cardPlace(e),
    going ? t('{v} Going', { v: going.toLocaleString('en-US') }) : null,
    e.rides ? (e.rides === 1 ? t('1 Group Ride') : t('{v} Group Rides', { v: e.rides })) : null,
  ].filter(Boolean).join(' · ');
  const canRsvp = phase === 'upcoming' || phase === 'now';

  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${e.title}, ${eventDates(e.starts_at, e.ends_at)}, ${facts}`} onPress={open}>
        <Cover path={e.cover_path} seed={e.id} height={height} />
        <Gradient overlay colors={['rgba(10,16,25,0.15)', 'rgba(10,16,25,0)', 'rgba(10,16,25,0.94)']} />
        <View style={styles.dateChip}>
          <Text style={styles.dateText}>{eventDates(e.starts_at, e.ends_at).toUpperCase()}</Text>
        </View>
        {phase === 'now' ? <View style={[styles.dateChip, styles.nowChip]}><Text style={styles.nowText}>{t('Happening Now')}</Text></View> : null}
      </Pressable>
      <View style={styles.body} pointerEvents="box-none">
        {presenter ? <Text style={styles.presenter} numberOfLines={1}>{presenter.toUpperCase()}</Text> : null}
        <Text style={styles.title} numberOfLines={2} onPress={open}>{e.title}</Text>
        <Text style={styles.facts} numberOfLines={1}>{facts}</Text>
        <View style={styles.row}>
          {canRsvp ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: mine === 'going', busy }}
              disabled={busy}
              onPress={tapGoing}
              style={({ pressed }) => [styles.btn, mine === 'going' ? styles.btnOn : styles.btnRed, pressed && { opacity: 0.85 }]}>
              <Text style={styles.btnText}>{e.i_host ? t('Hosting') : mine === 'going' ? t('Going ✓') : t('I’m Going')}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => shareEvent(e)} style={({ pressed }) => [styles.btn, styles.btnGlass, pressed && { opacity: 0.85 }]}>
            <Text style={styles.btnText}>{t('Share')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { borderRadius: 22, overflow: 'hidden', ...TileSurface },
  dateChip: {
    position: 'absolute', left: 14, top: 14, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: 'rgba(10,16,25,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  dateText: { color: '#fff', fontFamily: font(700), fontSize: 13.5, letterSpacing: 0.3 },
  nowChip: { left: undefined, right: 14, backgroundColor: 'rgba(229,38,46,0.9)', borderColor: 'rgba(255,175,175,0.5)' },
  nowText: { color: '#fff', fontFamily: font(700), fontSize: 13 },
  body: { position: 'absolute', left: 18, right: 18, bottom: 18, gap: 2 },
  presenter: { color: Home.gold, fontFamily: font(700), fontSize: 13, letterSpacing: 0.3 },
  title: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 34, lineHeight: 37, marginTop: 2 },
  facts: { color: 'rgba(255,255,255,0.78)', fontFamily: font(500), fontSize: 14 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnRed: { backgroundColor: Colors.accent },
  btnOn: { backgroundColor: 'rgba(79,194,127,0.28)', borderWidth: 1, borderColor: 'rgba(123,221,163,0.6)' },
  btnGlass: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  btnText: { color: '#fff', fontFamily: font(700), fontSize: 16 },
}));
