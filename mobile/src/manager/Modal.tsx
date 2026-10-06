import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';
import type { ReaderPalette } from '../contracts';

export function ManagerModal({ isOpen, onClose, palette, children }: {
  isOpen: boolean;
  onClose: () => void;
  palette: ReaderPalette;
  children: ReactNode;
}) {
  return <Modal visible={isOpen} onRequestClose={onClose} animationType="slide">
    <View style={{ flex: 1, backgroundColor: palette.background }}>{children}</View>
  </Modal>;
}
