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
compatibility option. Metrics are unavailable in production until a private
bearer token is configured and should also be restricted at ingress.

Feed progress and retries use the same destination checks, cancellation, and
timeout budgets as initial retrieval. A visible failure is not a reason to
enable private-network access. Browser test fixtures block external traffic and
service workers; passing those tests does not establish production ingress or
service-worker security. See the [verification scope](TECHNICAL.md#testing).

See [DEPLOYMENT.md](DEPLOYMENT.md) for hardened hosting and
[TECHNICAL.md](TECHNICAL.md) for the application's security boundaries.
