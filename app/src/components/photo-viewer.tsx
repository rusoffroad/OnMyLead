import { Image } from 'expo-image';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';

import { t } from '@/lib/i18n';
/**
 * A rider's picture (or a post photo) full size over a dark backdrop, so you can actually see it.
 * Tap anywhere, the close button, Escape on a keyboard, or Android's Back closes it. The picture
 * fills the shorter side of the screen in portrait or landscape, phone or tablet, up to 640 points
 * (profile pictures are 512 px; post photos are up to 1280 px).
 */
export function PhotoViewer({
  uri, name, caption, square = true, onClose,
}: { uri: string | null; name?: string | null; caption?: string | null; square?: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const side = Math.min(640, width - Spacing.four * 2, height - insets.top - insets.bottom - 160);
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Close picture')}>
        <View style={[styles.close, { top: insets.top + Spacing.three }]}>
          <Icon name="close" size={22} color="#fff" />
        </View>
        {uri ? (
          <Image
            source={{ uri }}
            contentFit={square ? 'cover' : 'contain'}
            transition={150}
            accessibilityIgnoresInvertColors
            accessibilityLabel={name ? `${name}’s picture` : 'Picture'}
            style={[{ width: side, height: side }, square ? { borderRadius: side / 2 } : { borderRadius: 18 }]}
          />
        ) : null}
        {name ? <Text style={styles.name}>{name}</Text> : null}
        {caption ? <Text style={styles.caption} numberOfLines={3}>{caption}</Text> : null}
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.94)', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  close: {
    position: 'absolute', right: Spacing.three, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  name: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 30, lineHeight: 34, textAlign: 'center' },
  caption: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 520 },
}));
