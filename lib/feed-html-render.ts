export function unsanitizedFeedHtmlFallback(): {
  sanitized: string;
  truncated: { html: string; truncated: false };
} {
  return {
    sanitized: '',
    truncated: { html: '', truncated: false },
  };
}
