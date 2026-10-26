# Troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| First-run message | Run the setup script in an ordinary PowerShell window, then reopen the console. |
| Script or file cannot be found | Verify the complete actual path with `Test-Path`. Some packaged apps can virtualize AppData; use the dedicated ordinary user-profile runtime directory. Do not assume that a path seen by one app exists in another context. |
| Existing runtime refused | Setup will not overwrite credentials. Inspect the existing directory and choose a new dedicated runtime if necessary. |
| DevSpace version rejected | Version 1.0.8 is supported. Install separately and pass its CLI path; do not overwrite another working installation blindly. |
| Local port in use | Stop the existing service through its own launcher, or initialize with another port. The console does not kill external processes. |
| Git Bash missing | Supply the folder containing `bash.exe` with `-BashDirectory`. |
| SQLite native dependency failure | Check Node compatibility. Use the same external Node version used to install DevSpace. Diagnose first; rebuild/reinstall only the affected package if needed. |
| Tunnel running but public URL fails | Process existence is not tunnel health. Inspect cloudflared logs, DNS, tunnel UUID/credential path and internet connectivity. |
| OAuth metadata fails | Proxy every HTTP path, verify public origin and exact Host allowlist. Never fix this by disabling OAuth or using `*`. |
| MCP returns 401 | Expected before authentication. Complete OAuth in the web client. |
| Web client lost access | Check local/public diagnostics, then reconnect the app in ChatGPT and complete authorization if requested. |
| Window closed but service remains | Normal tray behavior. Open the console or use its tray menu; explicit quit stops owned services. |
| Retry limit reached | Inspect the failing service log, fix the cause, then stop and start again. Repeated crash loops are capped at three per ten minutes. |
| Permission label says pending | Restart the owned service to load changes. An external service's loaded roots cannot be inferred from a config file. |

Raw logs are private. Review and redact them locally before sharing. There is no support-bundle upload feature.
