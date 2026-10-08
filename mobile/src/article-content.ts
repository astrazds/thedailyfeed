import DOMPurify from "dompurify";
import { FEED_CONTENT_SANITIZER_CONFIG } from "../../lib/feed-content-sanitizer-policy";
import { normalizeSanitizedFeedContent } from "../../lib/feed-content-normalization";
import { prepareArticle as prepareBoundedArticle } from "./article-content-core";
import type { PreparedArticle } from "./contracts";

export function prepareArticle(html: string, baseUrl: string): PreparedArticle {
  const empty = { full: "", preview: "", truncated: false };
  if (
    typeof document === "undefined" ||
    typeof DOMPurify.sanitize !== "function"
  ) {
    return empty;
  }
  if (
    html.length > 128 * 1024 ||
    new TextEncoder().encode(html).byteLength > 128 * 1024
  ) {
    return empty;
  }
  try {
    const root = document.implementation
      .createHTMLDocument("")
      .createElement("div");
    root.append(
      DOMPurify.sanitize(html, {
        ...FEED_CONTENT_SANITIZER_CONFIG,
        RETURN_DOM_FRAGMENT: true,
      }),
    );
    normalizeSanitizedFeedContent(root, baseUrl);
    return prepareBoundedArticle(root.innerHTML, baseUrl);
  } catch {
    return empty;
  }
}
