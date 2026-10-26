# Third-party components

This repository is an independent console and integration layer. It does not vendor DevSpace or cloudflared source, binaries, configuration or credentials.

| Component | Role | License / upstream |
| --- | --- | --- |
| DevSpace 1.0.8 | Separately installed MCP server | MIT; copyright 2026 Waishnav; [upstream](https://github.com/Waishnav/devspace), [license](https://github.com/Waishnav/devspace/blob/main/LICENSE) |
| cloudflared | Separately installed tunnel connector | Apache-2.0; [upstream](https://github.com/cloudflare/cloudflared) |
| Electron 45.0.0 | Development dependency; runtime copied into local builds | MIT plus bundled Chromium/Node notices; [upstream](https://github.com/electron/electron) |
| Node.js | Separately installed DevSpace runtime | Node.js license and bundled notices; [upstream](https://github.com/nodejs/node) |
| Git for Windows / Git Bash | Separately installed shell tools | GPL and component licenses; [upstream](https://gitforwindows.org/) |

The packaging script preserves Electron's LICENSE and LICENSES.chromium.html files. Keep them with any distributed application. Consult each upstream distribution for the complete applicable notices. Product names belong to their respective owners; no affiliation or endorsement is implied.

The app icon was created for this console with AI assistance and refined for local Windows use. It is not a vendor logo. Only the final PNG/ICO assets are included, without prompts, workstation screenshots or image text/EXIF metadata.
