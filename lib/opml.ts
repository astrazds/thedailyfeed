/**
 * OPML (Outline Processor Markup Language) utilities
 * For importing and exporting RSS feed lists
 */

import type { Feed, FeedImportSummary } from './feed-storage';

export interface OPMLFeedEntry {
  name: string;
  url: string;
}

export type OPMLImportSummary = FeedImportSummary;

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Export feeds to OPML format
 */
export function exportToOPML(feeds: Feed[]): string {
  const now = new Date().toUTCString();
  
  const outlines = feeds
    .map(feed => {
      const xmlUrl = escapeAttribute(feed.url);
      const title = escapeAttribute(feed.name);
      
      return `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${xmlUrl}" />`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>The Daily Feed - RSS Subscriptions</title>
    <dateCreated>${now}</dateCreated>
    <dateModified>${now}</dateModified>
  </head>
  <body>
${outlines}
  </body>
</opml>`;
}

/**
 * Parse OPML and extract feed information
 */
export function parseOPML(opmlContent: string): OPMLFeedEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opmlContent, 'text/xml');
  
  // Check for parsing errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid OPML file format');
  }
  
  const outlines = doc.querySelectorAll('outline[type="rss"], outline[xmlUrl]');
  const feeds: OPMLFeedEntry[] = [];
  
  outlines.forEach(outline => {
    const xmlUrl = outline.getAttribute('xmlUrl');
    const title = outline.getAttribute('title') || outline.getAttribute('text');
    
    if (xmlUrl && title) {
      feeds.push({
        name: title,
        url: xmlUrl,
      });
    }
  });
  
  if (feeds.length === 0) {
    throw new Error('No valid RSS feeds found in OPML file');
  }
  
  return feeds;
}

/**
 * Download OPML file to user's computer
 */
export function downloadOPML(opmlContent: string, filename: string = 'feeds.opml'): void {
  const blob = new Blob([opmlContent], { type: 'text/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Read OPML file from user's computer
 */
export function readOPMLFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        resolve(content);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}
