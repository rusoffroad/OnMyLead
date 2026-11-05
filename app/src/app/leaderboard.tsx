import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import { BadgePatch, PATCH_COLORS } from '@/components/badge-patch';
import { Icon } from '@/components/icon';
import { RiderPhoto } from '@/components/rider-photo';
import { ThemedText } from '@/components/themed-text';
import { TwoPane } from '@/components/two-pane';
import { Button, Choice, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { areaLabel, areaShort, countryName, stateName, stateWord, statesOf } from '@/core/areas';
import { badgeTitle } from '@/core/badges';
import {
  filterTitle, levelsLine, myStanding, ordinal, rankName, startingFilter,
  type LeaderArea, type Leaderboard, type LeaderFilter, type LeaderRow, type LeaderSettings,
} from '@/core/leaderboard';
import { sideColumnWidth } from '@/core/layout';
import { initialOf } from '@/core/profile';
import { profileHref } from '@/core/social';
import { useLayout } from '@/hooks/use-layout';
import { fetchLeaderAreas, fetchLeaderboard, fetchLeaderSettings, saveLeaderShown } from '@/lib/leaderboard';
import { useSession } from '@/lib/session';

import { currentLocale, t } from '@/lib/i18n';
/**
 * The badge leaderboard: riders ranked by the badge levels they earned by riding, everywhere or
 * in one country or state. Phones: your card, the filters, then the board. Tablets and wide
 * windows: your card and the filters in a side column beside the board.
 */
export default function LeaderboardScreen() {
  const { session } = useSession();
  const layout = useLayout();
  const [settings, setSettings] = useState<LeaderSettings | null>(null);
  const [areas, setAreas] = useState<LeaderArea[]>([]);
  const [filter, setFilter] = useState<LeaderFilter | null>(null);
  const [board, setBoard] = useState<Leaderboard | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filterRef = useRef<LeaderFilter | null>(null);

  const loadBoard = useCallback((f: LeaderFilter) => {
    setError(null);
    fetchLeaderboard(f)
      .then(setBoard)
      .catch((e: Error) => setError(t('Couldn’t load the leaderboard. {message}', { message: e.message })));
  }, []);

  const changeFilter = useCallback((f: LeaderFilter) => {
    filterRef.current = f;
    setFilter(f);
    setBoard(undefined);
    loadBoard(f);
  }, [loadBoard]);

  // Each time the screen shows: your settings and the places with riders, then the board (on your
  // own area the first time, after that wherever you left it).
  const load = useCallback(() => {
    fetchLeaderSettings()
      .then((s) => {
        setSettings(s);
        if (filterRef.current) loadBoard(filterRef.current);
        else changeFilter(startingFilter(s));
      })
      .catch(() => {
        if (filterRef.current) loadBoard(filterRef.current);
        else changeFilter({ country: null, state: null });
      });
    fetchLeaderAreas().then(setAreas).catch(() => {});
  }, [loadBoard, changeFilter]);

  useFocusEffect(
    useCallback(() => {
      if (session) load();
    }, [session, load]),
  );

  async function toggleShown(on: boolean) {
    setBusy(true);
    try {
      setSettings(await saveLeaderShown(on));
      fetchLeaderAreas().then(setAreas).catch(() => {});
      if (filter) loadBoard(filter);
    } catch {
      setError(t('That didn’t save. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <Screen width="readable">
        <Stack.Screen options={{ title: t('Leaderboard') }} />
        <ThemedText themeColor="textSecondary">{t('Sign in to see where you rank among riders in your state, your country and everywhere.')}</ThemedText>
        <Button title={t('Sign In')} onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  if (board === null) {
    return (
      <Screen width="readable">
        <Stack.Screen options={{ title: t('Leaderboard') }} />
        <ThemedText themeColor="textSecondary">{t('The leaderboard starts working with the next server update.')}</ThemedText>
      </Screen>
    );
  }

  const f = filter ?? { country: null, state: null };
  const you = (compact: boolean) => <YouCard settings={settings} board={board ?? null} filter={f} busy={busy} onShown={toggleShown} compact={compact} />;
  const filters = <Filters areas={areas} settings={settings} filter={f} onChange={changeFilter} />;
  const list = (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.headRow}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{filterTitle(f)}</Text>
        {board ? <ThemedText type="small" themeColor="textSecondary">{board.total === 1 ? t('1 rider') : t('{n} riders', { n: board.total.toLocaleString(currentLocale()) })}</ThemedText> : null}
      </View>
      <ErrorText error={error} />
      {error ? <Button title={t('Try Again')} kind="secondary" onPress={() => loadBoard(f)} /> : null}
      {board === undefined && !error ? <ActivityIndicator color={Colors.text} style={{ marginTop: Spacing.four }} /> : null}
      {board && !board.rows.length ? (
        <ThemedText themeColor="textSecondary">
          {f.country ? t('No riders from {v} on the board yet. Riders show here once they pick where they ride from and earn a badge level.', { v: filterTitle(f) }) : t('No riders on the board yet.')}
        </ThemedText>
      ) : null}
      {board ? (
        <View style={styles.board}>
          {board.rows.map((r, i) => (
            <Row key={r.userId} r={r} first={i === 0} showCountry={!f.country} />
          ))}
          {board.me && !board.rows.some((r) => r.me) ? (
            <>
              <View style={styles.gap}><Text style={styles.gapDots}>⋯</Text></View>
              <Row r={board.me} first={false} showCountry={!f.country} />
            </>
          ) : null}
        </View>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary" style={{ maxWidth: 640 }}>
        {t('Riders are ranked by the badge levels they earned by riding, the same count as their rank. Ties go to more Gold, then more Silver, then whoever got there first. Brand Ambassador and OnMyLead Founder don’t count. Only your name, picture, badges and the state or country you picked show here, never where you are.')}
      </ThemedText>
    </View>
  );

  if (layout.wide) {
    return (
      <>
        <Stack.Screen options={{ title: t('Leaderboard') }} />
        <TwoPane
          sideWidth={Math.max(320, sideColumnWidth(layout.width))}
          side={
            <>
              {you(false)}
              {filters}
            </>
          }
          main={list}
        />
      </>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Leaderboard') }} />
      {you(true)}
      {filters}
      {list}
      <View style={styles.you}>
        <Settings settings={settings} busy={busy} onShown={toggleShown} />
      </View>
    </Screen>
  );
}

/**
 * Where you stand. Beside the board (tablets) it also holds your settings; on phones those go
 * under the board so the board comes first.
 */
function YouCard({
  settings, board, filter, busy, onShown, compact,
}: { settings: LeaderSettings | null; board: Leaderboard | null; filter: LeaderFilter; busy: boolean; onShown: (on: boolean) => void; compact: boolean }) {
  const me = board?.me;
  return (
    <View style={styles.you}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
        <View style={styles.trophy}>
          <Icon name="trophy" size={26} color={PATCH_COLORS[3].cloth} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText type="small" themeColor="textSecondary">{t('Your Place')}</ThemedText>
          <Text style={styles.youPlace} numberOfLines={1}>{me ? ordinal(me.place) : '–'}</Text>
        </View>
      </View>
      <ThemedText themeColor="textSecondary">{myStanding(board, settings, filter)}</ThemedText>

      {compact ? null : <Settings settings={settings} busy={busy} onShown={onShown} />}
    </View>
  );
}

/** Where you ride from (Change) and Show Me on the Leaderboard. */
function Settings({ settings, busy, onShown }: { settings: LeaderSettings | null; busy: boolean; onShown: (on: boolean) => void }) {
  const where = areaLabel(settings?.country, settings?.state);
  return (
    <View style={{ gap: Spacing.three }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={where ? t('You ride from {where}. Change it', { where }) : t('Pick where you ride from')}
        onPress={() => router.push('/leaderboard-area')}
        style={({ pressed }) => [styles.setting, pressed && { backgroundColor: Colors.backgroundSelected }]}>
        <Icon name="pin" size={20} color={Colors.sky} />
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontWeight: 600 }}>{t('Where You Ride')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{where ?? t('Pick your state or country')}</ThemedText>
        </View>
        <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>{where ? t('Change') : t('Pick')}</ThemedText>
      </Pressable>

      {settings ? (
        <View style={styles.setting}>
          <Icon name="people" size={20} color={Colors.sky} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 600 }}>{t('Show Me on the Leaderboard')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {settings.shown ? t('Riders see your name, badges and area here') : t('Hidden. Riders don’t see you here')}
            </ThemedText>
          </View>
          <Switch
            value={settings.shown}
            disabled={busy}
            onValueChange={onShown}
            trackColor={{ true: Colors.sky, false: Colors.backgroundSelected }}
            thumbColor="#FFFFFF"
            {...({ activeThumbColor: '#FFFFFF' } as object)}
            accessibilityLabel={t('Show Me on the Leaderboard')}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Everywhere, a country, then a state: only places that have riders on the board, plus your own. */
function Filters({
  areas, settings, filter, onChange,
}: { areas: LeaderArea[]; settings: LeaderSettings | null; filter: LeaderFilter; onChange: (f: LeaderFilter) => void }) {
  const countries = areas.map((a) => a.country);
  for (const c of [settings?.country, filter.country]) if (c && !countries.includes(c)) countries.push(c);
  const area = areas.find((a) => a.country === filter.country);
  const states = (area?.states ?? []).map((s) => s.state);
  for (const s of [filter.country === settings?.country ? settings?.state : null, filter.state]) if (s && !states.includes(s)) states.push(s);
  const hasStateList = statesOf(filter.country).length > 0;
  return (
    <View style={{ gap: Spacing.three }}>
      <Choice<string | null>
        label={t('Country')}
        value={filter.country}
        onChange={(c) => onChange({ country: c, state: c && c === settings?.country ? settings?.state ?? null : null })}
        options={[{ value: null, label: t('Everywhere') }, ...countries.map((c) => ({ value: c, label: countryName(c) ?? c }))]}
      />
      {filter.country && hasStateList && states.length ? (
        <Choice<string | null>
          label={stateWord(filter.country)}
          value={filter.state}
          onChange={(s) => onChange({ country: filter.country, state: s })}
          options={[
            { value: null, label: t('All of {v}', { v: countryName(filter.country) }) },
            ...states.sort((a, b) => (stateName(filter.country, a) ?? a).localeCompare(stateName(filter.country, b) ?? b)).map((s) => ({ value: s, label: stateName(filter.country, s) ?? s })),
          ]}
        />
      ) : null}
    </View>
  );
}

const PLACE_COLORS: Record<number, string> = { 1: PATCH_COLORS[3].cloth, 2: PATCH_COLORS[2].cloth, 3: PATCH_COLORS[1].cloth };

/** One rider: place, picture, name with their top badge, rank and area, and their levels. Tap for their profile. */
function Row({ r, first, showCountry }: { r: LeaderRow; first: boolean; showCountry: boolean }) {
  const medal = PLACE_COLORS[r.place];
  const area = showCountry ? areaShort(r.country, r.state) : r.state ? stateName(r.country, r.state) : null;
  const rank = rankName(r.levels);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ordinal(r.place)}, ${r.me ? t('You') : r.name}. ${rank}. ${levelsLine(r)}.${area ? ` ${area}.` : ''}${r.top ? t(' Top badge {v}.', { v: badgeTitle(r.top) }) : ''}`}
      onPress={() => router.push(profileHref(r.userId) as never)}
      style={({ pressed }) => [styles.row, !first && styles.rowLine, r.me && styles.rowMe, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={[styles.place, medal ? { backgroundColor: medal } : null]}>
        <Text style={[styles.placeText, medal ? { color: '#14202E' } : null]} numberOfLines={1} adjustsFontSizeToFit>{r.place}</Text>
      </View>
      <RiderPhoto
        userId={r.userId}
        size={40}
        zoom={false}
        fallback={
          <View style={styles.dot}>
            <Text style={styles.initial}>{initialOf(r.name)}</Text>
          </View>
        }
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.name} numberOfLines={1}>{r.me ? `${r.name} (You)` : r.name}</Text>
          {r.top ? <BadgePatch badge={r.top.badge} level={r.top.level} size={18} /> : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {[rank, area].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
      <View style={styles.score}>
        <Text style={styles.levels}>{r.levels}</Text>
        <View style={styles.medals}>
          {r.gold ? <Medal level={3} n={r.gold} /> : null}
          {r.silver ? <Medal level={2} n={r.silver} /> : null}
          {r.bronze ? <Medal level={1} n={r.bronze} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function Medal({ level, n }: { level: 1 | 2 | 3; n: number }) {
  return (
    <View style={styles.medal}>
      <View style={[styles.medalDot, { backgroundColor: PATCH_COLORS[level].cloth }]} />
      <Text style={styles.medalText}>{n}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  you: { gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  trophy: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  youPlace: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 44 },
  setting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: Radius.card, backgroundColor: Colors.background },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 34, flexShrink: 1 },
  board: { borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three },
  rowLine: { borderTopWidth: 1, borderTopColor: Colors.background },
  rowMe: { backgroundColor: Colors.backgroundSelected },
  place: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  placeText: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 17 },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  initial: { color: Colors.text, fontFamily: font(700), fontSize: 17 },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 17, flexShrink: 1 },
  score: { alignItems: 'flex-end', gap: 2 },
  levels: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 24, lineHeight: 26 },
  medals: { flexDirection: 'row', gap: 6 },
  medal: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  medalDot: { width: 8, height: 8, borderRadius: 4 },
  medalText: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 12 },
  gap: { alignItems: 'center', paddingVertical: 2, borderTopWidth: 1, borderTopColor: Colors.background },
  gapDots: { color: Colors.textSecondary, fontSize: 18 },
}));
