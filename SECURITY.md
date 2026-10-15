# Security

Please report vulnerabilities privately using [GitHub's vulnerability reporting
form](https://github.com/astrazds/thedailyfeed/security/advisories/new).
If private reporting is temporarily unavailable, ask the maintainer to enable
it without posting vulnerability details in a public issue.

Include the affected commit or release, expected behavior, impact, and a minimal
reproduction using synthetic data. Never send working credentials, private feed
URLs, complete environments, browser subscriptions, or captured article bodies.
Only test instances and feed endpoints you own or have permission to assess.
There is no guaranteed response time or paid bounty program.

Security fixes target the latest release. Self-hosters should review updates and
run behind a trusted HTTPS reverse proxy with rate and request-body limits.
Keep `ALLOW_PRIVATE_NETWORKS=false`; it is an SSRF escape hatch, not a routine
compatibility option. Article HTML drops localhost and private IP literals in
image and link destinations. The Expo web adapter runs DOMPurify before
normalization and bounded React Native HTML rendering. A missing DOM returns
empty markup.
Metrics are unavailable in production until a private bearer token is
configured and should also be restricted at ingress.

Feed progress and retries use the same destination checks, cancellation, and
timeout budgets as initial retrieval. A visible failure is not a reason to
enable private-network access. Reader and manager browser fixtures block external
traffic and service workers. A separate production runtime check enables the
worker and verifies offline shell loading and the absence of cached API responses.
Neither test establishes production ingress security. See the [verification scope](TECHNICAL.md#testing).

## Mobile dependency advisory review

The 15 October 2026 review traced 23 npm package findings to three advisories.
Most findings were parent packages inheriting an affected dependency.

| Dependency | Affected use in this project | Disposition |
| --- | --- | --- |
| [`uuid`](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Xcode project generation uses only `v4()` without an output buffer. The advisory affects buffered `v3()`, `v5()`, and `v6()` calls. | Override `xcode@3.0.1` to use `uuid@11.1.1`. Its CommonJS `v4()` API remains compatible. |
| [`braces`](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Metro's file watchers match repository files against configuration-derived glob patterns. Feed and article input does not supply these patterns. | No patched release was available. Retain the toolchain dependency and recheck upstream releases. |
| [`node-forge`](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Expo development code signing uses certificate and signature verification. Native signing utilities also parse certificates. The web reader has no Expo update-signing configuration. | No patched release was available. Retain the toolchain dependency and recheck upstream releases. |

The reviewed browser export's source map contained none of these three packages,
and the production container's installed package inventory contained none of them.
Expo's Metro module loader is included in the browser bundle, but its affected
CLI signing dependencies are not. This assessment covers these advisory paths,
not every dependency or future toolchain configuration.

The scoped UUID override removed all seven moderate package findings. Sixteen
high findings remained from `braces` and `node-forge`. Xcode ID generation and a
synthetic project serialization round trip passed before and after the override.
Recheck with `npm audit --prefix mobile` and `npm ls --prefix mobile --all` after
toolchain updates. npm's proposed Expo 44 and React Native 0.72 downgrades are
incompatible with this project's supported toolchain.

See [DEPLOYMENT.md](DEPLOYMENT.md) for hardened hosting and
[TECHNICAL.md](TECHNICAL.md) for the application's security boundaries.
