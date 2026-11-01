import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';

import { Colors } from '@/constants/theme';
import { useAvatar } from '@/lib/avatars';

/**
 * A rider's profile picture as a circle of `size`, or `fallback` (their initial dot, or their
 * opted-in social photo) when they have none, it isn't visible to this rider, or it won't load.
 * `ring` draws a border in `ringColor` around it, matching RiderDot's ring.
 */
export function RiderPhoto({
  userId, size, fallback, ring = 0, ringColor = Colors.backgroundElement,
}: {
  userId: string | null | undefined;
  size: number;
  fallback: ReactNode;
  ring?: number;
  ringColor?: string;
}) {
  const uri = useAvatar(userId);
  const [failed, setFailed] = useState<string | null>(null);
  if (!uri || failed === uri) return <>{fallback}</>;
  const outer = size + ring * 2;
  return (
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
}
