# AGENTS.md

> **North Star:** Choose the simplest, smallest design that safely meets the requirement.

## Mission and documentation

Maintain The Daily Feed, a self-hosted Next.js RSS reader that streams today's
items from browser-selected feeds. Keep the product small, local-first, and
safe around untrusted feed URLs, XML, and article HTML.

`README.md` covers product use and public interfaces. `TECHNICAL.md` is the
authority for application architecture and runtime contracts.
`DEPLOYMENT.md` is the production runbook. Documents describe boundaries and
procedures; they never grant permission for an external or production action.

## Workspace

- Edit `/mnt/srv1-astrazds/docker/thedailyfeed`, the CIFS mount of the SRV1
  directory. Before editing, require
  `findmnt -T /mnt/srv1-astrazds/docker/thedailyfeed` to show the underlying
  `cifs` row; an `autofs` trigger row alone is insufficient.
- Perform authoritative Git, permission, Docker, network, and runtime
  inspection over IPv4 SSH (`ssh -4 srv1.astrazds.net`) from
  `/home/astrazds/docker/thedailyfeed`. Do not treat another checkout or the
  workstation Docker engine as authoritative.
- The mount forces workstation ownership and modes. Do not repair apparent
  mode drift with workstation `chmod` or `chown`; inspect server-side metadata
  on SRV1 without displaying sensitive values.
- Inspect Git before and after work. Preserve unrelated tracked, untracked,
  ignored, secret, generated, and runtime state. Never stage files, add a
  remote, commit, push, deploy, or activate production unless the user asks
  for that exact action.

## Authorization

- Requests to review, diagnose, explain, or plan authorize inspection and
  reporting only. Do not edit files or mutate local, external, or production
  state.
- Requests to change, build, or fix authorize only the requested repository
  edits and relevant non-destructive offline validation.
- Require fresh action-time approval naming the exact effects before every Git
  commit or push; Docker or network lifecycle action; production probe,
  deployment, or activation; external feed request or browser flow; secret,
  token, or credential action; `ALLOW_PRIVATE_NETWORKS` change; destructive or
  costly operation; or recovery action.
- Historical evidence, a documented command, and prior approval are not
  standing authorization. Stop and report when an external, production,
  stateful, destructive, costly, or recovery effect was not approved exactly.

## Sensitive data and local state

- Treat `.env*`, metrics bearer credentials, feed URLs, OPML data,
  browser-local subscriptions, offline snapshots, logs, and captured feed
  content as sensitive. Keep real values out of source control, documentation,
  image layers, temporary archives, and command output.
- Inspect sensitive systems through the minimum metadata required: presence,
  mode, owner, count, length, status, or bounded identifiers. Never print
  credentials, complete environments, verbose headers, query strings, request
  or response bodies, OPML bodies, subscription lists, snapshot contents, or
  suspected leaked material.
- `METRICS_AUTH_TOKEN` is required to expose production metrics. Never put it
  in a URL, browser, source file, image layer, or log. Keep production metrics
  behind trusted ingress as defense in depth.
- `ALLOW_PRIVATE_NETWORKS` is a production SSRF escape hatch, not a routine
  compatibility switch. Keep it false unless a separately reviewed and
  explicitly approved private-feed requirement accepts the expanded boundary.

## Application and topology invariants

- Keep feed configuration, including subscriptions imported from OPML, and
  same-day offline snapshots in browser `localStorage`; OPML import/export
  remains client-side. Do not add an account, server-side subscription store,
  or cross-device synchronization incidentally. Server cache and metrics
  remain in-memory and process-local.
- Treat feed URLs, DNS answers, redirects, XML, and article HTML as untrusted.
  Preserve HTTP(S)-only validation, redirect revalidation, production SSRF
  blocking for non-global destinations, credential-safe URL logging, DOMPurify
  sanitization, DOM-aware truncation, and safe rendering.
- Preserve bounded outbound work: one per-attempt timeout across DNS,
  redirects, and response streaming; one aggregate feed or validation budget
  across retry delays and retries; one request-wide missing-feed budget;
  bounded concurrency; inbound cancellation; and bounded retry counts. Do not
  add unbounded retries, silent fallback, or a second fetch path.
- Preserve the `POST /api/feeds` JSON contract and progressive NDJSON stream
  contract (`meta`, `feed_result`, `done`, and terminal `error` chunks).
  Transport parsing remains a trust boundary, and stream responses must not be
  buffered by production ingress.
- Keep API responses `Cache-Control: no-store`. The service-worker runtime URL
  pattern matches only the feed-set pathname `/api/feeds` and remains
  `NetworkOnly`, with no cache options or network-timeout fallback; it must not
  match `/api/feeds/validate` or create an offline API response cache.
- Traefik or an equivalent trusted proxy owns public TLS, client-IP access
  logs, ingress rate limits, request-body limits, and edge timeouts. Keep
  metrics bearer authentication in the app. Do not expose the container
  directly to the public internet or publish a host port incidentally.
- On SRV1, keep the application router on `websecure` without router-level TLS
  keys. That entrypoint owns the unnamespaced `default` TLS option, Route 53
  ACME resolution, and the shared wildcard certificate.
- Preserve the non-root runtime, read-only root filesystem, dropped
  capabilities, `no-new-privileges`, resource/process limits, tmpfs scratch,
  bounded logs, health check, and sole external `traefik_proxy` network.

## Proportionate test-driven development

Use red-green-refactor when a focused automated test is the clearest and
cheapest proof of executable behavior. A failing regression test is required
for defects in reusable code, authentication or security boundaries,
request/response parsing, state transitions, retry or fallback behavior,
secret handling, and other failures likely to recur.

