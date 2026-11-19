import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { BottomSheet } from '@/components/bottom-sheet';
import { Icon, type IconName } from '@/components/icon';
import { TextBox } from '@/components/keyboard';
import { PhotoViewer } from '@/components/photo-viewer';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { withAlpha } from '@/core/color';
import {
  phoneDigits, phoneText, ratingText, REVIEW_MAX_CHARS, REVIEW_MAX_PHOTOS, reviewProblem, starShapes, trailLevels,
  type MyReview, type SpotReview, type SpotReviews, type SpotTrails,
} from '@/core/spots';
import { confirmAsync } from '@/lib/confirm';
import { t } from '@/lib/i18n';
import { deleteSpotReview, pickReviewPhotos, removeReviewPhotos, saveSpotReview, spotPhotoUrl, uploadReviewPhoto } from '@/lib/spots';

/**
 * The parts of a place page (app/spot/[id].tsx, 4.0 "a profile for the park or area", approved mock
 * v3 2026-11-18): the row of quick actions, the trails by level, the info card (address, phone,
 * hours, fees, season) and the rider reviews with photos and the Reviews on Google link.
 */

/** One of the square quick actions under a place's name (Directions, Call, Website, Share). */
export function QuickAction({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}>
      <Icon name={icon} size={22} color={primary ? '#fff' : Colors.text} strokeWidth={2.1} />
      <Text style={[styles.actionText, primary && { color: '#fff' }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Five stars for a rating (halves shown), in gold. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessible accessibilityLabel={t('{n} out of 5 stars', { n: ratingText(value) })}>
      {starShapes(value).map((s, i) => <Star key={i} size={size} shape={s} id={`s${i}`} />)}
    </View>
  );
}

const STAR = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';
const GOLD = '#E2B54A';

function Star({ size, shape, id }: { size: number; shape: 'full' | 'half' | 'empty'; id: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shape === 'half' ? (
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset={0.5} stopColor={GOLD} />
            <Stop offset={0.5} stopColor={GOLD} stopOpacity={0.3} />
          </LinearGradient>
        </Defs>
      ) : null}
      <Path d={STAR} fill={shape === 'full' ? GOLD : shape === 'half' ? `url(#${id})` : withAlpha(GOLD, 0.3)} />
    </Svg>
  );
}

