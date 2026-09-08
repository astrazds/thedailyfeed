import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('forced deployment rejects unsafe commands and exercises isolated Git/lifecycle failures', () => {
  assert.doesNotThrow(() => execFileSync('python3', ['tests/fixtures/deploy-command.py'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
  }));
});
