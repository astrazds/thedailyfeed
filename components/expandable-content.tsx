'use client';

import { useId, useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { CONTENT_TRUNCATE_LENGTH } from '@/lib/constants';
import { FEED_CONTENT_SANITIZER_CONFIG } from '@/lib/feed-content-sanitizer-policy';
import { normalizeSanitizedFeedContent } from '@/lib/feed-content-normalization';

interface ExpandableContentProps {
  baseUrl?: string | null;
  content: string;
  maxLength?: number;
}

interface TruncatedHtmlResult {
  html: string;
  truncated: boolean;
}

function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const slice = text.slice(0, maxChars);
  const lastSpace = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'), slice.lastIndexOf('\t'));
  if (lastSpace > 0) {
    return slice.slice(0, lastSpace).trimEnd();
  }

  return slice.trimEnd();
}

function truncateHtmlSafely(sourceRoot: Element, maxLength: number): TruncatedHtmlResult {
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return { html: '', truncated: sourceRoot.childNodes.length > 0 };
  }

  let remaining = maxLength;
  let truncated = false;

  const cloneNode = (node: Node): Node | null => {
    if (remaining <= 0) {
      return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text) {
        return document.createTextNode('');
      }

      if (text.length <= remaining) {
        remaining -= text.length;
        return document.createTextNode(text);
      }

      const clipped = truncateAtWordBoundary(text, remaining);
      const safeText = clipped || text.slice(0, remaining).trimEnd();
      remaining = 0;
      truncated = true;
      return safeText ? document.createTextNode(`${safeText}…`) : null;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const clonedElement = element.cloneNode(false) as Element;

      for (const child of Array.from(element.childNodes)) {
        const clonedChild = cloneNode(child);
        if (clonedChild) {
          clonedElement.appendChild(clonedChild);
        }
        if (remaining <= 0) {
          break;
        }
      }

      return clonedElement;
    }

    return null;
  };

  const outputRoot = document.createElement('div');
  for (const child of Array.from(sourceRoot.childNodes)) {
    const cloned = cloneNode(child);
    if (cloned) {
      outputRoot.appendChild(cloned);
    }
    if (remaining <= 0) {
      break;
    }
  }

  return {
    html: outputRoot.innerHTML,
    truncated,
  };
}

interface DisclosureButtonProps {
  controlsId: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export function DisclosureButton({
  controlsId,
  isExpanded,
  onToggle,
}: DisclosureButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls={controlsId}
      className="mt-3 text-sm font-medium button-hover-fade inline-flex items-center gap-1"
      style={{ color: 'var(--accent-text)' }}
    >
      <span>{isExpanded ? 'Show less' : 'Continue reading'}</span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        focusable="false"
      >
        <path d={isExpanded ? 'M3 7.5L6 4.5L9 7.5' : 'M3 4.5L6 7.5L9 4.5'} />
      </svg>
    </button>
  );
}

export function ExpandableContent({
  baseUrl = null,
  content,
  maxLength = CONTENT_TRUNCATE_LENGTH,
}: ExpandableContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  
  // Sanitize HTML content to prevent XSS attacks
  const processedContent = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        sanitized: content,
        truncated: { html: content, truncated: false },
      };
    }

    const fragment = DOMPurify.sanitize(content, {
      ...FEED_CONTENT_SANITIZER_CONFIG,
      RETURN_DOM_FRAGMENT: true,
    });
    const root = document.createElement('div');
    root.append(fragment);
    normalizeSanitizedFeedContent(root, baseUrl);

    return {
      sanitized: root.innerHTML,
      truncated: truncateHtmlSafely(root, maxLength),
    };
  }, [baseUrl, content, maxLength]);

  const displayContent =
    isExpanded || !processedContent.truncated.truncated
      ? processedContent.sanitized
      : processedContent.truncated.html;

  return (
    <div>
      <div
        id={contentId}
        className="prose prose-sm max-w-none"
        style={{ color: 'var(--foreground)' }}
        dangerouslySetInnerHTML={{ __html: displayContent }}
      />
      
      {processedContent.truncated.truncated && (
        <DisclosureButton
          controlsId={contentId}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((expanded) => !expanded)}
        />
      )}
    </div>
  );
}
