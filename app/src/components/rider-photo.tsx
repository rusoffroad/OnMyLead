import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAvatar } from '@/lib/avatars';
import { PhotoViewer } from './photo-viewer';

/**
 * A rider's profile picture as a circle of `size`, or `fallback` (their initial dot, or their
 * opted-in social photo) when they have none, it isn't visible to this rider, or it won't load.
 * `ring` draws a border in `ringColor` around it, matching RiderDot's ring.
 *
 * Tapping a picture opens it full size (PhotoViewer), on every device. `zoom` false turns that off
 * where the picture is part of something else you tap (a map marker, a row that picks a rider).
 */
export function RiderPhoto({
  userId, size, fallback, ring = 0, ringColor = Colors.backgroundElement, zoom = true, name,
}: {
  userId: string | null | undefined;
  size: number;
  fallback: ReactNode;
  ring?: number;
  ringColor?: string;
  zoom?: boolean;
  /** Shown under the big picture. */
  name?: string | null;
}) {
  const uri = useAvatar(userId);
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (!uri || failed === uri) return <>{fallback}</>;
  const outer = size + ring * 2;
  const image = (
    <Image
      source={{ uri }}
      onError={() => setFailed(uri)}
      contentFit="cover"
      transition={120}
      accessibilityIgnoresInvertColors
      style={{
        width: outer, height: outer, borderRadius: outer / 2, borderWidth: ring, borderColor: ringColor,
        backgroundColor: Colors.backgroundSelected,
      }}
    />
  );
  if (!zoom) return image;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={name ? `See ${name}’s picture` : 'See picture'}
        hitSlop={4}
        style={({ pressed }) => pressed && { opacity: 0.8 }}>
        {image}
      </Pressable>
      <PhotoViewer uri={open ? uri : null} name={name} onClose={() => setOpen(false)} />
    </>
  );
}
