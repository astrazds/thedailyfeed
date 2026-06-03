import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readDockerignorePatterns(): Promise<Set<string>> {
  const source = await readFile('.dockerignore', 'utf8');

  return new Set(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
  );
}

test('Docker build context excludes production env files without excluding the template', async () => {
  const patterns = await readDockerignorePatterns();

  assert.equal(patterns.has('.env'), true);
  assert.equal(patterns.has('.env.*'), true);
  assert.equal(patterns.has('!.env.example'), true);
  assert.equal(patterns.has('!env.template'), true);
});
