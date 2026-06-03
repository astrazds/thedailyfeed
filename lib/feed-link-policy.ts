const SAFE_ARTICLE_LINK_PROTOCOLS = new Set(['http:', 'https:']);

export function normalizeSafeArticleLink(link: string): string {
  const trimmed = link.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    return SAFE_ARTICLE_LINK_PROTOCOLS.has(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function isSafeArticleLink(link: string): boolean {
  return normalizeSafeArticleLink(link) !== '';
}
