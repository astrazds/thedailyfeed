const EMBEDDED_HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';
const SAFE_DIRECTIONS = new Set(['ltr', 'rtl', 'auto']);

type FeedContentUrlKind = 'image' | 'link';
type FeedContentAttributes = Readonly<Record<string, string>>;

const IMAGE_PROTOCOLS = new Set(['http:', 'https:']);
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function validatedBaseUrl(value: string | null): URL | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeFeedContentUrl(
  value: string,
  baseUrl: string | null,
  kind: FeedContentUrlKind
): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    const normalizedUrl = new URL(trimmedValue, validatedBaseUrl(baseUrl));
    const allowedProtocols = kind === 'image' ? IMAGE_PROTOCOLS : LINK_PROTOCOLS;

    return allowedProtocols.has(normalizedUrl.protocol) ? normalizedUrl.href : null;
  } catch {
    return null;
  }
}

export function normalizeFeedContentAttributes(
  tagName: string,
  attributes: FeedContentAttributes,
  baseUrl: string | null
): Record<string, string> | null {
  const normalizedAttributes = Object.fromEntries(
    Object.entries(attributes).filter(([name]) => (
      !name.startsWith('on')
      && name !== 'style'
      && name !== 'srcset'
      && name !== 'href'
      && name !== 'src'
      && name !== 'target'
    ))
  );
  const normalizedTagName = tagName.toLowerCase();

  if (normalizedTagName === 'a') {
    const href = normalizeFeedContentUrl(attributes.href ?? '', baseUrl, 'link');
    if (href) {
      normalizedAttributes.href = href;
      normalizedAttributes.rel = 'nofollow';
    } else {
      delete normalizedAttributes.rel;
    }
  }

  if (normalizedTagName === 'img') {
    const src = normalizeFeedContentUrl(attributes.src ?? '', baseUrl, 'image');
    if (!src) {
      return null;
    }

    normalizedAttributes.src = src;
    normalizedAttributes.alt ??= '';
  }

  return normalizedAttributes;
}

export function normalizeEmbeddedHeadingLevels(sourceLevels: number[]): number[] {
  if (sourceLevels.length === 0) {
    return [];
  }

  const outputLevels = [3];

  for (let index = 1; index < sourceLevels.length; index += 1) {
    const sourceDelta = sourceLevels[index] - sourceLevels[index - 1];
    const previousOutput = outputLevels[index - 1];
    const nextOutput = sourceDelta > 0
      ? previousOutput + 1
      : previousOutput + sourceDelta;

    outputLevels.push(Math.min(5, Math.max(3, nextOutput)));
  }

  return outputLevels;
}

export function normalizeFeedContentLanguage(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return new Intl.Locale(trimmedValue).toString();
  } catch {
    return null;
  }
}

export function normalizeFeedContentDirection(value: string): string | null {
  const normalizedValue = value.trim().toLowerCase();
  return SAFE_DIRECTIONS.has(normalizedValue) ? normalizedValue : null;
}

export function normalizeSanitizedFeedContent(root: Element, baseUrl: string | null): void {
  for (const element of Array.from(root.querySelectorAll('*'))) {
    const normalizedAttributes = normalizeFeedContentAttributes(
      element.localName,
      Object.fromEntries(
        Array.from(element.attributes, (attribute) => [attribute.name, attribute.value])
      ),
      baseUrl
    );
    if (!normalizedAttributes) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      element.removeAttribute(attribute.name);
    }
    for (const [name, value] of Object.entries(normalizedAttributes)) {
      element.setAttribute(name, value);
    }
  }

  for (const element of Array.from(root.querySelectorAll('[lang]'))) {
    const language = normalizeFeedContentLanguage(element.getAttribute('lang') ?? '');
    if (language) {
      element.setAttribute('lang', language);
    } else {
      element.removeAttribute('lang');
    }
  }

  for (const element of Array.from(root.querySelectorAll('[dir]'))) {
    const direction = normalizeFeedContentDirection(element.getAttribute('dir') ?? '');
    if (direction) {
      element.setAttribute('dir', direction);
    } else {
      element.removeAttribute('dir');
    }
  }

  const headings = Array.from(root.querySelectorAll(EMBEDDED_HEADING_SELECTOR));
  const sourceLevels = headings.map((heading) => Number(heading.tagName.slice(1)));
  const outputLevels = normalizeEmbeddedHeadingLevels(sourceLevels);

  headings.forEach((heading, index) => {
    const replacement = heading.ownerDocument.createElement(`h${outputLevels[index]}`);
    for (const attribute of Array.from(heading.attributes)) {
      replacement.setAttribute(attribute.name, attribute.value);
    }
    while (heading.firstChild) {
      replacement.appendChild(heading.firstChild);
    }
    heading.replaceWith(replacement);
  });
}
