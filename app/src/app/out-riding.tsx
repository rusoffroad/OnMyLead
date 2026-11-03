import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AddFriendButton } from '@/components/add-friend-button';
import { RiderDot } from '@/components/convoy';
import { Icon } from '@/components/icon';
import { RangeRings } from '@/components/range-rings';
import { ReportSheet } from '@/components/report-sheet';
import { ThemedText } from '@/components/themed-text';
import { TwoPane } from '@/components/two-pane';
import { Button, ErrorText, Field, Screen, Section, Segmented } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { friendIds, splitFriends } from '@/core/friends';
import { sideColumnWidth } from '@/core/layout';
import {
  AUDIENCE_CHOICES, countLine, DEFAULT_HOURS, DEFAULT_RADIUS, distanceLabel, DURATION_OPTIONS, endsLabel, IDLE_HOURS, isOut,
  MAX_SPOT_LENGTH, NOT_SWITCHED_ON, outSince, RADIUS_OPTIONS, sortNearby, tidySpot, type Audience, type NearbyRider, type Radius as RadiusMiles,
} from '@/core/out-riding';
import { useLayout } from '@/hooks/use-layout';
import { confirmAndBlock, useBlocks } from '@/lib/blocks';
import { useFriends } from '@/lib/friends';
import { goOutRiding, nearbyRiders, OutRidingOffError, refreshOutRiding, stopOutRiding, updateOutRiding, useMyOutRiding } from '@/lib/out-riding';
import { useSession } from '@/lib/session';

/** How often the list refreshes while the screen is open. */
const LIST_EVERY_MS = 60_000;

/**
 * Out Riding: switch it on when you're out on the trail, and see which other riders are out near
 * you right now, with roughly how far away they are (never where). Message any of them. By
 * default only your friends and riders you know see you and show here; Everyone Nearby opens it up to any rider
 * at the same park who chose the same. Phones: one column. Tablets and wide windows: your status
 * on the left, the rings and the list on the right.
 */
