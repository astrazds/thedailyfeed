# Web verification for release 1.2.8

This record describes checks completed on 6 October 2026 for merged commit
[`56010f8`](https://github.com/astrazds/thedailyfeed/commit/56010f8fe9436b553a39d819862437599ad147a4).
The Expo and React Native web migration is implemented. Physical iPhone Safari
verification remains outstanding, and native applications remain a separate
phase.

The [initial migration record](expo-web-verification.json) describes release
1.2.7. It remains unchanged as historical evidence.

## Repository verification

[PR #15](https://github.com/astrazds/thedailyfeed/pull/15) restored loading
motion and replaced the conflicting stream-record limit with one 32 MiB
response-byte budget. Its
[CI run](https://github.com/astrazds/thedailyfeed/actions/runs/37411555852)
passed for the reviewed head. The merged commit has the same source tree.

The local full gate passed 28 mobile tests, 78 Chromium browser cases, and all
16 sealed style comparisons with zero changed pixels. The separate integration
run passed 149 tests, including the five opt-in API cases. The full gate also
verified worker behavior, article rendering, real HTTP, and an unpublished
container build. These counts describe that revision, not a permanent target.

Transport regressions passed for large valid records, later source completion,
JSON fallback, split UTF-8, the exact response budget, and reader cancellation.
Temporal browser assertions proved rotation and pulse, live reduced-motion
changes, and stopping on completion or failure.

## Additional browser acceptance

These were one-off checks against the release's web artifact. They are separate
from the repository's Chromium CI gate. The browser-engine runs blocked service
workers and used cached default-source API responses. Worker behavior and a
fresh source fetch were checked separately.

| Browser | Live feed loading | Isolated UI checks |
| --- | --- | --- |
| Chromium 153 | Passed | Passed |
| Firefox 155 | Passed | Passed |
| WebKit 26.6, desktop | Passed | Passed |
| WebKit 26.6, iPhone 13 emulation | Passed | Passed |

Each case rendered every article returned by the default-source API and
completed all source outcomes without uncaught browser errors. Additional live
checks covered a larger feed set and incremental metadata arrival before a
fresh source result and stream completion.

Synthetic responses isolated loading motion, reduced motion, rich article
expansion, safe links, layout, persistent feed renaming, and actual OPML
download and reimport. TLS certificate verification stayed enabled.

## Worker and data continuity

A disposable persistent Chromium profile activated the deployed worker,
closed, and reopened offline. It retained synthetic subscriptions, including a
disabled source, and rendered a synthetic same-day saved article. Bundled fonts
loaded offline, fresh API requests failed, and worker caches contained no API
responses. Unrelated and expired snapshots were excluded.

Separate controlled-origin tests upgraded actual pre-Expo and previous Expo
workers to the current worker. They retained subscriptions and saved content,
removed obsolete bundles, and reloaded offline without network requests.

## Evidence limits

Linux WebKit emulation is not physical iOS Safari. These checks do not establish
native app behavior, every browser's installation UI, or future publisher
availability. The offline check used synthetic saved data within storage bounds;
it does not promise retention of every live article or image.

Worker upgrades ran on a controlled origin. Deployment metadata, host health,
and operator logs belong to each installation's acceptance record, outside this
repository. Follow [installation checks](../../DEPLOYMENT.md#checking-an-installation)
for those checks and the [native work list](../../mobile/README.md#native-platform-work)
for the next platform phase.
