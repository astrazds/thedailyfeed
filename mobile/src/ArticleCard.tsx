import React, { useMemo, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import RenderHTML, { defaultSystemFonts } from "@native-html/render";
import type { FeedItem } from "../../lib/types";
import { normalizeSafeArticleLink } from "../../lib/feed-link-policy";
import { normalizeFeedContentUrl } from "../../lib/feed-content-normalization";
import { prepareArticle } from "./article-content";
import type { ReaderPalette } from "./contracts";

export function ArticleCard({
  item,
  palette,
  contentWidth,
  timeZone,
}: {
  item: FeedItem;
  palette: ReaderPalette;
  contentWidth: number;
  timeZone: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = useMemo(() => {
    const plainDescription = (item.description ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return prepareArticle(
      item.contentHtml || `<p>${plainDescription}</p>`,
      item.link,
    );
  }, [item.contentHtml, item.description, item.link]);
  const titleLink = normalizeFeedContentUrl(
    normalizeSafeArticleLink(item.link),
    null,
    "link",
  );
  const serif = Platform.select({
    ios: "Georgia",
    android: "serif",
    default: "Georgia",
  })!;
  const systemFonts = useMemo(
    () => [...defaultSystemFonts, serif, "monospace"],
    [serif],
  );
  const defaultTextProps = useMemo(() => ({ selectable: true }), []);
  const htmlSource = useMemo(
    () => ({ html: expanded ? content.full : content.preview }),
    [expanded, content],
  );
  const styles = useMemo(
    () => ({
      baseStyle: {
        color: palette.ink,
        fontFamily: serif,
        fontSize: 17,
        lineHeight: 28,
      },
      tagsStyles: {
        a: { color: palette.accent, textDecorationLine: "underline" as const },
        p: { marginTop: 0, marginBottom: 14 },
        h3: { fontSize: 21, lineHeight: 28, marginTop: 16, marginBottom: 10 },
        h4: { fontSize: 19, lineHeight: 26 },
        h5: { fontSize: 18, lineHeight: 26 },
        blockquote: {
          borderLeftWidth: 2,
          borderLeftColor: palette.line,
          paddingLeft: 16,
          marginLeft: 0,
        },
        code: {
          fontFamily: "monospace",
          fontSize: 14,
          backgroundColor: palette.background,
        },
        pre: { backgroundColor: palette.background, padding: 12 },
        img: { marginVertical: 12 },
      },
    }),
    [palette, serif],
  );
  const linkProps = useMemo(
    () => ({
      a: {
        onPress: (_event: unknown, href: string) => {
          const safe = normalizeFeedContentUrl(href, item.link, "link");
          if (safe) void Linking.openURL(safe).catch(() => {});
        },
      },
    }),
    [item.link],
  );
  return (
    <View
      testID="article-card"
      style={{
        backgroundColor: palette.paper,
        borderBottomWidth: 1,
        borderBottomColor: palette.line,
        paddingVertical: 26,
      }}
    >
      <Text
        style={{
          color: palette.muted,
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {item.source} ·{" "}
        {item.pubDate.toLocaleDateString([], {
          timeZone,
          month: "short",
          day: "numeric",
        })}{" "}
        ·{" "}
        {item.pubDate.toLocaleTimeString([], {
          timeZone,
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
      <Pressable
        disabled={!titleLink}
        accessibilityRole={titleLink ? "link" : undefined}
        accessibilityLabel={item.title}
        onPress={() => {
          if (titleLink) void Linking.openURL(titleLink).catch(() => {});
        }}
      >
        <Text
          testID="article-title"
          accessibilityRole="header"
          style={{
            color: palette.ink,
            fontFamily: serif,
            fontWeight: "700",
            fontSize: 27,
            lineHeight: 34,
            marginBottom: 18,
          }}
        >
          {item.title}
        </Text>
      </Pressable>
      <RenderHTML
        contentWidth={contentWidth}
        source={htmlSource}
        {...styles}
        systemFonts={systemFonts}
        renderersProps={linkProps}
        defaultTextProps={defaultTextProps}
        enableCSSInlineProcessing={false}
      />
      {content.truncated && (
        <Pressable
          testID="article-toggle"
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Show less" : "Continue reading"} ${item.title}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={{
            alignSelf: "flex-start",
            paddingVertical: 10,
            paddingRight: 16,
          }}
        >
          <Text
            style={{ color: palette.accent, fontSize: 14, fontWeight: "600" }}
          >
            {expanded ? "Show less" : "Continue reading"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