Match the proof to the change:

- For documentation, declarative configuration, pinned values, and routine
  operational changes, do not manufacture a unit test. Use exact diff review
  and the existing parser, typecheck, Compose render, dry-run, preflight, or
  focused runtime check that directly validates the change.
- For new executable behavior, start with the smallest affected test, implement
  the minimum change, and run only the impacted tests while iterating. Run the
  complete repository gate once the change is ready for commit or deployment.
- For exploratory provider behavior or failures visible only in production,
  diagnose first with bounded evidence. Add the smallest offline regression
  after the failure is understood; do not build speculative mocks beforehand.
- For a refactor already covered by suitable tests, establish a green baseline
  and preserve it. A new failing test is unnecessary unless behavior or
  coverage changes.

Keep the testing architecture smaller than the behavior it protects:

- Prefer extending an existing test or validator over creating another harness.
- Assert observable outcomes and durable safety invariants, not exact source
  text, documentation wording, internal command sequences, or third-party
  implementation details.
- Test each rule once at the lowest stable boundary. Duplicate it across unit,
  contract, rollout, and acceptance layers only when each layer catches a
  distinct failure mode.
- If the mocks, fixtures, or harness become larger or harder to understand than
  the change, choose a smaller seam or a more direct validation method.
- Do not create a permanent rollout framework for a one-time change.

Production acceptance is separate from unit testing. Run live, paid, browser,
network, authentication, or destructive checks only when the corresponding
boundary changed, and retain each repository's existing authorization,
fail-closed, and bounded-call requirements.

## Versioning

- Treat `package.json` as the sole release-version authority. Keep its stable
  `MAJOR.MINOR.PATCH` version synchronized with Compose's `APP_VERSION`
  fallback, README's current release, the technical-document version header,
  and the deployment-guide header and runtime-default table.
- Bump release-worthy user-visible behavior, runtime behavior, security fixes,
  compatible operational changes, and deployable dependency updates. Skip
  documentation-only, test-only, CI-only, agent-guidance, non-behavioral
  refactor, and unchanged-redeployment work.
- Use patch for fixes and compatible operational or dependency changes, minor
  for backward-compatible features, and major only for intentionally breaking
  changes with explicit approval. When several eligible changes ship together,
  apply the highest required component once.
- After implementation stabilizes but before the final repository gate, run
  `pnpm version:bump <patch|minor|major>` and include its synchronized edits in
  the same eventual commit. Run `pnpm version:check` to validate metadata
  without changing it.
- Stop on version drift instead of guessing or silently repairing it. CI
  enforces valid synchronized metadata only; release eligibility and bump size
  remain agent/reviewer judgments.
- Version automation grants no permission to stage, commit, tag, push,
  dispatch CI, deploy, or perform any other external or production action.

## Validation, deployment, and recovery

- The CIFS mount cannot reliably create package-manager symlinks. When
  dependencies are required for executable validation, copy the project to a
  fresh `/tmp/thedailyfeed-test.XXXXXX` directory and run pnpm there. Copy back
  only an explicitly requested, reviewed generated artifact.
- Use the smallest affected tests while iterating. Before an approved commit or
  deployment of executable work, run lint, TypeScript, tests, and the
  Next.js/PWA build in the fresh staging copy unless the task documents a
  narrower justified gate.
- For documentation-only work, use exact allowlisted diff review,
  `git diff --check`, relative-link validation, and static comparison with the
  source/configuration it describes. Do not run pnpm, builds, Compose
  lifecycle, external feed requests, browser flows, production probes, or
  deployment merely to validate documentation.
- Offline validation is not production activation. An approved deployment uses
  `scripts/deploy-compose.sh` so `APP_VERSION` and `APP_COMMIT` are populated,
  and recreates only `thedailyfeed`. Preserve the existing external
  `traefik_proxy` network and unrelated infrastructure. Do not use project-wide
  `down`, remove networks or volumes, prune images, or restart Traefik as part
  of a routine application deployment.
- An approved deployment may perform only the component-specific rollback
  named in its approval. Otherwise preserve the prior image, logs, browser
  data, and investigation evidence; stop and report until exact manual
  recovery effects are approved. Recovery must not weaken SSRF, metrics,
  ingress, container, or network controls.

## Forgejo CI and production dispatch

- CI jobs use the user-scoped `srv1-ci` runner pool. Each persistent runner
  executes one host-label job inside its own hardened runner container and
  talks only to its paired rootless BuildKit sidecar. Other than the runner's
  own read-only `token_url` credential file, jobs must never gain a host
  filesystem mount, host Docker socket, privileged mode, or production
  credential.
- `pull_request` remains enabled. An approved PR workflow can read the
  persistent host-executor runner token from inside its runner container; this
  accepted impersonation risk does not grant access to deployment secrets.
- Both CI and manual deployment call `scripts/verify-ci.sh` for the frozen
  install, lint, TypeScript, tests, Next/PWA gates, and one unpublished OCI
  artifact build through rootless BuildKit.
- `.forgejo/workflows/deploy-production.yml` is manual-only. Dispatch requires
  the `main` ref, the `main` choice, and exact `deploy-production`
  confirmation. It deploys only the dispatch event SHA through the restricted
  SSH forced command and performs only one public HTTPS `GET /` after the
  server-side deployment succeeds.
- Adding or rotating `SRV1_DEPLOY_KEY`, changing the tracked SRV1 host key,
  altering the forced command or its authorized key, dispatching production,
  probing the public route, or using the rollback tag requires fresh approval
  for that exact credential, deployment, probe, or recovery effect.
