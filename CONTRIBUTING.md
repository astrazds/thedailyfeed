# Contributing

Small, focused improvements are welcome. Describe the problem and observable
behavior in an issue or pull request. For security issues, use [private
reporting](SECURITY.md). Never attach real feed URLs, OPML exports, credentials,
logs, or browser snapshots; reproduce problems with synthetic content.

Use the toolchain and tasks in `mise.toml`. Start with the development
instructions in [README.md](README.md). Keep browser-local storage formats,
HTTP/NDJSON contracts, feed safety controls, and the existing visual design.
[TECHNICAL.md](TECHNICAL.md) describes the architecture and boundaries.

For executable defects, first add the smallest failing regression at an existing
seam. Run affected tests while iterating and `mise run verify` before a
release. The full gate needs Python 3, Docker/Buildx, and Playwright's Chromium
dependencies. Use exact diff review and link checks for documentation changes.
Avoid tests that merely assert source text or duplicate the implementation.

Release metadata is synchronized with `pnpm version:check`. Maintainers bump
release-worthy changes once with `pnpm version:bump patch` (or the appropriate
SemVer component) after implementation stabilizes. Do not bump for documentation
or test-only changes.

In the pull request, describe what changed, why, and how it was verified.
Keep unrelated formatting and dependency changes separate. Contributions remain
under the project's [MIT license](LICENSE).
