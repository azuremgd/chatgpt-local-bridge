# Security model

This is remote development access to a Windows account, not a sandbox.

## Boundaries

- The Electron renderer has context isolation, sandboxing, no Node integration, a restrictive content security policy and no navigation/popups. IPC accepts only the expected local renderer and an explicit command set.
- No HTTP administration server is exposed. DevSpace listens only on loopback. Cloudflare proxies the complete DevSpace service so its built-in OAuth can work.
- Owner Password and OAuth remain enabled. The public origin must be HTTPS, with no embedded credentials, query, fragment or non-root path. Wildcard Host allowlists are rejected.
- An initial installation grants one empty test directory. Adding folders requires a native picker and confirmation. Disk roots, the user home, common sensitive directories, system directories, and console config/log/state directories are rejected. Real paths are checked to catch junctions into protected directories.
- File allowlists do **not** contain DevSpace shell commands. Shell commands can read/write anything the Windows account can access. Use a dedicated non-administrator account and OS permissions for a stronger boundary.
- The console stops only child processes it started. It detects external listeners but does not take ownership of or kill them.
- Child environments inherit a small allowlist of Windows runtime variables, not arbitrary API keys, provider credentials or tunnel tokens from the parent terminal.
- Runtime configuration and credentials are outside the source tree. Shared setup/startup guards reject elevated Windows tokens, protected paths, aliases, ancestor junctions and links in critical runtime trees. New runtime directories are created with a private DACL for the current user and SYSTEM; existing directories must already pass ownership and ACL checks and are never automatically repaired. A marker alone is insufficient. Launch, recovery, diagnostics and configuration writes recheck the runtime. This protects against other ordinary accounts; it does not protect against same-account malware, an administrator, or a same-account process racing validation and filesystem use.
- First launch requires a versioned, locally recorded Shell/data-flow acknowledgement. Cancelling does not start services. Automatic recovery also requires this acknowledgement. It is informed consent, not isolation.

## Credential handling

The Owner Password is stored in DevSpace 1.0.8's native local `auth.json` format. It is not encrypted by this console. The setup script accepts hidden input and sends it over stdin; it is not included in a process command line, repository file or application UI. Cloudflare credentials remain in their original local file and are referenced by path.

The console does not provide a credential viewer, export or automatic upload. Event messages apply best-effort redaction. Raw subprocess logs may still contain project paths or sensitive output. Treat the entire runtime directory as private.

## Limits and review

- A successful health probe or 401 is not proof of end-to-end OAuth login or a successful ChatGPT tool call.
- Revoking a folder takes effect after restarting the running DevSpace process. Stopping services only removes access while offline. **Changing Owner Password does not invalidate existing access or refresh tokens in DevSpace 1.0.8.** Use Settings → revoke all web authorizations, or the [offline revocation procedure](docs/REVOKE.md). It removes access tokens, refresh tokens and client registrations transactionally while retaining unrelated SQLite state. The old client must be re-added and explicitly authorized. This does not delete data already sent to a client or prevent a party who still knows the Owner Password from obtaining a new authorization.
- Auto recovery is bounded, not a guarantee of availability. Sleep, shutdown, network loss and a stopped console interrupt access.
- This release pins a known configuration contract to DevSpace 1.0.8. Review upstream security advisories before deployment. If a relevant vulnerability affects that version, stop exposing it until a reviewed supported upgrade is available.
- The application and package are unsigned source builds. No installer, auto updater or public release is generated automatically.

## Reporting

Do not post passwords, tunnel tokens, auth files, real project contents or unredacted logs in an Issue. If private vulnerability reporting is enabled for the repository, use it. Otherwise contact the maintainer through a private channel agreed with them. This repository does not embed personal contact details.
