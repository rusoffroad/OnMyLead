import { Modal, type ModalProps } from 'react-native';

import { useSheetUp, useUrgentWaiting } from '@/lib/urgent-modal';

/**
 * React Native's Modal for every sheet and pop-up in the app, so an urgent screen (the Crash Alert
 * countdown) can always show and nothing covers it: while one is up, the sheet hides (it isn't
 * closed, so it comes back as it was, with anything typed), and on iPhone and iPad the urgent
 * screen shows once the sheet has finished hiding (lib/urgent-modal).
 */
export function SheetModal({ visible = true, onDismiss, ...rest }: ModalProps) {
  const urgent = useUrgentWaiting();
  const shown = visible && !urgent;
  const sheetDismissed = useSheetUp(shown);
  return (
    <Modal
      {...rest}
      visible={shown}
      onDismiss={() => {
        sheetDismissed();
        onDismiss?.();
      }}
    />
  );
}
