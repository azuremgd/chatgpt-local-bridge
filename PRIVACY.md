# Privacy and publication review

The source repository should contain application code, synthetic examples, tests, documentation, the lockfile and reviewed icon assets only.

## Local-only information

The application reads the current machine name and configured project paths to display them locally. It writes local service events and subprocess logs. It contacts only configured local/public health and OAuth endpoints during diagnostics, and cloudflared connects to Cloudflare when enabled. DevSpace handles the authorized MCP client's project operations. The console adds no telemetry, analytics or automatic log upload.

Project contents, full paths, usernames, computer names, real domains, tunnel UUIDs, credentials and runtime databases are not necessary to distribute this source. Screenshots can reveal these even when the source is clean. Do not upload a screenshot of a live installation as a demo.

## Repository exclusions

`.gitignore` excludes runtime directories, auth/config files, logs, databases, private keys, node_modules and build output. The packaging script uses an explicit source list. These measures are safeguards, not guarantees: `git add -f`, an unusual filename, a manual ZIP or a historical commit can bypass them.

`npm run privacy` scans **indexed bytes**, not just the current working copy. Its built-in rules detect known credential patterns, sensitive filenames and PNG text/EXIF metadata. For local review you can additionally set `BRIDGE_PRIVACY_DENY_JSON` to a JSON array of exact private identifiers to reject; the scanner never prints those values. Do not commit that variable or its contents.

## Before sharing or changing repository visibility

1. Review `git diff --cached`, `git ls-files` and every binary asset.
2. Run `npm test` and `npm run privacy` with the intended files staged.
3. Review the full commit history, author/committer names and emails, branches and tags.
4. Check remote visibility, collaborators, Actions logs/artifacts, releases and issue attachments.
5. Do not publish local setup output or service logs; create synthetic examples instead.

A private repository is still stored on GitHub and visible to authorized collaborators. Repository owner/account identity remains visible on GitHub; neutral commit metadata does not make the repository anonymous. This project does not change visibility on its own. The owner must explicitly review and make that change.

If a credential is ever pushed, rotate/revoke it at the provider immediately. Deleting the file from the latest commit does not remove it from history or clones.
