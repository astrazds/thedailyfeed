import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { STORAGE_KEY_FEEDS } from '../lib/constants';
import { runFeedManagerOperation } from '../lib/feed-storage';
import { exportToOPML, parseOPML } from '../lib/opml';

function outlineAttributes(xml: string): Array<Record<string, string>> {
  return JSON.parse(execFileSync('python3', ['-c',
    'import sys,json,xml.etree.ElementTree as ET; root=ET.fromstring(sys.stdin.read()); print(json.dumps([el.attrib for el in root.iter("outline") if el.attrib.get("type")=="rss" or "xmlUrl" in el.attrib]))',
  ], { input: xml, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
}

function installOutlineDomParser(): void {
  // Node has no DOMParser. Python supplies the outline attributes a browser DOM would expose.
  const parser = class {
    parseFromString(xml: string) {
      const outlines = outlineAttributes(xml).map((attrs) => ({
        getAttribute(name: string) {
          return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
      }));
      return {
        querySelector: () => null,
        querySelectorAll: () => outlines,
      };
    }
  };
  globalThis.DOMParser = parser as unknown as typeof DOMParser;
}

function installEmptyFeedStorage(): void {
  const store = new Map<string, string>();
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      dispatchEvent: events.dispatchEvent.bind(events),
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
    },
  });
  localStorage.setItem(STORAGE_KEY_FEEDS, '[]');
}

test('OPML attributes round-trip quotes, ampersands and angle brackets through XML', () => {
  const name = 'A "quoted" & <angled> publisher\'s feed';
  const url = 'https://example.com/rss?q="news"&category=<tech>&owner=it\'s';
  // A real XML parser independently verifies the serialized attribute values.
  const parsed = JSON.parse(execFileSync('python3', ['-c',
    'import sys,json,xml.etree.ElementTree as ET; print(json.dumps(ET.fromstring(sys.stdin.read()).find("body/outline").attrib))',
  ], { input: exportToOPML([{ id: 'synthetic', name, url, enabled: true, addedAt: new Date() }]), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  assert.equal(parsed.title, name);
  assert.equal(parsed.text, name);
  assert.equal(parsed.xmlUrl, url);
  assert.equal(parsed.enabled, 'true');
});

test('a disabled feed stays disabled through OPML export, parse, and import', async () => {
  const name = 'A "paused" & <angled> publisher\'s feed';
  const url = 'https://example.com/paused.xml?q="news"&category=<tech>&owner=it\'s';
  const xml = exportToOPML([{ id: 'paused', name, url, enabled: false, addedAt: new Date() }]);
  const exported = outlineAttributes(xml);
  assert.equal(exported.length, 1);
  assert.equal(exported[0].title, name);
  assert.equal(exported[0].xmlUrl, url);
  assert.equal(exported[0].enabled, 'false');

  installOutlineDomParser();
  installEmptyFeedStorage();
  const parsed = parseOPML(xml);
  assert.deepEqual(parsed, [{ name, url, enabled: false }]);

  const result = await runFeedManagerOperation({ type: 'import-opml', feeds: parsed });
  assert.equal(result.type, 'import-opml');
  assert.deepEqual(
    result.feeds.map((feed) => ({ name: feed.name, url: feed.url, enabled: feed.enabled })),
    [{ name, url, enabled: false }],
  );
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FEEDS) ?? '[]') as Array<{ enabled: boolean }>;
  assert.equal(stored[0].enabled, false);
});

test('OPML without an enabled attribute imports as enabled', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Foreign" title="Foreign" xmlUrl="https://example.com/foreign.xml" />
  </body>
</opml>`;
  installOutlineDomParser();
  installEmptyFeedStorage();
  const parsed = parseOPML(xml);
  assert.deepEqual(parsed, [{ name: 'Foreign', url: 'https://example.com/foreign.xml', enabled: true }]);

  const result = await runFeedManagerOperation({ type: 'import-opml', feeds: parsed });
  assert.equal(result.feeds[0].enabled, true);
});
