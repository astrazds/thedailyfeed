import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bodyViolations, commitMessageViolations, footerMarker } from './check-pr-body.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function message(sha) {
  return execFileSync('git', ['log', '-1', '--format=%B', sha], { cwd: root, encoding: 'utf8' });
}

test('a pull request body with the agent footer comment fails', () => {
  const violations = bodyViolations(`Summary\n${footerMarker}_BEGIN -->\n`);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /agent footer comment/);
  assert.match(violations[0], /Remove the footer/);
});

test('an ordinary pull request body passes', () => {
  assert.deepEqual(bodyViolations('Explain the change and the check you ran.'), []);
});

test('prose that names the footer marker passes', () => {
  assert.deepEqual(bodyViolations('The check rejects a CURSOR_AGENT_PR_BODY comment.'), []);
});

test('98b8d5e Cursor Agent trailer fails', () => {
  const violations = commitMessageViolations(message('98b8d5e'), '98b8d5e');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /98b8d5e contains "Co-authored-by: Cursor Agent <cursoragent@cursor\.com>"/);
  assert.match(violations[0], /Commit as Andrejs Strazds and remove the Cursor agent trailer/);
});

test('fe002c0 Cursor trailer without the Agent display name fails', () => {
  const violations = commitMessageViolations(message('fe002c0'), 'fe002c0');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /fe002c0 contains "Co-authored-by: Cursor <cursoragent@cursor\.com>"/);
  assert.match(violations[0], /Commit as Andrejs Strazds and remove the Cursor agent trailer/);
});

test('a dependabot trailer is not a Cursor agent signature', () => {
  const violations = commitMessageViolations(message('030df0b'), '030df0b');
  assert.deepEqual(violations, []);
});
