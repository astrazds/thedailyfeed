import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bodyViolations, commitMessageViolations, fabricatedNoreply, footerMarker } from './check-pr-body.mjs';

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

test('98b8d5e Cursor Agent trailer and id-less noreply fail', () => {
  const violations = commitMessageViolations(message('98b8d5e'), '98b8d5e');
  assert.equal(violations.length, 2);
  assert.match(violations[0], /98b8d5e contains "Co-authored-by: Cursor Agent <cursoragent@cursor\.com>"/);
  assert.match(violations[0], /Commit as Andrejs Strazds and remove the Cursor agent trailer/);
  assert.match(violations[1], /98b8d5e contains "Co-authored-by: Andrejs Strazds <astrazds@users\.noreply\.github\.com>"/);
  assert.match(violations[1], /Commit as Andrejs Strazds <35437548\+astrazds@users\.noreply\.github\.com>/);
});

test('fe002c0 Cursor trailer without the Agent display name fails', () => {
  const violations = commitMessageViolations(message('fe002c0'), 'fe002c0');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /fe002c0 contains "Co-authored-by: Cursor <cursoragent@cursor\.com>"/);
  assert.match(violations[0], /Commit as Andrejs Strazds and remove the Cursor agent trailer/);
});

test('97c7d80 id-less noreply fails without a Cursor trailer', () => {
  const violations = commitMessageViolations(message('97c7d80'), '97c7d80');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /97c7d80 contains "Co-authored-by: Andrejs Strazds <astrazds@users\.noreply\.github\.com>"/);
  assert.match(violations[0], /Commit as Andrejs Strazds <35437548\+astrazds@users\.noreply\.github\.com> and remove this trailer/);
});

test('the real GitHub noreply co-author passes', () => {
  const messageText = 'Co-authored-by: Andrejs Strazds <35437548+astrazds@users.noreply.github.com>\n';
  assert.deepEqual(commitMessageViolations(messageText, 'good-noreply'), []);
  assert.equal(messageText.includes(fabricatedNoreply), false);
});

test('bcf1143 has no agent signature trailer', () => {
  assert.deepEqual(commitMessageViolations(message('bcf1143'), 'bcf1143'), []);
});

test('a dependabot trailer is not an agent signature', () => {
  assert.deepEqual(commitMessageViolations(message('030df0b'), '030df0b'), []);
});
