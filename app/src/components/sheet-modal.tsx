import { useEffect, useRef } from 'react';
import { Modal, type ModalProps } from 'react-native';

import { useSheetUp, useUrgentWaiting } from '@/lib/urgent-modal';

/**
 * React Native's Modal for every sheet and pop-up in the app, so an urgent screen (the Crash Alert
 * countdown) can always show: while one is waiting, an open sheet closes itself (onRequestClose)
 * and hides, and the urgent screen shows once it has finished closing (lib/urgent-modal; iPhone
 * and iPad can't show two at once).
 */
export function SheetModal({ visible = true, onRequestClose, onDismiss, ...rest }: ModalProps) {
  const urgent = useUrgentWaiting();
  const close = useRef(onRequestClose);
  useEffect(() => {
    close.current = onRequestClose;
  }, [onRequestClose]);
  useEffect(() => {
    if (urgent && visible) close.current?.(undefined as never);
  }, [urgent, visible]);
  const shown = visible && !urgent;
  const sheetDismissed = useSheetUp(shown);
  return (
    <Modal
      {...rest}
      visible={shown}
      onRequestClose={onRequestClose}
      onDismiss={() => {
        sheetDismissed();
        onDismiss?.();
      }}
    />
  );
}
