import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  type TextStyle,
  useWindowDimensions,
  useColorScheme,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import Svg, { Circle, Path } from "react-native-svg";
import {
  getFeedLoadActivity,
  feedActivityAnnouncement,
} from "../lib/feed-load-activity";
import { normalizeTimeZone } from "../lib/date-utils";
import type { ReaderConfig } from "./src/contracts";
import { readerFaces, readerFonts, readerThemes } from "./src/reader-theme";
import { useReader } from "./src/useReader";
import { ArticleCard } from "./src/ArticleCard";
import { useSubscriptions } from "./src/useSubscriptions";
import { FeedManager } from "./src/FeedManager";
import { BrowserStatus } from "./src/BrowserStatus";
import { ErrorBoundary, RecoveryScreen } from "./src/ErrorBoundary";
import { registerWorker } from "./src/register-worker";
import { LoadingMotion } from "./src/LoadingMotion";

function Reader() {
  const { width } = useWindowDimensions();
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? "dark" : "light";
  const palette = readerThemes[theme];
  const subscriptions = useSubscriptions();
  const [timeZone] = useState(() => normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));
  const config: ReaderConfig = useMemo(() => ({
    feeds: subscriptions.feeds.filter(feed => feed.enabled),
    configuredFeedCount: subscriptions.feeds.length,
    timeZone,
  }), [subscriptions.feeds, timeZone]);
  const { model, refresh, storageNotice } = useReader(config, subscriptions.ready);
  const activity = getFeedLoadActivity(model);
  const [settings, setSettings] = useState(false);
  const refreshButton = useRef<View>(null);
  const [contentWidth, setContentWidth] = useState(Math.min(width - 48, 585));
  const openSettings = () => setSettings(true);
  const button = (
    label: string,
    action: () => void,
    id: string,
    neutral = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={id}
      onPress={action}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: neutral
            ? palette.codeBackground
            : palette.accentSolid,
          opacity: pressed ? 0.6 : 1,
        },
        neutral && {
          borderColor: palette.controlBorder,
          borderWidth: 1,
          minHeight: 44,
          paddingHorizontal: 16,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: neutral ? palette.foreground : palette.accentForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  const emptyError =
    activity.type === "failed" ||
    activity.type === "partial" ||
    activity.type === "interrupted";
  const emptyTitle = emptyError
    ? activity.type === "failed"
      ? activity.title
      : "No articles loaded"
    : config.feeds.length
      ? "No new items today"
      : config.configuredFeedCount ? "No feeds enabled" : "No feeds yet";
  const emptyDescription = emptyError
    ? activity.type === "failed"
      ? model.error
      : "Try again to load articles from your sources."
    : config.feeds.length
      ? "Your enabled feeds have no items dated today. Manage feeds to review your sources."
      : config.configuredFeedCount
        ? "Enable at least one feed to load today’s items."
        : "Add an RSS or Atom feed to start building today’s reading list.";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <Text
        testID="status"
        role="status"
        accessibilityLabel="Feed activity"
        accessibilityLiveRegion={settings ? "none" : "polite"}
        style={styles.announcement}
      >
        {feedActivityAnnouncement(activity)}
      </Text>
      <ScrollView
        role="main"
        aria-busy={model.loading}
        style={{ transform: "none" }}
        contentContainerStyle={styles.page}
      >
        <View
          style={styles.shell}
          onLayout={({ nativeEvent }) =>
            setContentWidth(Math.min(nativeEvent.layout.width - 48, 585))
          }
        >
          <View
            testID="feed-header"
            role="banner"
            style={[styles.header, { borderColor: palette.border }]}
          >
            <Text
              accessibilityRole="header"
              aria-level={1}
              style={[
                styles.brand,
                { lineHeight: "1.3" } as unknown as TextStyle,
                { color: palette.foreground },
              ]}
            >
              The Daily Feed
            </Text>
            <View style={styles.meta}>
              <Text
                style={[
                  styles.date,
                  {
                    color: palette.muted,
                    fontSize: width <= 480 ? 12 : 14,
                    lineHeight: width <= 480 ? 19.2 : 22.4,
                  },
                ]}
              >
                {new Date().toLocaleDateString("en-US", {
                  timeZone: config.timeZone,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                · {model.items.length}{" "}
                {model.items.length === 1 ? "item" : "items"}
              </Text>
              <View style={styles.headerActions}>
                {!model.loading && model.isCached && !model.refreshNotice && (
                  <Text
                    style={[
                      styles.cached,
                      {
                        color: palette.subtle,
                        backgroundColor: palette.codeBackground,
                      },
                    ]}
                  >
                    Cached
                  </Text>
                )}
                <Pressable
                  testID="refresh"
                  ref={refreshButton}
                  disabled={model.loading || !config.feeds.length}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh feeds"
                  onPress={async () => {
                    await refresh();
                    requestAnimationFrame(() => {
                      if (typeof document !== "undefined" && document.activeElement === document.body) {
                        refreshButton.current?.focus();
                      }
                    });
                  }}
                  style={[
                    styles.refresh,
                    {
                      opacity:
                        model.loading || activity.type === "empty" ? 0.55 : 1,
                    },
                  ]}
                >
                  <LoadingMotion kind="rotate" active={model.loading}>
                    <Svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={palette.foreground}
                      strokeWidth={1.8}
                    >
                      <Path d="M20 7v5h-5M4 17v-5h5" />
                      <Path d="M5.1 8a8 8 0 0 1 13.2-2L20 8M4 16l1.7 2A8 8 0 0 0 18.9 16" />
                    </Svg>
                  </LoadingMotion>
                </Pressable>
              </View>
            </View>
            {(activity.type === "loading" ||
              activity.type === "partial" ||
              activity.type === "interrupted") && (
              <View testID="feed-activity" style={styles.activity}>
                <Text
                  style={[
                    styles.activityText,
                    {
                      color:
                        activity.type === "loading"
                          ? palette.muted
                          : palette.error,
                    },
                  ]}
                >
                  {activity.title}
                </Text>
                <Text
                  style={[
                    styles.activityText,
                    {
                      color:
                        activity.type === "loading"
                          ? palette.muted
                          : palette.error,
                    },
                  ]}
                >
                  {activity.type === "loading" && (
                    <Text style={{ marginRight: 8 }}>·</Text>
                  )}
                  {activity.detail}
                </Text>
              </View>
            )}
            {model.loading && (
              <View
                accessibilityRole="progressbar"
                accessibilityLabel="Feed loading progress"
                accessibilityValue={{ min: 0, max: model.totalFeeds, now: model.completedFeeds }}
                aria-valuemin={0}
                aria-valuemax={model.totalFeeds}
                aria-valuenow={model.completedFeeds}
                style={[styles.progress, { backgroundColor: palette.border }]}
              >
                <View
                  style={{
                    height: 2,
                    backgroundColor: palette.accent,
                    width: `${(model.completedFeeds / Math.max(1, model.totalFeeds)) * 100}%`,
                  }}
                />
              </View>
            )}
          </View>
          {storageNotice && (
            <Text style={[styles.notice, { color: palette.muted }]}>
              Reading is available. Saving for offline use is unavailable.
            </Text>
          )}
          {activity.type === "fallback" && (
            <View style={styles.fallback}>
              <Text style={[styles.notice, { color: palette.muted }]}>
                {model.items.length ? "Unable to refresh. Showing saved items from today." : "Unable to refresh. Try again to check your feeds."}
              </Text>
              {button(
                "Try again",
                () => {
                  void refresh();
                },
                "retry-snapshot",
                true,
              )}
            </View>
          )}
          {model.loading &&
            [0, 1, 2].map((index) => (
              <View
                key={index}
                testID="feed-skeleton-item"
                aria-hidden={true}
                style={[styles.skeleton, { borderBottomColor: palette.border }]}
              >
                <LoadingMotion kind="pulse" active={model.loading}>
                  <View
                    style={{
                      width: "75%",
                      height: 20,
                      marginBottom: 24,
                      borderRadius: 3,
                      backgroundColor: palette.codeBackground,
                    }}
                  />
                  <View style={{ gap: 13, marginBottom: 24 }}>
                    {["100%", "94%", "68%"].map((lineWidth) => (
                      <View
                        key={lineWidth}
                        style={{
                          width: lineWidth as `${number}%`,
                          height: 16,
                          borderRadius: 3,
                          backgroundColor: palette.codeBackground,
                        }}
                      />
                    ))}
                  </View>
                  <View
                    style={{
                      width: "28%",
                      height: 14,
                      borderRadius: 3,
                      backgroundColor: palette.codeBackground,
                    }}
                  />
                </LoadingMotion>
              </View>
            ))}
          {model.items.map((item) => (
            <ArticleCard
              key={`${item.link}|${item.pubDate.toISOString()}|${item.source}`}
              item={item}
              palette={palette}
              contentWidth={contentWidth}
              timeZone={config.timeZone}
            />
          ))}
          {!model.loading &&
            !model.items.length &&
            activity.type !== "fallback" && (
              <View style={styles.empty}>
                <Text
                  accessibilityRole="header"
                  style={[styles.emptyTitle, { color: palette.foreground }]}
                >
                  {emptyTitle}
                </Text>
                <Text
                  style={[
                    styles.emptyDescription,
                    { textWrap: "pretty" } as TextStyle,
                    { color: palette.muted },
                  ]}
                >
                  {emptyDescription}
                </Text>
                {button(
                  emptyError ? "Try again" : "Manage feeds",
                  emptyError
                    ? () => {
                        void refresh();
                      }
                    : openSettings,
                  "empty-action",
                )}
              </View>
            )}
        </View>
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage feeds"
        accessibilityState={{ expanded: settings }}
        aria-expanded={settings}
        aria-controls="feed-manager-dialog"
        testID="connection-settings"
        onPress={openSettings}
        style={[
          styles.manager,
          { transform: "translateZ(0)" },
          {
            backgroundColor: palette.codeBackground,
            borderColor: palette.controlBorder,
          },
        ]}
      >
        <Svg
          width={24}
          height={24}
          viewBox="0 0 24 24"
          fill="none"
          stroke={palette.foreground}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Circle cx={12} cy={12} r={3} />
          <Path d="M12 1v6m0 6v6m-6-6h6m6 0h-6" />
          <Path d="M19.07 4.93l-4.24 4.24m0 5.66l4.24 4.24M4.93 4.93l4.24 4.24m0 5.66l-4.24 4.24" />
        </Svg>
      </Pressable>
      {subscriptions.ready && <FeedManager
        feeds={subscriptions.feeds}
        apply={subscriptions.apply}
        isOpen={settings}
        onClose={() => setSettings(false)}
        palette={palette}
        activity={activity}
        feedStatuses={model.feedStatuses}
        onRefreshFeeds={refresh}
      />}
      <BrowserStatus palette={palette} />
    </SafeAreaView>
  );
}
function Application() {
  const [fontsLoaded, fontError] = useFonts(readerFonts);
  useEffect(() => { registerWorker(); }, []);
  const scheme = useColorScheme();
  const palette = readerThemes[scheme === "dark" ? "dark" : "light"];
  return (
    <SafeAreaProvider>
      {fontError ? (
        <RecoveryScreen message="The reader font could not load. Reload to try again." />
      ) : fontsLoaded ? (
        <Reader />
      ) : (
        <View style={{ flex: 1, backgroundColor: palette.background }} />
      )}
    </SafeAreaProvider>
  );
}
export default function App() {
  return <ErrorBoundary><Application /></ErrorBoundary>;
}
const styles = StyleSheet.create({
  announcement: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  page: { alignItems: "center", minHeight: "100%" },
  shell: {
    maxWidth: 720,
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  header: { paddingBottom: 16, borderBottomWidth: 1, marginBottom: 32 },
  brand: {
    fontFamily: readerFaces.bold,
    fontSize: 24,
    lineHeight: 31.2,
    marginBottom: 8,
    maxWidth: 520,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  date: {
    fontFamily: readerFaces.regular,
    flex: 1,
    maxWidth: 520,
    minWidth: 0,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  cached: {
    fontFamily: readerFaces.regular,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  refresh: {
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  activity: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
    rowGap: 2,
  },
  activityText: {
    fontFamily: readerFaces.regular,
    fontSize: 12,
    lineHeight: 16.8,
  },
  progress: {
    position: "absolute",
    bottom: -1,
    left: 0,
    width: "100%",
    height: 2,
  },
  manager: {
    position: "absolute",
    top: 24,
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 4,
    alignSelf: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: readerFaces.medium,
    fontSize: 16,
    lineHeight: 25.6,
  },
  notice: { fontFamily: readerFaces.regular, fontSize: 13, lineHeight: 19.5 },
  fallback: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
    alignItems: "center",
  },
  empty: { paddingVertical: 48 },
  emptyTitle: {
    fontFamily: readerFaces.semibold,
    fontSize: 20,
    lineHeight: 26,
    maxWidth: 440,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDescription: {
    fontFamily: readerFaces.regular,
    fontSize: 16,
    lineHeight: 25.6,
    maxWidth: 585,
    marginBottom: 24,
    textAlign: "center",
  },
  skeleton: { marginBottom: 48, paddingBottom: 48, borderBottomWidth: 1 },
});
