import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { Gradient } from '@/components/home/parts';
import { PhotoViewer } from '@/components/photo-viewer';
import { Colors, font } from '@/constants/theme';
import { groupInitials } from '@/core/group-photo';
import { t } from '@/lib/i18n';

/**
 * A riding group's photo, or its initials on the group blue when it has none (or it won't load).
 *
 * `size` draws a rounded square thumbnail (lists, the Home card); without it the photo fills the
 * width at 16:9 (`banner`, the group page and its invite link). Tapping a banner opens it full
 * size; `zoom` false turns that off where the photo is part of something else you tap.
 */
export function GroupPhoto({
  uri, name, size, radius, zoom = false, style,
}: {
  uri: string | null | undefined;
  name: string;
  /** Thumbnail width and height. Left out: a full-width 16:9 banner. */
  size?: number;
  radius?: number;
  zoom?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const r = radius ?? (size ? Math.round(size * 0.29) : 18);
  const frame: ViewStyle & ImageStyle = size ? { width: size, height: size } : { width: '100%', aspectRatio: 16 / 9, maxHeight: 340 };
  const shown = uri && failed !== uri ? uri : null;

  if (!shown) {
    if (!size) return null;
    return (
      <View style={[frame, { borderRadius: r, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Gradient colors={['#3B86F7', '#1C4F9C']} angle="diagonal" radius={r} />
        <Text style={{ color: '#fff', fontFamily: font(800, 'display'), fontSize: Math.round(size * 0.42) }}>{groupInitials(name)}</Text>
      </View>
    );
  }

  const image = (
    <Image
      source={{ uri: shown }}
      onError={() => setFailed(shown)}
      contentFit="cover"
      transition={120}
      accessibilityIgnoresInvertColors
      accessibilityLabel={zoom ? undefined : t('{name} group photo', { name })}
      style={[frame, { borderRadius: r, backgroundColor: Colors.backgroundSelected }, style as StyleProp<ImageStyle>]}
    />
  );
  if (!zoom) return image;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={t('See the {name} group photo', { name })}
        style={({ pressed }) => [{ alignSelf: 'stretch' }, pressed && { opacity: 0.85 }]}>
        {image}
      </Pressable>
      <PhotoViewer uri={open ? shown : null} name={name} square={false} onClose={() => setOpen(false)} />
    </>
  );
}
