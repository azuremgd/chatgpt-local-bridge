# Privacy and publication review

The source repository should contain application code, synthetic examples, tests, documentation, the lockfile and reviewed icon assets only.

## What stays local and what crosses the network

The console reads the current machine name and configured project paths for its local display. Local runtime configuration, OAuth state and console logs stay in the runtime unless another program or user copies them. The console adds no telemetry, analytics or automatic log upload.

Remote MCP use is a network data flow: **ChatGPT → Cloudflare HTTPS endpoint → Tunnel → DevSpace**, with tool results returning along that route. Tool arguments, requested file contents, directory names, command output and error details may therefore be processed by Cloudflare and ChatGPT under their respective terms and settings. Cloudflare terminates public HTTPS; this is not an end-to-end encrypted link that hides payloads from Cloudflare. Authorizing a folder does not itself upload the entire folder, but authorized file and Shell operations can transmit its contents or other data accessible to the Windows account. Owner Password is submitted to the DevSpace OAuth page through this same public route; do not put it in chat.

Diagnostics contact configured local/public health and OAuth endpoints. Launching cloudflared connects to Cloudflare. Installing dependencies and downloading updates manually also contacts their distributors. An independent ordinary Windows account narrows access but can still read its own service credentials; it is not a complete containment boundary.

Raw subprocess logs can contain sensitive paths or output. Each DevSpace/tunnel log is capped at 1 MiB (further output is discarded until the next process launch), with up to ten logs retained per service. Console events retain the last 200 entries. Existing matching logs are pruned at the next launch; unrelated files are not removed. No remote log-upload feature is provided.

Project contents, full paths, usernames, computer names, real domains, tunnel UUIDs, credentials and runtime databases are not necessary to distribute this source. Screenshots can reveal these even when the source is clean. Do not upload a screenshot of a live installation as a demo.

## Repository exclusions

`.gitignore` excludes runtime directories, auth/config files, logs, databases, private keys, node_modules and build output. The packaging script uses an explicit source list. These measures are safeguards, not guarantees: `git add -f`, an unusual filename, a manual ZIP or a historical commit can bypass them.

`npm run privacy` scans **indexed bytes**, not just the current working copy. Its built-in rules detect known credential patterns, sensitive filenames and PNG text/EXIF metadata. For local review you can additionally set `BRIDGE_PRIVACY_DENY_JSON` to a JSON array of exact private identifiers to reject; the scanner never prints those values. Do not commit that variable or its contents.

## Before sharing or changing repository visibility

1. Review `git diff --cached`, `git ls-files` and every binary asset.
2. Run `npm test` and `npm run privacy` with the intended files staged.
3. Review the full commit history, author/committer names and emails, branches and tags.
   Run a full-history secret scan such as `gitleaks git --redact --no-banner .`; also scan the intended staged/working changes. Scanners supplement manual privacy review and can miss identifiers or custom credentials. Keep any reports local and redacted.
4. Check remote visibility, collaborators, Actions logs/artifacts, releases and issue attachments.
5. Do not publish local setup output or service logs; create synthetic examples instead.

A private repository is still stored on GitHub and visible to authorized collaborators. Repository owner/account identity remains visible on GitHub; neutral commit metadata does not make the repository anonymous. This project does not change visibility on its own. The owner must explicitly review and make that change.

If a credential is ever pushed, rotate/revoke it at the provider immediately. Deleting the file from the latest commit does not remove it from history or clones.
