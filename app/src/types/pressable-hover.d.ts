// react-native-web passes `hovered` to Pressable style and children callbacks. The dashboard is
// web-only and uses it for hover states; on iOS it is simply undefined.
import 'react-native';

declare module 'react-native' {
  interface PressableStateCallbackType {
    hovered?: boolean;
  }
}
