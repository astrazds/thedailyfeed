import type { ReactNode, Ref } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import type { ReaderPalette } from '../contracts';
import { readerFaces } from '../reader-theme';

export function focusLater(target: () => unknown) {
  requestAnimationFrame(() => (target() as { focus?: () => void } | null)?.focus?.());
}

export function Action({ children, onPress, palette, disabled = false, kind = 'neutral', label, buttonRef, small = true, style }: {
  children: ReactNode;
  onPress: () => void;
  palette: ReaderPalette;
  disabled?: boolean;
  kind?: 'neutral' | 'primary' | 'danger' | 'delete';
  label?: string;
  buttonRef?: Ref<View>;
  small?: boolean;
  style?: ViewStyle;
}) {
  const dark = palette.background === '#1a1816';
  return <Pressable ref={buttonRef} role="button" accessibilityLabel={label} disabled={disabled}
    accessibilityState={{ disabled }} onPress={onPress}
    style={({ pressed }) => [{
      alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: small ? 12 : 24, paddingVertical: 8,
      borderWidth: kind === 'neutral' || kind === 'danger' ? 1 : 0, borderColor: palette.controlBorder,
      backgroundColor: kind === 'primary' ? palette.accentSolid : kind === 'delete' ? dark ? '#d97878' : '#b34f4f' : palette.codeBackground,
      opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
    }, style]}>
    <Text style={{ fontFamily: readerFaces.medium, fontSize: small ? 14 : 16, lineHeight: small ? 20 : 25.6,
      color: kind === 'primary' ? palette.accentForeground : kind === 'delete' ? dark ? '#1a1816' : '#fffaf7' : kind === 'danger' ? palette.error : palette.foreground,
    }}>{children}</Text>
  </Pressable>;
}