export default function OutRiding() {
  const { session, loading } = useSession();
  const me = useMyOutRiding();
  const blocks = useBlocks();
  const friends = useFriends();
  const { wide, width } = useLayout();
  const on = isOut(me.status);

  // Settings for switching on (and for changing them while on).
  const [audience, setAudience] = useState<Audience>('riders');
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [spot, setSpot] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The list.
  const [radius, setRadius] = useState<RadiusMiles>(DEFAULT_RADIUS);
  const [scope, setScope] = useState<Audience>('riders');
  const [loadedRiders, setRiders] = useState<NearbyRider[] | null>(null);
  const [off, setOff] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reporting, setReporting] = useState<ComponentProps<typeof ReportSheet>['target']>(null);
  const [now, setNow] = useState(() => Date.now());

  // Start the form from what's saved.
  const [seeded, setSeeded] = useState<string | null>(null);
  const savedKey = me.status ? `${me.status.audience}|${me.status.spot ?? ''}` : null;
  if (savedKey !== seeded) {
    setSeeded(savedKey);
    if (me.status) {
      setAudience(me.status.audience);
      setSpot(me.status.spot ?? '');
      setScope(me.status.audience);
    }
  }

  const riders = on ? loadedRiders : null;
  const everyoneOn = on && me.status?.audience === 'everyone';
  const shownScope: Audience = everyoneOn ? scope : 'riders';

  const loadList = useCallback(() => {
    if (!on) return;
    nearbyRiders(radius, shownScope)
      .then((list) => {
        setOff(false);
        setRiders(sortNearby(list));
        setNow(Date.now());
      })
      .catch((e) => {
        if (e instanceof OutRidingOffError) setOff(true);
        else setError((e as Error).message);
      });
  }, [on, radius, shownScope]);

  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      if (!session) {
        router.replace('/sign-in');
        return;
      }
      refreshOutRiding().then(loadList);
      const t = setInterval(loadList, LIST_EVERY_MS);
      return () => clearInterval(t);
    }, [session, loading, loadList]),
  );
  useEffect(() => {
    const t = setTimeout(loadList, 0);
    return () => clearTimeout(t);
  }, [loadList]);

  // Friends first, then the rest of the riders you know, then nearest.
  const myFriends = friendIds(friends.list);
  const visible = (riders ?? [])
    .filter((r) => !blocks.ids.has(r.user_id))
    .sort((a, b) => Number(myFriends.has(b.user_id)) - Number(myFriends.has(a.user_id)));
  const friendRequests = splitFriends(friends.list).received.length;

  async function switchOn() {
    setBusy(true);
    setError(null);
    try {
      await goOutRiding({ audience, spot: tidySpot(spot), hours });
      setScope(audience);
      setEditing(false);
    } catch (e) {
      setError(e instanceof OutRidingOffError ? NOT_SWITCHED_ON : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveChanges() {
    setBusy(true);
    setError(null);
    try {
      await updateOutRiding({ audience, spot: tidySpot(spot) });
      setScope(audience);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function switchOff() {
    setBusy(true);
    setError(null);
    try {
      await stopOutRiding();
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const status = (
    <>
      {off || me.off ? (
        <View style={styles.note}>
          <ThemedText type="smallBold">Not Switched On Yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{NOT_SWITCHED_ON}</ThemedText>
        </View>
      ) : null}

      {on && me.status && !editing ? (
        <View style={[styles.statusCard, styles.statusOn]}>
          <View style={styles.statusTop}>
            <View style={styles.liveDot} />
            <Text style={styles.statusTitle}>You’re Out Riding</Text>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {endsLabel(me.status.expires_at, now)}. {me.status.audience === 'everyone' ? 'Everyone nearby who chose Everyone Nearby' : 'Your friends and riders you know'} can see your name and roughly how far away you are.
          </ThemedText>
          {me.status.spot ? <Text style={styles.spotLine}>At {me.status.spot}</Text> : null}
          <View style={styles.btnRow}>
            <Button title="Change" kind="secondary" style={{ flex: 1 }} onPress={() => setEditing(true)} />
            <Button title="Turn Off" kind="secondary" loading={busy} style={{ flex: 1 }} onPress={switchOff} />
          </View>
        </View>
      ) : (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>{on ? 'Change Out Riding' : 'Going Riding?'}</Text>
          {!on ? (
            <ThemedText type="small" themeColor="textSecondary">
              Switch on Out Riding to see who else is out near you, like friends showing online in a game. Off until you switch it on.
            </ThemedText>
          ) : null}

          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold">Who Can See Me</ThemedText>
            {AUDIENCE_CHOICES.map((c) => {
              const sel = audience === c.value;
              return (
                <Pressable
                  key={c.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  onPress={() => setAudience(c.value)}
                  style={[styles.option, sel && styles.optionOn]}>
                  <View style={[styles.radio, sel && styles.radioOn]}>{sel ? <View style={styles.radioDot} /> : null}</View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.optionTitle}>{c.title}</Text>
                    <Text style={styles.optionDetail}>{c.detail}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {!on ? (
            <View style={{ gap: Spacing.two }}>
              <ThemedText type="smallBold">Turn Off After</ThemedText>
              <Segmented
                options={DURATION_OPTIONS.map((d) => ({ value: String(d.hours), label: d.label }))}
                value={String(hours)}
                onChange={(v) => setHours(Number(v))}
              />
            </View>
          ) : null}

          <Field
            label="Where You’re Riding (Optional)"
            hint="Shown to riders who can see you. Leave it blank to just show the distance."
            value={spot}
            onChangeText={setSpot}
            maxLength={MAX_SPOT_LENGTH}
            placeholder="Windrock Park"
            returnKeyType="done"
          />

          <ThemedText type="small" themeColor="textSecondary">
            Riders see your name and roughly how far away you are, never where you are. It turns off on its own at the end you pick, or after {IDLE_HOURS} hours without opening OnMyLead.
            {Platform.OS === 'web' ? ' Your browser will ask for your location.' : ''}
          </ThemedText>
          <ErrorText error={error} />
          {on ? (
            <View style={styles.btnRow}>
              <Button title="Cancel" kind="ghost" style={{ flex: 1 }} onPress={() => setEditing(false)} />
              <Button title="Save" loading={busy} style={{ flex: 1 }} onPress={saveChanges} />
            </View>
          ) : (
            <Button title="Go Out Riding" big loading={busy || me.busy} disabled={off || me.off} onPress={switchOn} />
          )}
        </View>
      )}
      {on && !editing ? <ErrorText error={error} /> : null}

      <Pressable accessibilityRole="button" onPress={() => router.push('/messages')} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}>
        <Icon name="mail" color={Colors.sky} />
        <Text style={styles.linkText}>Messages</Text>
        <Icon name="chevron" color={Colors.textSecondary} />
      </Pressable>
      {friends.loaded && !friends.off ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/friends')} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}>
          <Icon name="addFriend" color={RideColors.green} />
          <Text style={styles.linkText}>Friends</Text>
          {friendRequests ? <Text style={styles.reqBadge}>{friendRequests}</Text> : null}
          <Icon name="chevron" color={Colors.textSecondary} />
        </Pressable>
      ) : null}
    </>
  );

  const ringSize = Math.min(wide ? 420 : width - Spacing.three * 2, 420);

  const list = on ? (
    <>
      <Section title="Out Near You" />
      {everyoneOn ? (
        <Segmented
          options={[{ value: 'riders', label: 'Riders I Know' }, { value: 'everyone', label: 'Everyone Nearby' }]}
          value={scope}
          onChange={(v) => setScope(v as Audience)}
        />
      ) : null}
      <View style={styles.radiusRow} accessibilityRole="radiogroup" accessibilityLabel="How far to look">
        <Text style={styles.radiusLabel}>Within</Text>
        {RADIUS_OPTIONS.map((r) => (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ selected: radius === r }}
            onPress={() => setRadius(r)}
            style={[styles.radiusChip, radius === r && styles.radiusChipOn]}>
            <Text style={[styles.radiusText, radius === r && { color: Colors.background }]}>{r} Mi</Text>
          </Pressable>
        ))}
      </View>

      {riders ? <RangeRings riders={visible} radius={radius} size={ringSize} onPick={(r) => router.push(`/messages/${r.user_id}`)} /> : null}
      {riders ? <Text style={styles.count}>{countLine(visible, radius)}</Text> : null}

      {riders && !visible.length ? (
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          {shownScope === 'riders'
            ? 'Your friends and riders you know show up here when they switch on Out Riding too.'
            : 'Anyone at the same park shows up here once they switch on Out Riding with Everyone Nearby.'}
        </ThemedText>
      ) : null}

      <View style={{ gap: Spacing.two }}>
        {visible.map((r) => {
          const open = menuFor === r.user_id;
          return (
            <View key={r.user_id} style={styles.riderCard}>
              <View style={styles.riderTop}>
                <View>
                  <RiderDot userId={r.user_id} name={r.display_name} size={40} zoom />
                  <View style={[styles.badge, { backgroundColor: r.known ? RideColors.green : RideColors.rider }]} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={styles.riderName} numberOfLines={1}>{r.display_name}</Text>
                  <Text style={styles.riderMeta} numberOfLines={1}>
                    {distanceLabel(r.miles)}{r.spot ? `, at ${r.spot}` : ''}
                  </Text>
                  <Text style={styles.riderSub} numberOfLines={1}>
                    {myFriends.has(r.user_id) ? 'Friend' : r.known ? 'Ridden With You' : 'New Rider'}, {outSince(r.since, now)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${r.display_name}`}
                  onPress={() => router.push(`/messages/${r.user_id}`)}
                  style={({ pressed }) => [styles.msgBtn, pressed && { opacity: 0.8 }]}>
                  <Icon name="mail" color="#fff" size={20} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`More for ${r.display_name}`}
                  accessibilityState={{ expanded: open }}
                  hitSlop={8}
                  onPress={() => setMenuFor(open ? null : r.user_id)}
                  style={styles.moreBtn}>
                  <Text style={styles.moreText}>•••</Text>
                </Pressable>
              </View>
              {open ? (
                <View style={styles.menu}>
                  <AddFriendButton userId={r.user_id} name={r.display_name} style={styles.menuBtn} onDone={() => setMenuFor(null)} />
                  <Button
                    title="Report Rider"
                    kind="secondary"
                    style={styles.menuBtn}
                    onPress={() => {
                      setMenuFor(null);
                      setReporting({ kind: 'rider', userId: r.user_id, name: r.display_name, context: 'From Out Riding.', source: 'out_riding' });
                    }}
                  />
                  {!blocks.off ? (
                    <Button
                      title="Block Rider"
                      kind="secondary"
                      style={styles.menuBtn}
                      onPress={() => {
                        setMenuFor(null);
                        confirmAndBlock(r.user_id, r.display_name);
                      }}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </>
  ) : (
    <View style={styles.offPreview}>
      <RangeRings riders={[]} radius={radius} size={Math.min(ringSize, 300)} />
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', maxWidth: 360 }}>
        Switch on Out Riding to see who’s out near you. You only see others while they can see you.
      </ThemedText>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Out Riding' }} />
      {wide ? (
        <TwoPane side={status} main={list} sideWidth={sideColumnWidth(width)} />
      ) : (
        <Screen>
          {status}
          {list}
        </Screen>
      )}
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  note: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: Colors.sky, padding: Spacing.three, gap: 4 },
  statusCard: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.three },
  statusOn: { borderWidth: 2, borderColor: RideColors.green },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: RideColors.green, borderWidth: 3, borderColor: `${RideColors.green}55` },
  statusTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 32 },
  spotLine: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  btnRow: { flexDirection: 'row', gap: Spacing.two },
  option: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: Radius.control,
    backgroundColor: Colors.backgroundSelected, borderWidth: 2, borderColor: 'transparent',
  },
  optionOn: { borderColor: Colors.sky },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { borderColor: Colors.sky },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.sky },
  optionTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20 },
  optionDetail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: Spacing.three,
    backgroundColor: Colors.backgroundElement, borderRadius: Radius.control,
  },
  linkText: { flex: 1, color: Colors.text, fontFamily: font(700), fontSize: 17 },
  reqBadge: {
    color: '#fff', backgroundColor: Colors.accent, fontFamily: font(700), fontSize: 12, overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill,
  },
  radiusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  radiusLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 15 },
  radiusChip: { minHeight: 40, paddingHorizontal: 16, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center' },
  radiusChipOn: { backgroundColor: Colors.text, borderColor: Colors.text },
  radiusText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 17 },
  count: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, textAlign: 'center' },
  riderCard: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: 14, gap: Spacing.two },
  riderTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: Colors.backgroundElement },
  riderName: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 22, lineHeight: 24 },
  riderMeta: { color: Colors.text, fontFamily: font(600), fontSize: 15 },
  riderSub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  msgBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.sky, alignItems: 'center', justifyContent: 'center' },
  moreBtn: { width: 36, height: 46, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: Colors.textSecondary, fontFamily: font(800), fontSize: 16, letterSpacing: 1 },
  menu: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  menuBtn: { flex: 1, minHeight: 44 },
  offPreview: { alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.three, opacity: 0.85 },
});
