import { Component, type ReactNode } from "react";
import { Platform, Pressable, Text, View, useColorScheme } from "react-native";
import { readerThemes } from "./reader-theme";

export function RecoveryScreen({ message, retry }: { message?: string; retry?: () => void }) {
  const scheme = useColorScheme();
  const palette = readerThemes[scheme === "dark" ? "dark" : "light"];
  return <View role="main" style={{ flex: 1, minHeight: "100%", alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: palette.background }}>
    <Text accessibilityRole="header" aria-level={1} style={{ color: palette.foreground, fontSize: 24, marginBottom: 16 }}>Unable to load The Daily Feed</Text>
    <Text role="alert" style={{ color: palette.muted, fontSize: 16, marginBottom: 24 }}>{message ?? "Reload the page to continue. If the problem continues, try again later."}</Text>
    <Pressable accessibilityRole="button" onPress={() => {
      if (Platform.OS === "web") window.location.reload();
      else retry?.();
    }} style={{ backgroundColor: palette.accentSolid, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 4 }}>
      <Text style={{ color: palette.accentForeground }}>Reload page</Text>
    </Pressable>
  </View>;
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <RecoveryScreen retry={() => this.setState({ failed: false })} /> : this.props.children;
  }
}
