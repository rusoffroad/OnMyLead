import { Alert, Platform } from 'react-native';

/** Yes/no confirmation that works on phones and on the web. */
export function confirmAsync(title: string, message: string, confirmLabel = 'Delete', dismissLabel = 'Cancel'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: dismissLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** A message with an OK button, shown over whatever is on screen. */
export function showNotice(title: string, message: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
