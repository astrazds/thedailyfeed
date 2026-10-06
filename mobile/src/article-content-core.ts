import { Parser } from "htmlparser2";
import { FEED_CONTENT_SANITIZER_CONFIG } from "../../lib/feed-content-sanitizer-policy";
import {
  normalizeEmbeddedHeadingLevels,
  normalizeFeedContentAttributes,
  normalizeFeedContentDirection,
  normalizeFeedContentLanguage,
} from "../../lib/feed-content-normalization";
import type { PreparedArticle } from "./contracts";

type ContentNode =
  | { kind: "text"; value: string }
  | {
      kind: "element";
      tag: string;
      attributes: Record<string, string>;
      children: ContentNode[];
    };
type Frame = { children: ContentNode[] | null };
const allowedTags = new Set(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_TAGS);
const allowedAttributes = new Set(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR);
const droppedTags = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "template",
  "noscript",
  "video",
  "audio",
  "canvas",
  "table",
  "head",
  "form",
  "input",
  "button",
]);
const emptyArticle: PreparedArticle = {
  full: "",
  preview: "",
  truncated: false,
};
const MAX_BYTES = 128 * 1024;
const MAX_NODES = 4000;
const MAX_DEPTH = 40;
const PREVIEW_LENGTH = 600;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function serialize(nodes: ContentNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return escapeHtml(node.value);
      const attributes = Object.entries(node.attributes)
        .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
        .join("");
      const start = `<${node.tag}${attributes}>`;
      return node.tag === "img" || node.tag === "br"
        ? start
        : `${start}${serialize(node.children)}</${node.tag}>`;
    })
    .join("");
}

export function prepareArticle(html: string, baseUrl: string): PreparedArticle {
  if (
    html.length > MAX_BYTES ||
    new TextEncoder().encode(html).byteLength > MAX_BYTES
  ) {
    return emptyArticle;
  }
  const root: ContentNode[] = [];
  const frames: Frame[] = [{ children: root }];
  const headings: Extract<ContentNode, { kind: "element" }>[] = [];
  let nodeCount = 0;
  function countNode() {
    if (++nodeCount > MAX_NODES) throw new Error("Article node limit");
  }
  try {
    const parser = new Parser(
      {
        onopentag(tag, sourceAttributes) {
          countNode();
          if (frames.length > MAX_DEPTH) throw new Error("Article depth limit");
          const parent = frames[frames.length - 1].children;
          if (!parent || droppedTags.has(tag)) {
            frames.push({ children: null });
            return;
          }
          if (!allowedTags.has(tag)) {
            frames.push({ children: parent });
            return;
          }
          const filtered = Object.fromEntries(
            Object.entries(sourceAttributes).filter(([name]) =>
              allowedAttributes.has(name),
            ),
          );
          const attributes = normalizeFeedContentAttributes(
            tag,
            filtered,
            baseUrl,
          );
          if (!attributes) {
            frames.push({ children: null });
            return;
          }
          if ("lang" in attributes) {
            const language = normalizeFeedContentLanguage(attributes.lang);
            if (language) attributes.lang = language;
            else delete attributes.lang;
          }
          if ("dir" in attributes) {
            const direction = normalizeFeedContentDirection(attributes.dir);
            if (direction) attributes.dir = direction;
            else delete attributes.dir;
          }
          const node: Extract<ContentNode, { kind: "element" }> = {
            kind: "element",
            tag,
            attributes,
            children: [],
          };
          parent.push(node);
          if (/^h[1-6]$/.test(tag)) headings.push(node);
          frames.push({ children: node.children });
        },
        onclosetag() {
          if (frames.length > 1) frames.pop();
        },
        ontext(value) {
          countNode();
          frames[frames.length - 1].children?.push({ kind: "text", value });
        },
        oncomment() {
          countNode();
        },
      },
      { decodeEntities: true },
    );
    parser.end(html);
  } catch {
    return emptyArticle;
  }
  const levels = normalizeEmbeddedHeadingLevels(
    headings.map((node) => Number(node.tag[1])),
  );
  headings.forEach((node, index) => {
    node.tag = `h${levels[index]}`;
  });
  let characters = 0;
  function countText(nodes: ContentNode[]) {
    for (const node of nodes) {
      if (node.kind === "text") characters += Array.from(node.value).length;
      else countText(node.children);
    }
  }
  countText(root);
  const full = serialize(root);
  if (characters <= PREVIEW_LENGTH)
    return { full, preview: full, truncated: false };
  let remaining = PREVIEW_LENGTH;
  function truncate(nodes: ContentNode[]): ContentNode[] {
    const result: ContentNode[] = [];
    for (const node of nodes) {
      if (remaining <= 0) break;
      if (node.kind === "text") {
        const characters = Array.from(node.value);
        const taken = characters.slice(0, remaining);
        remaining -= taken.length;
        let value = taken.join("");
        if (characters.length > taken.length) {
          const boundary = Math.max(
            value.lastIndexOf(" "),
            value.lastIndexOf("\n"),
            value.lastIndexOf("\t"),
          );
          if (boundary > 0) value = value.slice(0, boundary);
          value = value.trimEnd();
        }
        result.push({
          kind: "text",
          value: value + (remaining === 0 ? "…" : ""),
        });
      } else {
        result.push({ ...node, children: truncate(node.children) });
      }
    }
    return result;
  }
  return { full, preview: serialize(truncate(root)), truncated: true };
}