/** The park's trails we draw on the map: miles, how many, closed now, then how many at each level. */
export function TrailsBlock({ trails }: { trails: SpotTrails }) {
  const levels = trailLevels(trails);
  const ink: Record<string, string> = { easy: '#3DBE5A', medium: '#3F7BF0', hard: '#FFFFFF', extreme: '#E5484D', unrated: '#E8A33A' };
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="heading">{t('Trails')}</ThemedText>
      <View style={styles.stats}>
        <Stat big={t('{n} mi', { n: trails.miles.toLocaleString('en-US', { maximumFractionDigits: trails.miles < 10 ? 1 : 0 }) })} small={t('of mapped trails')} />
        <Stat big={String(trails.trails)} small={trails.trails === 1 ? t('trail') : t('trails')} />
        {trails.closed ? <Stat big={String(trails.closed)} small={t('closed now')} /> : null}
      </View>
      {levels.length ? (
        <View style={styles.levels}>
          {levels.map((l) => (
            <View key={l.key} style={[styles.level, { borderTopColor: ink[l.key] }]} accessible accessibilityLabel={`${t(l.label)}: ${l.count}`}>
              <Text style={styles.levelCount}>{l.count}</Text>
              <Text style={styles.levelLabel} numberOfLines={1}>{t(l.label)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">{t('Levels are the park’s own ratings. Trails show on the map in Map Mode and Ride Mode.')}</ThemedText>
    </View>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statBig}>{big}</Text>
      <Text style={styles.statSmall}>{small}</Text>
    </View>
  );
}

export type InfoItem = { icon: IconName; label: string; lines: string[]; onPress?: () => void; link?: boolean };

/** The place's details as labelled rows. Rows without a value are left out by the caller. */
export function InfoCard({ items }: { items: InfoItem[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.info}>
      {items.map((it, i) => {
        const body = (
          <>
            <Icon name={it.icon} size={20} color={Colors.textSecondary} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.infoLabel}>{it.label}</Text>
              {it.lines.map((l, j) => (
                <Text key={j} style={[styles.infoValue, it.link && { color: Colors.sky }]} selectable={!it.onPress}>{l}</Text>
              ))}
            </View>
            {it.onPress ? <Icon name="chevron" size={16} color={Colors.textSecondary} /> : null}
          </>
        );
        const style = [styles.infoRow, i < items.length - 1 && styles.infoRule];
        return it.onPress ? (
          <Pressable key={it.label} accessibilityRole="button" onPress={it.onPress} style={({ pressed }) => [...style, pressed && { opacity: 0.7 }]}>{body}</Pressable>
        ) : (
          <View key={it.label} style={style}>{body}</View>
        );
      })}
    </View>
  );
}

/** Opens the phone app with the place's number. */
export function callPlace(phone: string) {
  const d = phoneDigits(phone);
  if (d) Linking.openURL(`tel:${d}`).catch(() => {});
}

/** The phone number as shown on a place page. */
export const phoneLabel = phoneText;

/**
 * Rider reviews: the rating, the newest photos, the newest reviews (five, then all), the rider's own
 * (with Edit), and Reviews on Google, which opens the park on Google Maps (Chris chose the free
 * link 2026-11-18; no Google content is copied).
 */
export function ReviewsBlock({
  reviews, signedIn, onWrite, onGoogle,
}: { reviews: SpotReviews; signedIn: boolean; onWrite: () => void; onGoogle: () => void }) {
  const [all, setAll] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const shown = all ? reviews.list : reviews.list.slice(0, 5);
  const mine = reviews.mine;
  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.headRow}>
        <ThemedText type="heading" style={{ flex: 1 }}>{t('Rider Reviews')}</ThemedText>
        <Pressable accessibilityRole="button" onPress={onWrite} hitSlop={8}>
          <Text style={styles.link}>{mine ? t('Edit Your Review') : t('Write a Review')}</Text>
        </Pressable>
      </View>
      {reviews.count && reviews.average != null ? (
        <View style={styles.summary}>
          <Text style={styles.rating}>{ratingText(reviews.average)}</Text>
          <View style={{ gap: 2 }}>
            <Stars value={reviews.average} />
            <ThemedText type="small" themeColor="textSecondary">
              {reviews.count === 1 ? t('1 OnMyLead rider') : t('{n} OnMyLead riders', { n: reviews.count })}
            </ThemedText>
          </View>
        </View>
      ) : (
        <ThemedText themeColor="textSecondary">
          {signedIn ? t('No reviews yet. Ridden here? Be the first to say how it was.') : t('No reviews yet. Sign in to write the first one.')}
        </ThemedText>
      )}
      {mine?.hidden ? (
        <ThemedText type="small" style={{ color: Colors.danger }}>{t('Your review is hidden for breaking the rider rules. Only you can see it.')}</ThemedText>
      ) : null}
      {reviews.photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -Spacing.three }} contentInset={{ left: 0 }}>
          <View style={{ width: Spacing.three - 8 }} />
          {reviews.photos.map((p) => (
            <Pressable key={p} accessibilityRole="imagebutton" accessibilityLabel={t('Open photo')} onPress={() => setViewing(p)}>
              <Image source={{ uri: spotPhotoUrl(p) }} style={styles.photo} contentFit="cover" cachePolicy="disk" transition={150} />
            </Pressable>
          ))}
          <View style={{ width: Spacing.three - 8 }} />
        </ScrollView>
      ) : null}
      {shown.map((r) => <ReviewCard key={r.id} review={r} onPhoto={setViewing} />)}
      {reviews.list.length > 5 && !all ? (
        <Button title={t('Show All {n} Reviews', { n: reviews.list.length })} kind="ghost" onPress={() => setAll(true)} />
      ) : null}
      <Pressable accessibilityRole="link" onPress={onGoogle} style={({ pressed }) => [styles.google, pressed && { opacity: 0.75 }]}>
        <Text style={styles.googleText}>{t('Reviews on Google')}</Text>
        <Icon name="external" size={16} color={Colors.text} />
      </Pressable>
      <PhotoViewer uri={viewing ? spotPhotoUrl(viewing) : null} square={false} onClose={() => setViewing(null)} />
    </View>
  );
}

