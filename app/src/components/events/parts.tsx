import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { BottomSheet } from '@/components/bottom-sheet';
import { Gradient, Home, Pill } from '@/components/home/parts';
import { Icon } from '@/components/icon';
import { TextBox } from '@/components/keyboard';
import { RiderDot } from '@/components/convoy';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import {
  agendaByDay, agendaKindLabel, agendaKindTone, agendaTime, cardPlace, dateBlock, eventDates, eventPhase,
  type AgendaItem, type EventCard, type Person,
} from '@/core/events';
import { photoUrl } from '@/lib/events';

/** Red for riding, gold for prizes and shows, blue for everything else, on the agenda rail. */
export const TONE = { red: Colors.accent, gold: Home.gold, blue: Colors.sky } as const;

/**
 * The ticket stub: the event's first day as a torn-off ticket (red month band, big day number).
 * It is the one bold mark of Events, on every card and on the event page.
 */
export function DateStub({ iso, size = 'md', style }: { iso: string; size?: 'sm' | 'md' | 'lg'; style?: StyleProp<ViewStyle> }) {
  const { month, day } = dateBlock(iso);
  const s = STUB[size];
  return (
    <View style={[styles.stub, { width: s.w }, style]} accessible accessibilityLabel={`${month} ${day}`}>
      <View style={[styles.stubBand, { height: s.band }]}>
        <Text style={[styles.stubMonth, { fontSize: s.month }]}>{month}</Text>
      </View>
      <Text style={[styles.stubDay, { fontSize: s.day, lineHeight: s.day * 1.05 }]}>{day}</Text>
      {/* the perforation */}
      <View style={styles.perf}>
        {Array.from({ length: Math.round(s.w / 7) }).map((_, i) => <View key={i} style={styles.perfDot} />)}
      </View>
    </View>
  );
}
const STUB = {
  sm: { w: 46, band: 16, month: 11, day: 22 },
  md: { w: 58, band: 19, month: 12, day: 30 },
  lg: { w: 74, band: 24, month: 15, day: 40 },
} as const;

