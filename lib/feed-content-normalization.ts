const EMBEDDED_HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';
const SAFE_DIRECTIONS = new Set(['ltr', 'rtl', 'auto']);

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

export function normalizeSanitizedFeedContent(root: Element): void {
  for (const link of Array.from(root.querySelectorAll('a[href]'))) {
    link.removeAttribute('target');
    link.setAttribute('rel', 'nofollow');
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
