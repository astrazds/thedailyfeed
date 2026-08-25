import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production deployment forces IPv4 for the SRV1 SSH connection', async () => {
  const workflow = await readFile('.forgejo/workflows/deploy-production.yml', 'utf8');
  const deployStep = workflow.match(
    /- name: Deploy exact dispatched commit[\s\S]*?(?=\n\s+- name: Verify public homepage)/
  )?.[0];

  assert.ok(deployStep, 'production deployment step is present');
  assert.match(deployStep, /\bssh -4 -F \/dev\/null/);
});

test('production acceptance passes target metadata to its runtime verifier', async () => {
  const deployCommand = await readFile('scripts/thedailyfeed-ci-deploy', 'utf8');
  const acceptance = deployCommand.match(
    /phase=acceptance[\s\S]*?(?=\nprintf 'phase=complete)/
  )?.[0];

  assert.ok(acceptance, 'production acceptance phase is present');
  assert.match(
    acceptance,
    /docker inspect thedailyfeed \| TARGET_COMMIT="\$target_commit" TARGET_VERSION="\$APP_VERSION" python3 -c/
  );
});