function ReviewCard({ review, onPhoto }: { review: SpotReview; onPhoto: (p: string) => void }) {
  const when = review.at ? new Date(review.at) : null;
  return (
    <View style={styles.review}>
      <View style={styles.headRow}>
        <Text style={styles.reviewName} numberOfLines={1}>{review.mine ? t('You') : review.name}</Text>
        <Stars value={review.stars} size={13} />
      </View>
      {review.body ? <Text style={styles.reviewBody}>{review.body}</Text> : null}
      {review.photos.length ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {review.photos.map((p) => (
            <Pressable key={p} accessibilityRole="imagebutton" accessibilityLabel={t('Open photo')} onPress={() => onPhoto(p)}>
              <Image source={{ uri: spotPhotoUrl(p) }} style={styles.thumb} contentFit="cover" cachePolicy="disk" />
            </Pressable>
          ))}
        </View>
      ) : null}
      {when && !Number.isNaN(when.getTime()) ? (
        <Text style={styles.reviewWhen}>{when.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</Text>
      ) : null}
    </View>
  );
}

/**
 * Write or change your review: stars, a few words and up to 4 photos. Photos upload as they're
 * picked; ones you remove before saving are deleted. Delete removes the review and its photos.
 */
export function ReviewSheet({
  visible, spotId, spotName, mine, onClose, onSaved,
}: { visible: boolean; spotId: string; spotName: string; mine: MyReview | null; onClose: () => void; onSaved: () => void }) {
  const [stars, setStars] = useState(mine?.stars ?? 0);
  const [body, setBody] = useState(mine?.body ?? '');
  const [photos, setPhotos] = useState<string[]>(mine?.photos ?? []);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Photos uploaded in this sheet: removed again if the rider closes without saving.
  const [fresh, setFresh] = useState<string[]>([]);

  const close = () => {
    if (fresh.length) removeReviewPhotos(fresh).catch(() => {});
    setFresh([]);
    onClose();
  };

  const addPhotos = async () => {
    setError(null);
    setAdding(true);
    try {
      const picked = await pickReviewPhotos(REVIEW_MAX_PHOTOS - photos.length);
      for (const a of picked) {
        const path = await uploadReviewPhoto(a);
        setPhotos((p) => [...p, path].slice(0, REVIEW_MAX_PHOTOS));
        setFresh((f) => [...f, path]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not add that photo.'));
    } finally {
      setAdding(false);
    }
  };

  const removePhoto = (p: string) => setPhotos((ps) => ps.filter((x) => x !== p));

  const save = async () => {
    const problem = reviewProblem({ stars, body, photos });
    if (problem) return setError(t(problem));
    setBusy(true);
    setError(null);
    try {
      await saveSpotReview(spotId, { stars, body, photos });
      // Files dropped from the review (old or just added) are deleted.
      const dropped = [...(mine?.photos ?? []), ...fresh].filter((p) => !photos.includes(p));
      if (dropped.length) removeReviewPhotos(dropped).catch(() => {});
      setFresh([]);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not save your review.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAsync(t('Delete Your Review?'), t('Your stars, words and photos for {name} are removed.', { name: spotName }), t('Delete'));
    if (!ok) return;
    {
      setBusy(true);
      try {
        await deleteSpotReview(spotId);
        if (fresh.length) removeReviewPhotos(fresh).catch(() => {});
        setFresh([]);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('Could not delete your review.'));
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={mine ? t('Edit Your Review') : t('Review {name}', { name: spotName })}
      footer={
        <View style={{ gap: Spacing.two }}>
          <ErrorText error={error} />
          <Button title={t('Save Review')} onPress={save} loading={busy} disabled={adding || stars < 1} />
          {mine ? <Button title={t('Delete Review')} kind="ghost" onPress={remove} disabled={busy} /> : null}
        </View>
      }>
      <View style={{ gap: 6 }}>
        <ThemedText type="smallBold">{t('How was it?')}</ThemedText>
        <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="adjustable" accessibilityLabel={t('{n} out of 5 stars', { n: stars })}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} accessibilityRole="button" accessibilityLabel={n === 1 ? t('1 star') : t('{n} stars', { n })} hitSlop={4} onPress={() => setStars(n)}>
              <Star size={38} shape={n <= stars ? 'full' : 'empty'} id={`pick${n}`} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <ThemedText type="smallBold">{t('Tell Riders About It')}</ThemedText>
        <TextBox
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={REVIEW_MAX_CHARS}
          placeholder={t('Trails, difficulty, crowds, the staff, what to bring…')}
          placeholderTextColor={Colors.textSecondary}
          accessibilityLabel={t('Your review')}
          style={styles.bodyInput}
        />
      </View>
      <View style={{ gap: 6 }}>
        <ThemedText type="smallBold">{t('Photos')}</ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p) => (
            <View key={p}>
              <Image source={{ uri: spotPhotoUrl(p) }} style={styles.editThumb} contentFit="cover" />
              <Pressable accessibilityRole="button" accessibilityLabel={t('Remove photo')} onPress={() => removePhoto(p)} style={styles.thumbX} hitSlop={6}>
                <Icon name="close" size={14} color="#fff" strokeWidth={2.6} />
              </Pressable>
            </View>
          ))}
          {photos.length < REVIEW_MAX_PHOTOS ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('Add Photos')} onPress={addPhotos} disabled={adding} style={({ pressed }) => [styles.addPhoto, pressed && { opacity: 0.7 }]}>
              {adding ? <ActivityIndicator color={Colors.text} /> : <Icon name="image" size={24} color={Colors.textSecondary} />}
            </Pressable>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">{t('Up to 4. Everyone can see your review, your ride name and your photos.')}</ThemedText>
      </View>
    </BottomSheet>
  );
}

