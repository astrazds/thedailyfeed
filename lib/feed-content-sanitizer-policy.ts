import type { Config as DomPurifyConfig } from 'dompurify';

export const ALLOWED_FEED_CONTENT_URI_REGEXP = /^(?:https?:|mailto:)/i;

export const FEED_CONTENT_SANITIZER_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'b',
    'i',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'img',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'span',
    'div',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'rel', 'lang', 'dir'],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: ALLOWED_FEED_CONTENT_URI_REGEXP,
} satisfies DomPurifyConfig;
