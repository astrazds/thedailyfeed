import React, { useMemo, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import RenderHTML, {
  defaultSystemFonts,
  defaultListStyleSpecs,
  defaultHTMLElementModels,
  HTMLElementModel,
  HTMLContentModel,
  type CustomTextualRenderer,
  type RenderHTMLProps,
  type UnitaryCounterRendererProps,
} from "@native-html/render";
import type { FeedItem } from "../../lib/types";
import { normalizeSafeArticleLink } from "../../lib/feed-link-policy";
import { normalizeFeedContentUrl } from "../../lib/feed-content-normalization";
import { prepareArticle } from "./article-content";
import type { ReaderPalette } from "./contracts";
import { readerFaces } from "./reader-theme";

const headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const headingModels = Object.fromEntries(
  headingTags.map((tag) => {
    const model: HTMLElementModel<string, HTMLContentModel> =
      defaultHTMLElementModels[tag];
    return [tag, model.extend({ contentModel: HTMLContentModel.textual })];
  }),
);
const HeadingRenderer: CustomTextualRenderer = ({
  TDefaultRenderer,
  ...props
}) => (
  <TDefaultRenderer
    {...props}
    textProps={{
      ...props.textProps,
      accessibilityRole: "header",
      ...(Platform.OS === "web"
        ? { "aria-level": Number(props.tnode.tagName?.slice(1)) }
        : {}),
      style: [
        props.textProps.style,
        Platform.OS === "web"
          ? ({ lineHeight: "1.3" } as unknown as TextStyle)
          : undefined,
      ],
    }}
  />
);
const headingRenderers = Object.fromEntries(
  headingTags.map((tag) => [tag, HeadingRenderer]),
);
const customListStyleSpecs = {
  disc: {
    ...defaultListStyleSpecs.disc,
    Component: ({
      fontSize,
      lineHeight,
      color,
    }: UnitaryCounterRendererProps) => {
      const diameter = Math.floor(fontSize / 3);
      return (
        <View
          style={{
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            backgroundColor: color,
            marginRight: fontSize / 2,
            top: Math.floor((lineHeight - diameter) / 2),
          }}
        />
      );
    },
  },
};
const systemFonts = [
  ...defaultSystemFonts,
  ...Object.values(readerFaces),
  "monospace",
];
type WebTextStyle = TextStyle & {
  wordSpacing?: number;
  textUnderlineOffset?: number;
  textDecorationThickness?: number;
};
const webProse: WebTextStyle =
  Platform.OS === "web"
    ? { wordSpacing: 0.8, textUnderlineOffset: 3, textDecorationThickness: 1 }
    : {};
const webLink: WebTextStyle =
  Platform.OS === "web"
    ? { textUnderlineOffset: 3, textDecorationThickness: 1 }
    : {};
const domVisitors: RenderHTMLProps["domVisitors"] = {
  onDocument(document) {
    function decorate(
      parent: typeof document | (typeof document.children)[number],
    ) {
      if (!("children" in parent)) return;
      const children = parent.children.filter((child) => child.type === "tag");
      children.forEach((child, index) => {
        if (child.type !== "tag") return;
        const classes: string[] = [];
        const first = index === 0;
        const last = index === children.length - 1;
        const root = parent.type === "root";
        const heading = /^h[1-6]$/.test(child.name);
        if (first && (root || heading)) classes.push("reader-first");
        if (
          "name" in parent &&
          parent.name === "blockquote" &&
          child.name === "p"
        )
          classes.push("reader-quote-paragraph");
        if (last && (root || child.name === "p")) classes.push("reader-last");
        if (child.name === "img" && first) classes.push("reader-first-image");
        if (child.name === "img" && last) classes.push("reader-last-image");
        if ("name" in parent && parent.name === "pre" && child.name === "code")
          classes.push("reader-pre-code");
        if (child.name === "li" && last) classes.push("reader-last-item");
        child.attribs.class = classes.join(" ");
        decorate(child);
      });
    }
    decorate(document);
  },
};

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
  const defaultTextProps = useMemo(
    () => ({
      selectable: true,
      style: item.contentHtml ? webProse : undefined,
    }),
    [item.contentHtml],
  );
  const htmlSource = useMemo(
    () => ({ html: expanded ? content.full : content.preview }),
    [expanded, content],
  );
  const styles = useMemo(
    () => ({
      baseStyle: {
        color: palette.foreground,
        fontFamily: readerFaces.regular,
        fontWeight: "normal" as const,
        fontSize: 16,
        lineHeight: 28.8,
      },
      tagsStyles: {
        a: {
          color: palette.accent,
          textDecorationLine: "underline" as const,
          textDecorationColor: `rgba(${parseInt(palette.accent.slice(1, 3), 16)}, ${parseInt(palette.accent.slice(3, 5), 16)}, ${parseInt(palette.accent.slice(5, 7), 16)}, 0.55)`,
        },
        p: {
          marginTop: 0,
          marginBottom: 24,
          lineHeight: item.contentHtml ? 25.6 : 28.8,
        },
        h1: {
          fontFamily: readerFaces.regular,
          fontWeight: "normal" as const,
          fontSize: 16,
          lineHeight: 20.8,
          marginTop: 24,
          marginBottom: 12,
          maxWidth: 360,
        },
        h2: {
          fontFamily: readerFaces.regular,
          fontWeight: "normal" as const,
          fontSize: 16,
          lineHeight: 20.8,
          marginTop: 24,
          marginBottom: 12,
          maxWidth: 360,
        },
        h3: {
          fontFamily: readerFaces.semibold,
          fontWeight: "normal" as const,
          fontSize: 18,
          lineHeight: 23.4,
          marginTop: 27,
          marginBottom: 13.5,
          maxWidth: 400,
        },
        h4: {
          fontFamily: readerFaces.semibold,
          fontWeight: "normal" as const,
          fontSize: 16,
          lineHeight: 20.8,
          marginTop: 24,
          marginBottom: 12,
          maxWidth: 360,
        },
        h5: {
          fontFamily: readerFaces.medium,
          fontWeight: "normal" as const,
          fontSize: 16,
          lineHeight: 20.8,
          marginTop: 24,
          marginBottom: 12,
          maxWidth: 360,
        },
        strong: {
          fontFamily: readerFaces.semibold,
          fontWeight: "normal" as const,
        },
        b: { fontFamily: readerFaces.semibold, fontWeight: "normal" as const },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: palette.blockquoteBorder,
          paddingLeft: 16,
          marginLeft: 0,
          marginRight: 0,
          marginTop: 24,
          marginBottom: 24,
          fontStyle: "italic" as const,
          color: palette.muted,
        },
        ul: { marginLeft: 24, paddingLeft: 0, marginTop: 24, marginBottom: 24 },
        ol: { marginLeft: 24, paddingLeft: 0, marginTop: 24, marginBottom: 24 },
        li: { marginBottom: 12, lineHeight: 25.6 },
        code: {
          fontFamily: "monospace",
          fontSize: 14.4,
          backgroundColor: palette.codeBackground,
          paddingVertical: 3.2,
          paddingHorizontal: 6.4,
          borderRadius: 3,
        },
        pre: {
          backgroundColor: palette.codeBackground,
          padding: 16,
          borderRadius: 6,
          marginVertical: 24,
        },
        img: { width: "100%", marginVertical: 32, borderRadius: 6 },
      },
      classesStyles: {
        "reader-first": { marginTop: 0 },
        "reader-last": { marginBottom: 0 },
        "reader-quote-paragraph": { marginBottom: 12 },
        "reader-pre-code": { backgroundColor: "transparent", padding: 0 },
        "reader-last-item": { marginBottom: 0 },
        "reader-first-image": { marginTop: 16 },
        "reader-last-image": { marginBottom: 16 },
      },
    }),
    [palette, item.contentHtml],
  );
  const linkProps = useMemo(
    () => ({
      ul: {
        markerTextStyle: { lineHeight: 25.6 },
        markerBoxStyle: { alignSelf: "flex-start" as const },
      },
      ol: {
        markerTextStyle: { lineHeight: 25.6 },
        markerBoxStyle: { alignSelf: "flex-start" as const },
      },
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
        maxWidth: 585,
        width: "100%",
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
        paddingBottom: 48,
        marginBottom: 48,
      }}
    >
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
          aria-level={2}
          style={[
            {
              color: titleLink ? palette.accent : palette.foreground,
              fontFamily: readerFaces.regular,
              fontSize: 20,
              lineHeight: 26,
              marginBottom: 24,
              maxWidth: 440,
              textDecorationLine: titleLink ? "underline" : "none",
              textDecorationColor: `rgba(${parseInt(palette.accent.slice(1, 3), 16)}, ${parseInt(palette.accent.slice(3, 5), 16)}, ${parseInt(palette.accent.slice(5, 7), 16)}, 0.55)`,
            },
            webLink,
          ]}
        >
          {item.title}
        </Text>
      </Pressable>
      <RenderHTML
        contentWidth={contentWidth}
        source={htmlSource}
        {...styles}
        systemFonts={systemFonts}
        customListStyleSpecs={customListStyleSpecs}
        renderersProps={linkProps}
        defaultTextProps={defaultTextProps}
        domVisitors={domVisitors}
        customHTMLElementModels={headingModels}
        renderers={headingRenderers}
        enableExperimentalMarginCollapsing
        enableCSSInlineProcessing={false}
      />
      {content.truncated && (
        <View
          style={
            Platform.OS === "web"
              ? ({
                  display: "block",
                  fontFamily: readerFaces.regular,
                  fontSize: 16,
                  lineHeight: 25.6,
                } as unknown as ViewStyle)
              : undefined
          }
        >
          <Pressable
            testID="article-toggle"
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? "Show less" : "Continue reading"} ${item.title}`}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            style={[
              {
                alignSelf: "flex-start",
                marginTop: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              },
              Platform.OS === "web"
                ? ({ display: "inline-flex" } as unknown as ViewStyle)
                : undefined,
            ]}
          >
            <Text
              style={{
                color: palette.accent,
                fontFamily: readerFaces.medium,
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {expanded ? "Show less" : "Continue reading"}
            </Text>
            <Svg
              width={12}
              height={12}
              viewBox="0 0 12 12"
              fill="none"
              stroke={palette.accent}
              strokeWidth={2}
            >
              <Path
                d={expanded ? "M3 7.5L6 4.5L9 7.5" : "M3 4.5L6 7.5L9 4.5"}
              />
            </Svg>
          </Pressable>
        </View>
      )}
      <Text
        testID="article-metadata"
        style={{
          color: palette.subtle,
          fontFamily: readerFaces.regular,
          fontSize: 14,
          lineHeight: 20,
          marginTop: 16,
        }}
      >
        {item.source} ·{" "}
        {item.pubDate.toLocaleTimeString("en-US", {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}
      </Text>
    </View>
  );
}
