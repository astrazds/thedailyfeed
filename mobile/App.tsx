import React, { useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  useWindowDimensions,
  useColorScheme,
  Platform,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFeedLoadActivity } from "../lib/feed-load-activity";
import { normalizeTimeZone } from "../lib/date-utils";
import { DEFAULT_CONFIG } from "./src/contracts";
import type { ReaderConfig, ReaderPalette } from "./src/contracts";
import { CONFIG_KEY } from "./src/snapshot";
import { useReader } from "./src/useReader";
import { ArticleCard } from "./src/ArticleCard";
const light: ReaderPalette = {
  background: "#f7f5ef",
  paper: "#fffdf8",
  ink: "#282d25",
  muted: "#74796d",
  line: "#dedfd4",
  accent: "#45623d",
};
const dark: ReaderPalette = {
  background: "#1d221c",
  paper: "#252b24",
  ink: "#ebeadd",
  muted: "#a4ad9a",
  line: "#40483c",
  accent: "#c1d4a7",
};
const serif = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});
function parseConfig(value: unknown): ReaderConfig | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("apiOrigin" in value) ||
    typeof value.apiOrigin !== "string" ||
    !("feeds" in value) ||
    !Array.isArray(value.feeds) ||
    value.feeds.length > 50 ||
    !("timeZone" in value) ||
    typeof value.timeZone !== "string"
  )
    return null;
  try {
    const origin = new URL(value.apiOrigin);
    if (
      !["https:", "http:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash
    )
      return null;
    const feeds = value.feeds.flatMap((feed: unknown) => {
      if (
        typeof feed !== "object" ||
        feed === null ||
        !("url" in feed) ||
        typeof feed.url !== "string" ||
        !("name" in feed) ||
        typeof feed.name !== "string"
      )
        return [];
      const url = new URL(feed.url);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return [];
      return [{ url: url.href, name: feed.name }];
    });
    if (feeds.length !== value.feeds.length) return null;
    return {
      apiOrigin: origin.href.replace(/\/$/, ""),
      feeds,
      timeZone: normalizeTimeZone(value.timeZone),
    };
  } catch {
    return null;
  }
}
function Reader({
  config,
  onConfig,
}: {
  config: ReaderConfig;
  onConfig: (config: ReaderConfig) => void;
}) {
  const { width } = useWindowDimensions();
  const scheme = useColorScheme();
  const [theme, setTheme] = useState<"light" | "dark">(
    scheme === "dark" ? "dark" : "light",
  );
  const palette = theme === "dark" ? dark : light;
  const { model, refresh, storageNotice } = useReader(config);
  const activity = getFeedLoadActivity(model);
  const [settings, setSettings] = useState(false);
  const [origin, setOrigin] = useState(config.apiOrigin);
  const [urls, setUrls] = useState(
    config.feeds.map((feed) => feed.url).join("\n"),
  );
  const [zone, setZone] = useState(config.timeZone);
  const [formError, setFormError] = useState("");
  const contentWidth = Math.min(width - 44, 700);
  const save = async () => {
    const next = parseConfig({
      apiOrigin: origin.trim(),
      timeZone: zone.trim(),
      feeds: urls
        .split(/\n/)
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => ({
          url,
          name: config.feeds.find((feed) => feed.url === url)?.name ?? url,
        })),
    });
    if (!next) {
      setFormError(
        "Enter an HTTP or HTTPS server address and valid feed URLs.",
      );
      return;
    }
    try {
      await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      setFormError("");
      onConfig(next);
      setSettings(false);
    } catch {
      onConfig(next);
      setFormError(
        "These settings could not be saved. They apply for this visit.",
      );
    }
  };
  const button = (label: string, action: () => void, id: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={id}
      onPress={action}
      style={({ pressed }) => [
        styles.button,
        { borderColor: palette.line, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={{ color: palette.ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.shell}>
          <View style={[styles.masthead, { borderColor: palette.line }]}>
            <Text style={[styles.brand, { color: palette.ink }]}>
              The Daily Feed<Text style={{ color: palette.accent }}>.</Text>
            </Text>
            <View style={styles.actions}>
              {button(
                theme === "dark" ? "Light" : "Dark",
                () => setTheme(theme === "dark" ? "light" : "dark"),
                "theme",
              )}
              {button(
                "Sources",
                () => {
                  setOrigin(config.apiOrigin);
                  setUrls(config.feeds.map((feed) => feed.url).join("\n"));
                  setZone(config.timeZone);
                  setSettings(!settings);
                },
                "connection-settings",
              )}
            </View>
          </View>
          <View style={styles.intro}>
            <Text style={[styles.eyebrow, { color: palette.muted }]}>
              {new Date()
                .toLocaleDateString("en", {
                  timeZone: config.timeZone,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
                .toUpperCase()}
            </Text>
            <Text
              accessibilityRole="header"
              style={[styles.today, { color: palette.ink }]}
            >
              Today
            </Text>
            <Text style={[styles.subtitle, { color: palette.muted }]}>
              A little less noise. A little more perspective.
            </Text>
          </View>
          {settings && (
            <View
              style={[
                styles.settings,
                { backgroundColor: palette.paper, borderColor: palette.line },
              ]}
            >
              <Text
                accessibilityRole="header"
                style={[styles.settingsTitle, { color: palette.ink }]}
              >
                Your sources
              </Text>
              <Text style={[styles.helper, { color: palette.muted }]}>
                Use the demo server, or connect your self-hosted Daily Feed
                server.
              </Text>
              <Text style={{ color: palette.ink }}>Server address</Text>
              <TextInput
                accessibilityLabel="Server address"
                testID="api-origin"
                value={origin}
                onChangeText={setOrigin}
                autoCapitalize="none"
                style={[
                  styles.input,
                  { color: palette.ink, borderColor: palette.line },
                ]}
              />
              <Text style={{ color: palette.ink }}>
                Feed URLs, one per line
              </Text>
              <TextInput
                accessibilityLabel="Feed URLs"
                testID="feed-urls"
                multiline
                value={urls}
                onChangeText={setUrls}
                autoCapitalize="none"
                style={[
                  styles.input,
                  {
                    color: palette.ink,
                    borderColor: palette.line,
                    minHeight: 90,
                  },
                ]}
              />
              <Text style={{ color: palette.ink }}>Timezone</Text>
              <TextInput
                accessibilityLabel="Timezone"
                value={zone}
                onChangeText={setZone}
                style={[
                  styles.input,
                  { color: palette.ink, borderColor: palette.line },
                ]}
              />
              {!!formError && (
                <Text accessibilityRole="alert" style={{ color: palette.ink }}>
                  {formError}
                </Text>
              )}
              {button(
                "Save sources",
                () => {
                  void save();
                },
                "save-settings",
              )}
            </View>
          )}
          <View style={[styles.activity, { borderColor: palette.line }]}>
            <View style={{ flex: 1 }}>
              <Text
                testID="status"
                accessibilityLiveRegion="polite"
                style={{ color: palette.ink, fontSize: 13 }}
              >
                {activity.title}
              </Text>
              <Text
                style={{ color: palette.muted, fontSize: 12, marginTop: 5 }}
              >
                {activity.detail}
              </Text>
            </View>
            {button(
              model.loading ? "Refresh again" : "Refresh",
              () => {
                void refresh();
              },
              "refresh",
            )}
          </View>
          {model.loading && (
            <View style={[styles.progress, { backgroundColor: palette.line }]}>
              <View
                style={{
                  height: 2,
                  backgroundColor: palette.accent,
                  width: `${Math.max(5, (model.completedFeeds / Math.max(1, model.totalFeeds)) * 100)}%`,
                }}
              />
            </View>
          )}
          {storageNotice && (
            <Text style={[styles.notice, { color: palette.muted }]}>
              Reading is available. Saving for offline use is unavailable.
            </Text>
          )}
          {model.items.map((item) => (
            <ArticleCard
              key={`${item.link}|${item.pubDate.toISOString()}|${item.source}`}
              item={item}
              palette={palette}
              contentWidth={contentWidth}
              timeZone={config.timeZone}
            />
          ))}
          {!model.loading && !model.items.length && (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: palette.ink }]}>
                {activity.type === "failed"
                  ? "Your reading can wait a moment."
                  : "A quiet day so far."}
              </Text>
              <Text
                style={{
                  color: palette.muted,
                  textAlign: "center",
                  lineHeight: 23,
                }}
              >
                {activity.type === "failed"
                  ? "Check your connection and refresh to try again."
                  : "New articles from your sources will appear here."}
              </Text>
            </View>
          )}
          <View style={[styles.footer, { borderColor: palette.line }]}>
            <Text style={{ color: palette.muted, fontSize: 12 }}>
              Just today. Just your sources.
            </Text>
            <Text style={{ color: palette.muted, fontSize: 11, marginTop: 7 }}>
              The Daily Feed
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
export default function App() {
  const [config, setConfig] = useState<ReaderConfig | null>(null);
  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(CONFIG_KEY)
      .then((raw) => {
        let saved: ReaderConfig | null = null;
        try {
          if (raw) saved = parseConfig(JSON.parse(raw));
        } catch {}
        if (live)
          setConfig(
            saved ?? {
              ...DEFAULT_CONFIG,
              timeZone: normalizeTimeZone(
                Intl.DateTimeFormat().resolvedOptions().timeZone,
              ),
            },
          );
      })
      .catch(() => {
        if (live)
          setConfig({
            ...DEFAULT_CONFIG,
            timeZone: normalizeTimeZone(
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            ),
          });
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <SafeAreaProvider>
      {config ? (
        <Reader config={config} onConfig={setConfig} />
      ) : (
        <View style={{ flex: 1, backgroundColor: light.background }} />
      )}
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  page: { alignItems: "center", paddingHorizontal: 22, minHeight: "100%" },
  shell: { maxWidth: 700, width: "100%" },
  masthead: {
    paddingVertical: 25,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: {
    fontFamily: serif,
    fontSize: 23,
    fontWeight: "700",
    letterSpacing: -0.9,
  },
  actions: { flexDirection: "row", gap: 7 },
  button: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 6,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  intro: { paddingTop: 44, paddingBottom: 35 },
  eyebrow: { fontSize: 10, letterSpacing: 1.8, fontWeight: "600" },
  today: {
    fontFamily: serif,
    fontSize: 64,
    letterSpacing: -2.5,
    lineHeight: 78,
    marginTop: 10,
  },
  subtitle: { fontFamily: serif, fontSize: 17, lineHeight: 25 },
  activity: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  progress: { height: 2 },
  settings: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,
    gap: 12,
    marginBottom: 25,
  },
  settingsTitle: { fontFamily: serif, fontSize: 27 },
  helper: { fontSize: 13, lineHeight: 21 },
  input: { borderWidth: 1, borderRadius: 4, padding: 10, minHeight: 44 },
  notice: { fontSize: 12, marginTop: 15 },
  empty: { paddingVertical: 70, alignItems: "center", gap: 14 },
  emptyTitle: { fontFamily: serif, fontSize: 24, textAlign: "center" },
  footer: {
    marginTop: 24,
    borderTopWidth: 1,
    paddingVertical: 30,
    alignItems: "center",
  },
});
