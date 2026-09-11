# Contributing

Small, focused improvements are welcome. Describe the problem and observable
behavior in an issue or pull request. For security issues, use [private
reporting](SECURITY.md). Never attach real feed URLs, OPML exports, credentials,
logs, or browser snapshots; reproduce problems with synthetic content.

Use the toolchain and tasks in `mise.toml`. Start with the development
instructions in [README.md](README.md). Keep browser-local storage formats,
HTTP/NDJSON contracts, feed safety controls, and the existing visual design.
[TECHNICAL.md](TECHNICAL.md) describes the architecture and boundaries.

For defects, first reproduce the problem through the affected user path with
synthetic data. Add a focused regression where it can detect the observed
failure. Run affected tests while iterating and `mise run verify` before a
code commit or release. The full gate needs Python 3, Docker/Compose/Buildx,
and Playwright's Chromium dependencies. Documentation-only changes need diff
review, `git diff --check`, and checks of referenced paths and claims.
Avoid tests that merely assert source text or duplicate the implementation.

Release metadata is checked with `mise run version-check`. Maintainers bump
release-worthy changes once with `mise exec -- pnpm version:bump patch` (or the appropriate
SemVer component) after implementation stabilizes. Do not bump for documentation
or test-only changes.

In the pull request, describe what changed, why, and how it was verified.
Keep unrelated formatting and dependency changes separate. Contributions remain
under the project's [MIT license](LICENSE).

## Browser verification and screenshots

Build production output before running browser checks. Rebuild after application
changes. Playwright starts and stops its own server on `127.0.0.1:3100` and
refuses to reuse an existing instance.

```bash
mise run build
mise run browser-install
mise run browser -- --trace on
```

Both desktop and narrow projects use disposable browser storage and synthetic
feeds. External requests and service workers are blocked. These tests cover
reader and manager scenarios with synthetic fixtures. They do not exercise live
feed fetching or service-worker operation.
See [testing scope](TECHNICAL.md#testing) for the complementary gates and gaps.

To update the reader images in `docs/assets/`, run:

```bash
UPDATE_SCREENSHOTS=1 mise run browser -- --grep 'reader renders'
```

To capture loading and refresh states for inspection, run:

```bash
LOADING_CAPTURE_DIR=/tmp/thedailyfeed-loading-captures \
  mise run browser -- e2e/loading.spec.ts --trace on
```

The README progress images use `desktop-partial.png` and
`narrow-manager-pending.png` from that capture directory. Inspect both viewport
sizes before replacing documentation images. Keep reports, traces, screenshots,
and downloaded OPML synthetic; exclude private reading data from pull requests.
