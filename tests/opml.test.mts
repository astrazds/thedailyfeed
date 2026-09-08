import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { exportToOPML } from '../lib/opml';

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
});
