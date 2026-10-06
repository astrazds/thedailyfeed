import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ReaderPalette } from "./contracts";
import { readerFaces } from "./reader-theme";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const dismissalKey = "pwa-install-dismissed";
const dismissalLifetime = 7 * 24 * 60 * 60 * 1000;

export function BrowserStatus({ palette }: { palette: ReaderPalette }) {
  const [connectivity, setConnectivity] = useState<"offline" | "online" | null>(
    () => navigator.onLine ? null : "offline",
  );
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const dismissed = useRef(false);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const online = () => {
      clearTimeout(timeout);
      setConnectivity("online");
      timeout = setTimeout(() => setConnectivity(null), 3000);
    };
    const offline = () => {
      clearTimeout(timeout);
      setConnectivity("offline");
    };
    const offerInstall = (event: Event) => {
      event.preventDefault();
      if (dismissed.current || window.matchMedia("(display-mode: standalone)").matches) return;
      try {
        const timestamp = Number(localStorage.getItem(dismissalKey));
        if (timestamp > 0 && Date.now() - timestamp < dismissalLifetime) return;
      } catch {}
      setInstall(event as InstallEvent);
    };
    const installed = () => setInstall(null);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeinstallprompt", offerInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeinstallprompt", offerInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  const dismiss = () => {
    dismissed.current = true;
    setInstall(null);
    try { localStorage.setItem(dismissalKey, String(Date.now())); } catch {}
  };
  const requestInstall = async () => {
    if (!install || installing) return;
    setInstalling(true);
    try {
      await install.prompt();
      await install.userChoice;
    } catch {
    } finally {
      setInstalling(false);
      setInstall(null);
    }
  };
  return <>
    {connectivity && <View role="status" accessibilityLiveRegion="polite" style={[
      styles.connectivity, { backgroundColor: palette.codeBackground, borderColor: palette.controlBorder },
    ]}>
      <Text style={[styles.copy, { color: palette.foreground }]}>
        {connectivity === "online" ? "Back online" : "You are offline. New feed updates are unavailable."}
      </Text>
    </View>}
    {install && <View role="complementary" accessibilityLabel="Install The Daily Feed" style={[
      styles.install, { backgroundColor: palette.background, borderColor: palette.controlBorder },
    ]}>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.foreground }]}>Install The Daily Feed</Text>
      <Text style={[styles.copy, { color: palette.muted }]}>Install this app for quick home-screen access.</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={installing} onPress={() => { void requestInstall(); }} style={[styles.action, { backgroundColor: palette.accentSolid }]}>
          <Text style={[styles.copy, { color: palette.accentForeground }]}>{installing ? "Installing…" : "Install"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={dismiss} style={[styles.action, { borderWidth: 1, borderColor: palette.controlBorder }]}>
          <Text style={[styles.copy, { color: palette.foreground }]}>Not now</Text>
        </Pressable>
      </View>
    </View>}
  </>;
}
const styles = StyleSheet.create({
  connectivity: { position: "absolute", bottom: 24, alignSelf: "center", maxWidth: "90%", paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, borderRadius: 24, zIndex: 10 },
  install: { position: "absolute", bottom: 80, right: 16, width: 360, maxWidth: "92%", padding: 16, borderWidth: 1, borderRadius: 8, gap: 8, zIndex: 10 },
  title: { fontFamily: readerFaces.semibold, fontSize: 16, lineHeight: 24 },
  copy: { fontFamily: readerFaces.regular, fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  action: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 4 },
});