/** A favorite heart: filled red when saved. */
export function FavoriteButton({ on, busy, onPress }: { on: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, busy }}
      accessibilityLabel={on ? t('Remove from Favorite Places') : t('Save to Favorite Places')}
      onPress={onPress}
      disabled={busy}
      hitSlop={6}
      style={({ pressed }) => [styles.fav, on && styles.favOn, pressed && { opacity: 0.75 }]}>
      <Icon name="heart" size={20} color={on ? '#fff' : Colors.text} fill={on ? '#fff' : undefined} strokeWidth={2.2} />
      <Text style={[styles.favText, on && { color: '#fff' }]}>{on ? t('Saved') : t('Save')}</Text>
    </Pressable>
  );
}

/** The place's kind as a tag in its pin colour. */
export function KindTag({ label, ink, icon }: { label: string; ink: string; icon: IconName }) {
  return (
    <View style={[styles.kindTag, { backgroundColor: ink }]}>
      <Icon name={icon} size={15} color={ink === '#E2B54A' ? '#1D1606' : '#fff'} strokeWidth={2.4} />
      <Text style={[styles.kindText, ink === '#E2B54A' && { color: '#1D1606' }]}>{label}</Text>
    </View>
  );
}

/** A thin decorative strip used by nothing yet; kept out. */

const styles = themedStyles(() => ({
  action: {
    flex: 1, minHeight: 68, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4,
    backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border,
  },
  actionPrimary: { backgroundColor: Colors.sky, borderColor: Colors.sky },
  actionText: { color: Colors.text, fontFamily: font(600), fontSize: 13.5 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: 16, padding: 12, backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border },
  statBig: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
  statSmall: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  levels: { flexDirection: 'row', gap: 6 },
  level: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: Colors.backgroundElement, borderTopWidth: 3 },
  levelCount: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 21 },
  levelLabel: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 11.5 },
  info: { borderRadius: Radius.card, paddingHorizontal: 14, backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  infoRule: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  infoValue: { color: Colors.text, fontFamily: font(600), fontSize: 16, lineHeight: 22 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  link: { color: Colors.sky, fontFamily: font(700), fontSize: 15 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rating: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 42 },
  photo: { width: 104, height: 104, borderRadius: 12, backgroundColor: Colors.backgroundSelected },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: Colors.backgroundSelected },
  review: { gap: 6, padding: 14, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border },
  reviewName: { flex: 1, color: Colors.text, fontFamily: font(700), fontSize: 15.5 },
  reviewBody: { color: Colors.text, fontFamily: font(500), fontSize: 15, lineHeight: 21 },
  reviewWhen: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12 },
  google: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: Radius.control,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.backgroundElement,
  },
  googleText: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  bodyInput: {
    minHeight: 110, borderRadius: Radius.control, padding: 12, color: Colors.text, fontFamily: font(500), fontSize: 16,
    backgroundColor: Colors.backgroundSelected, textAlignVertical: 'top',
  },
  editThumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: Colors.backgroundSelected },
  thumbX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' },
  addPhoto: {
    width: 76, height: 76, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.border,
  },
  fav: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: Radius.pill,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.backgroundElement,
  },
  favOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  favText: { color: Colors.text, fontFamily: font(700), fontSize: 14 },
  kindTag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
  kindText: { color: '#fff', fontFamily: font(700), fontSize: 13 },
}));
