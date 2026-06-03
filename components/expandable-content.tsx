'use client';

import { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { CONTENT_TRUNCATE_LENGTH } from '@/lib/constants';
import { FEED_CONTENT_SANITIZER_CONFIG } from '@/lib/feed-content-sanitizer-policy';

interface ExpandableContentProps {
  content: string;
  maxLength?: number;
}

interface TruncatedHtmlResult {
  html: string;
  truncated: boolean;
}

function enforceSafeLinkAttributes(html: string): string {
  const root = document.createElement('div');
  root.innerHTML = html;

  for (const link of Array.from(root.querySelectorAll('a[href]'))) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer nofollow');
  }

  return root.innerHTML;
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

function truncateHtmlSafely(html: string, maxLength: number): TruncatedHtmlResult {
  if (typeof window === 'undefined') {
    return { html, truncated: false };
  }

  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return { html: '', truncated: html.trim().length > 0 };
  }

  const sourceRoot = document.createElement('div');
  sourceRoot.innerHTML = html;
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
      return safeText ? document.createTextNode(`${safeText}...`) : null;
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

export function ExpandableContent({ content, maxLength = CONTENT_TRUNCATE_LENGTH }: ExpandableContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Sanitize HTML content to prevent XSS attacks
  const sanitizedContent = useMemo(() => {
    if (typeof window === 'undefined') return content;
    
    const cleanHtml = DOMPurify.sanitize(content, {
      ...FEED_CONTENT_SANITIZER_CONFIG,
    });

    return enforceSafeLinkAttributes(cleanHtml);
  }, [content]);

  const truncatedContent = useMemo(
    () => truncateHtmlSafely(sanitizedContent, maxLength),
    [sanitizedContent, maxLength]
  );

  const displayContent =
    isExpanded || !truncatedContent.truncated ? sanitizedContent : truncatedContent.html;

  return (
    <div>
      <div 
        className="prose prose-sm max-w-none"
        style={{ color: 'var(--foreground)' }}
        dangerouslySetInnerHTML={{ __html: displayContent }}
      />
      
      {truncatedContent.truncated && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 text-sm font-medium transition-colors button-hover-fade inline-flex items-center gap-1"
          style={{ color: 'var(--accent-primary)' }}
        >
          {isExpanded ? (
            <>
              <span>Show less</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7.5L6 4.5L9 7.5" />
              </svg>
            </>
          ) : (
            <>
              <span>Continue reading</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 4.5L6 7.5L9 4.5" />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  );
}
