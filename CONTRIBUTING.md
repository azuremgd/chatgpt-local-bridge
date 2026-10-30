# Contributing

## Reporting an issue

Check the [troubleshooting guide](docs/TROUBLESHOOTING.md) first. If the issue persists, include your Windows and Node.js versions, the console version, steps to reproduce, and the expected and actual behavior. Replace local paths and domains with placeholders, and review any diagnostic output before sharing it. Never attach passwords, tunnel credentials, OAuth state, or unredacted runtime logs. For security issues, follow [SECURITY.md](SECURITY.md).

## Development

Use Windows x64 and Node 24 LTS. Install dependencies with `npm ci`, run `npm test`, and stage only reviewed source files before `npm run privacy`.

Keep local domains, project roots, screenshots, setup credentials and runtime data outside the checkout. Use `example.com` and synthetic paths/UUIDs in fixtures. Do not add a hardcoded developer home path or a personal email address to examples or documentation.

Changes to DevSpace compatibility must update the version guard, schema, setup guide and tests together. Do not silently support a new schema by weakening validation. Preserve OAuth and loopback binding. Any change to shell authority or credential handling needs explicit security review.

CI runs tests and indexed-source privacy checks. It does not create tunnels, access a Cloudflare account, publish a package/release or change repository visibility. End-to-end web authorization remains a manual test using a disposable local installation.

Before a release, review the complete package contents, third-party licenses and advisories, and manually test startup, stop, tray restoration and OAuth with a clean Windows user account. Document limitations rather than marking unperformed tests as passed.