/** A cover photo, or (with none) a topo-line panel in the event's colours. */
export function Cover({ path, seed, height, radius = 0 }: { path: string | null | undefined; seed: string; height: number; radius?: number }) {
  const url = photoUrl(path);
  if (url) {
    return (
      <View style={{ height, borderRadius: radius, overflow: 'hidden', backgroundColor: '#0D2236' }}>
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
      </View>
    );
  }
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const k = Math.abs(h % 30);
  return (
    <View style={{ height, borderRadius: radius, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={320} height={160} fill="#0E2238" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Path
            key={i}
            d={`M-20 ${30 + i * 24 + k / 3} C70 ${10 + i * 22 + k} 150 ${70 + i * 18 - k} 230 ${40 + i * 22} S330 ${20 + i * 24} 360 ${30 + i * 22}`}
            stroke={i === 3 ? 'rgba(229,38,46,0.45)' : 'rgba(59,134,247,0.16)'} strokeWidth={i === 3 ? 2 : 1.2} fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

/** One event in a list: cover, ticket stub, name, dates, place, and how many are going. */
export function EventCardView({ e, width, compact }: { e: EventCard; width?: number; compact?: boolean }) {
  const phase = eventPhase(e);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${e.title}, ${eventDates(e.starts_at, e.ends_at)}, ${cardPlace(e)}`}
      onPress={() => router.push(`/e/${e.share_code}`)}
      style={({ pressed }) => [styles.card, width ? { width } : null, pressed && { opacity: 0.88 }]}>
      <View>
        <Cover path={e.cover_path} seed={e.id} height={compact ? 110 : 150} />
        <Gradient colors={['rgba(16,30,51,0)', 'rgba(16,30,51,0.85)']} />
        <DateStub iso={e.starts_at} size="sm" style={styles.cardStub} />
        <View style={styles.cardPills}>
          {phase === 'now' ? <Pill text="Happening Now" tone="out" /> : null}
          {phase === 'cancelled' ? <Pill text="Cancelled" tone="out" /> : null}
          {phase === 'over' ? <Pill text="Over" tone="dark" /> : null}
          {e.i_host ? <Pill text="Hosting" tone="gold" /> : e.mine === 'going' ? <Pill text="Going" tone="dark" /> : e.mine === 'interested' ? <Pill text="Interested" tone="dark" /> : null}
          {e.visibility === 'unlisted' && e.i_host ? <Pill text="Link Only" tone="dark" /> : null}
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{e.title}</Text>
        <Text style={styles.muted} numberOfLines={1}>{eventDates(e.starts_at, e.ends_at)}</Text>
        <Text style={styles.muted} numberOfLines={1}>{cardPlace(e)}</Text>
        <View style={styles.cardFoot}>
          {e.going ? <Foot icon="people" text={`${e.going.toLocaleString('en-US')} Going`} /> : null}
          {e.rides ? <Foot icon="go" text={`${e.rides} ${e.rides === 1 ? 'Ride' : 'Rides'}`} /> : null}
          {e.agenda ? <Foot icon="calendar" text={`${e.agenda} on the Agenda`} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function Foot({ icon, text }: { icon: 'people' | 'go' | 'calendar'; text: string }) {
  return (
    <View style={styles.foot}>
      <Icon name={icon} size={14} color={Home.muted} />
      <Text style={styles.footText}>{text}</Text>
    </View>
  );
}

/** The agenda: a time rail per day, a coloured stop for each item (by kind). */
export function AgendaTimeline({ items, onEdit }: { items: AgendaItem[]; onEdit?: (item: AgendaItem) => void }) {
  const days = agendaByDay(items);
  return (
    <View style={{ gap: Spacing.four }}>
      {days.map((d) => (
        <View key={d.key} style={{ gap: Spacing.two }}>
          <Text style={styles.dayTitle} accessibilityRole="header">{d.title}</Text>
          <View>
            {d.items.map((it, i) => {
              const tone = TONE[agendaKindTone(it.kind)];
              const last = i === d.items.length - 1;
              const body = (
                <View style={styles.agRow}>
                  <Text style={styles.agTime}>{agendaTime(it).replace(' - ', '\n')}</Text>
                  <View style={styles.agRail}>
                    <View style={[styles.agStop, { borderColor: tone }]} />
                    {!last ? <View style={styles.agLine} /> : null}
                  </View>
                  <View style={[styles.agBody, !last && { paddingBottom: Spacing.three }]}>
                    <Text style={[styles.agKind, { color: tone }]}>{agendaKindLabel(it.kind)}</Text>
                    <Text style={styles.agTitle}>{it.title}</Text>
                    {it.place ? (
                      <View style={styles.foot}>
                        <Icon name="pin" size={13} color={Home.muted} />
                        <Text style={styles.muted}>{it.place}</Text>
                      </View>
                    ) : null}
                    {it.details ? <Text style={styles.agDetails}>{it.details}</Text> : null}
                  </View>
                  {onEdit ? <Icon name="more" size={18} color={Home.muted} /> : null}
                </View>
              );
              return onEdit ? (
                <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={`Edit ${it.title}`} onPress={() => onEdit(it)}
                  style={({ pressed }) => pressed && { opacity: 0.7 }}>
                  {body}
                </Pressable>
              ) : (
                <View key={it.id}>{body}</View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A sheet listing riders to pick one from (co-host or ride manager), with a search box. */
export function PeopleSheet({
  visible, title, note, people, onPick, onClose, clearLabel, onClear,
}: {
  visible: boolean; title: string; note: string; people: Person[]; onPick: (p: Person) => void; onClose: () => void;
  clearLabel?: string; onClear?: () => void;
}) {
  const [q, setQ] = useState('');
  const shown = q.trim() ? people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())) : people;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText>
      {people.length > 6 ? (
        <View style={styles.search}>
          <Icon name="search" size={18} color={Colors.textSecondary} />
          <TextBox value={q} onChangeText={setQ} placeholder="Search by name" placeholderTextColor={Colors.textSecondary} style={styles.searchInput} />
        </View>
      ) : null}
      {onClear ? (
        <Pressable accessibilityRole="button" onPress={onClear} style={styles.personRow}>
          <Icon name="close" size={18} color={Colors.danger} />
          <ThemedText style={{ color: Colors.danger, fontWeight: 600 }}>{clearLabel ?? 'Clear'}</ThemedText>
        </Pressable>
      ) : null}
      {shown.length ? (
        <View style={styles.people}>
          {shown.map((p, i) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Pick ${p.name}`} onPress={() => onPick(p)}
              style={({ pressed }) => [styles.personRow, i > 0 && styles.rule, pressed && { backgroundColor: Colors.backgroundSelected }]}>
              <RiderDot userId={p.id} name={p.name} size={34} />
              <ThemedText style={{ flex: 1, fontWeight: 600 }} numberOfLines={1}>{p.name}</ThemedText>
              <Icon name="plus" size={18} color={Colors.sky} />
            </Pressable>
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {people.length ? 'No one by that name.' : 'Add friends or ride with people first, and they show up here.'}
        </ThemedText>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stub: { backgroundColor: '#F4F1E8', borderRadius: 8, overflow: 'hidden', alignItems: 'center', paddingBottom: 6 },
  stubBand: { alignSelf: 'stretch', backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  stubMonth: { color: '#fff', fontFamily: font(800, 'display'), letterSpacing: 1 },
  stubDay: { color: '#0A1626', fontFamily: font(800, 'display'), marginTop: 2 },
  perf: { position: 'absolute', bottom: -3, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around' },
  perfDot: { width: 4, height: 6, borderRadius: 2, backgroundColor: Home.panel },
  card: { borderRadius: 22, backgroundColor: Home.panel, borderWidth: 1, borderColor: Home.line, overflow: 'hidden' },
  cardStub: { position: 'absolute', left: 12, bottom: -14 },
  cardPills: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '80%' },
  cardBody: { paddingHorizontal: 14, paddingTop: 22, paddingBottom: 14, gap: 3 },
  cardTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 24 },
  cardFoot: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  muted: { color: Home.muted, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footText: { color: Home.muted, fontFamily: font(600), fontSize: 12 },
  dayTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19 },
  agRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  agTime: { width: 70, color: Colors.text, fontFamily: font(700, 'display'), fontSize: 15, lineHeight: 18, textAlign: 'right', paddingTop: 1 },
  agRail: { width: 14, alignItems: 'center', alignSelf: 'stretch' },
  agStop: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, backgroundColor: Colors.background, marginTop: 3 },
  agLine: { flex: 1, width: 2, backgroundColor: Home.line, marginTop: 2 },
  agBody: { flex: 1, gap: 2 },
  agKind: { fontFamily: font(700), fontSize: 12 },
  agTitle: { color: Colors.text, fontFamily: font(600), fontSize: 16, lineHeight: 21 },
  agDetails: { color: Colors.textSecondary, fontFamily: font(400), fontSize: 14, lineHeight: 20, marginTop: 2 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.backgroundSelected, borderRadius: Radius.control, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: Colors.text, fontFamily: font(500), fontSize: 16, paddingVertical: 10 },
  people: { backgroundColor: Colors.background, borderRadius: Radius.card, overflow: 'hidden' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
