"""Offline behavioral checks: actual isolated Git repos, stubbed Docker, no network."""
import copy
import fcntl
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[2]
loader = importlib.machinery.SourceFileLoader('deploy', str(ROOT / 'scripts/thedailyfeed-ci-deploy'))
spec = importlib.util.spec_from_loader(loader.name, loader)
deploy = importlib.util.module_from_spec(spec)
loader.exec_module(deploy)


class Deployment(unittest.TestCase):
    def setUp(self):
        self.cwd = Path.cwd()
        self.temp = tempfile.TemporaryDirectory(prefix='thedailyfeed-deploy-test-')
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.origin = self.root / 'origin'
        self.git('init', '--bare', '--initial-branch=main', str(self.origin), cwd=self.root)
        self.git('clone', str(self.origin), str(self.repo), cwd=self.root)
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'user.name', 'Offline fixture')
        (self.repo / 'package.json').write_text('{"version":"1.1.12"}\n')
        self.git('add', 'package.json')
        self.git('commit', '-m', 'fixture')
        self.git('push', 'origin', 'main')
        self.old = self.git('rev-parse', 'HEAD')
        (self.repo / 'README.md').write_text('synthetic\n')
        self.git('add', 'README.md')
        self.git('commit', '-m', 'candidate')
        self.git('push', 'origin', 'main')
        self.target = self.git('rev-parse', 'HEAD')
        self.git('reset', '--hard', self.old)
        self.cfg = json.loads((ROOT / 'deploy/deploy.example.json').read_text())
        self.cfg.update(repository=str(self.repo), expected_origin=str(self.origin),
                        compose_file=str(self.root / 'compose.yml'), env_file=str(self.root / '.env.production'))
        Path(self.cfg['compose_file']).write_text('services: {}\n')
        Path(self.cfg['env_file']).touch(mode=0o600)
        self.config = self.root / 'deploy.json'
        self.config.write_text(json.dumps(self.cfg))
        runtime = self.cfg['runtime']
        self.container = {
            'Image': 'sha256:' + 'a' * 64,
            'State': {'Health': {'Status': 'healthy'}},
            'Config': {'User': runtime['user'], 'Env': ['ALLOW_PRIVATE_NETWORKS=false'],
                       'Labels': {'com.docker.compose.project': self.cfg['project']}},
            'HostConfig': {key: value for key, value in runtime.items() if key in (
                'PortBindings', 'Memory', 'NanoCpus', 'PidsLimit', 'Tmpfs', 'LogConfig')},
            'NetworkSettings': {'Networks': {network: {} for network in runtime['networks']}},
        }
        self.container['HostConfig'].update(ReadonlyRootfs=True, Privileged=False,
                                             CapDrop=['ALL'], SecurityOpt=['no-new-privileges:true'])
        self.calls = []
        self.activation_fails = False
        self.post_bad = False
        self.active = False
        self.real_run = subprocess.run
        deploy.log = None
        deploy.phase = 'authorize'

    def tearDown(self):
        os.chdir(self.cwd)
        if deploy.log and not deploy.log.closed:
            deploy.log.close()
        self.temp.cleanup()

    def git(self, *args, cwd=None):
        return subprocess.check_output(['git', *args], cwd=cwd or self.repo,
                                       stderr=subprocess.DEVNULL, text=True).strip()

    def command(self, args, **kwargs):
        if args[0] != 'docker':
            return self.real_run(args, **kwargs)
        self.calls.append(args)
        output = ''
        code = 0
        if args[1] == 'inspect':
            container = copy.deepcopy(self.container)
            if self.active:
                container['Config']['Env'] += ['APP_VERSION=1.1.12', 'APP_COMMIT=' + self.target]
                if self.post_bad:
                    container['HostConfig']['ReadonlyRootfs'] = False
            output = json.dumps([container])
        if 'up' in args:
            self.active = True
            code = 1 if self.activation_fails else 0
        return subprocess.CompletedProcess(args, code, output)

    def invoke(self, command=None):
        # Only administrator ownership checks are substituted. Git, flock, logs,
        # environment mode checks and runtime validation execute normally.
        with patch.object(deploy, 'CONFIG', self.config), patch.object(deploy, 'protected'), \
             patch.dict(os.environ, {'SSH_ORIGINAL_COMMAND': command or 'deploy ' + self.target}), \
             patch.object(deploy.subprocess, 'run', side_effect=self.command):
            deploy.main()

    def rejected(self, command=None):
        with self.assertRaises(SystemExit):
            self.invoke(command)
        self.assertFalse(self.active)

    def test_command_rejections(self):
        for command in ('id', 'deploy main', 'deploy ' + self.target + '; id',
                        'deploy ' + self.target + '\n', 'deploy ' + self.target.upper()):
            self.rejected(command)
        self.assertEqual(self.calls, [])

    def test_dirty_tree(self):
        (self.repo / 'untracked').touch()
        self.rejected()
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.old)

    def test_wrong_origin(self):
        self.git('remote', 'set-url', 'origin', str(self.root / 'other'))
        self.rejected()

    def test_wrong_branch(self):
        self.git('switch', '-c', 'other')
        self.rejected()

    def test_stale_sha(self):
        self.rejected('deploy ' + self.old)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.old)

    def test_diverged_history(self):
        (self.repo / 'other').touch()
        self.git('add', 'other')
        self.git('commit', '-m', 'divergence')
        self.rejected()

    def test_lock(self):
        with open(self.repo / '.git/thedailyfeed-deploy.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.rejected()

    def test_environment_mode(self):
        Path(self.cfg['env_file']).chmod(0o644)
        self.rejected()

    def test_unsafe_current_runtime(self):
        self.container['Config']['Env'] = ['ALLOW_PRIVATE_NETWORKS=true']
        self.rejected()
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.old)

    def test_failure_preserves_log_and_rollback_without_retry(self):
        self.activation_fails = True
        with self.assertRaises(SystemExit):
            self.invoke()
        self.assertTrue(Path(deploy.log.name).exists())
        self.assertEqual(Path(deploy.log.name).stat().st_mode & 0o777, 0o600)
        self.assertEqual(sum('up' in call for call in self.calls), 1)
        self.assertEqual(sum(call[1:3] == ('image', 'tag') for call in self.calls), 1)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.target)

    def test_acceptance_failure_preserves_evidence(self):
        self.post_bad = True
        with self.assertRaises(SystemExit):
            self.invoke()
        self.assertTrue(Path(deploy.log.name).exists())
        self.assertEqual(sum('up' in call for call in self.calls), 1)

    def test_success_checks_metadata_and_cleans_log(self):
        self.invoke()
        self.assertTrue(self.active)
        self.assertFalse(Path(deploy.log.name).exists())
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.target)
        activation = next(call for call in self.calls if 'up' in call)
        self.assertEqual(activation[-1], 'thedailyfeed')
        self.assertIn('--no-deps', activation)

    def test_configuration_permissions(self):
        with self.assertRaises(SystemExit):
            deploy.protected(self.config)


if __name__ == '__main__':
    unittest.main()
