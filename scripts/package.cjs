const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Package on Windows x64.');
const dist = path.join(root, 'node_modules', 'electron', 'dist');
const suffix=process.argv[2] || '';
if(suffix && !/^[a-z0-9-]{1,40}$/.test(suffix)) throw Error('Build suffix must contain only lowercase letters, digits and hyphens.');
const destination = path.join(root, 'dist', `devspace-bridge-console-${require('../package.json').version}${suffix ? '-'+suffix : ''}-win32-x64`);
if (!fs.existsSync(path.join(dist, 'electron.exe'))) throw Error('Electron runtime missing. Run npm ci, then npm start once to finish its download.');
if (fs.existsSync(destination)) throw Error('Build output already exists. Move or remove the old dist output deliberately before rebuilding.');
fs.cpSync(dist, destination, {recursive:true});
fs.renameSync(path.join(destination, 'electron.exe'), path.join(destination, 'DevSpace Bridge Console.exe'));
if(fs.existsSync(path.join(destination,'electron_wer.dll'))) fs.renameSync(path.join(destination,'electron_wer.dll'),path.join(destination,'DevSpace Bridge Console_wer.dll'));
const resources = path.join(destination, 'resources', 'app');
fs.mkdirSync(path.join(resources, 'scripts'), {recursive:true});
for (const name of ['package.json','main.cjs','preload.cjs','core.cjs','service.cjs','installation.cjs','runtime-security.cjs','bounded-log.cjs','ui','assets','docs','LICENSE','THIRD_PARTY_NOTICES.md']) {
  fs.cpSync(path.join(root,name),path.join(resources,name),{recursive:true});
}
for (const name of ['Initialize-Bridge.ps1','setup.cjs','RuntimeSecurity.ps1','revoke-oauth.cjs']) fs.copyFileSync(path.join(root,'scripts',name),path.join(resources,'scripts',name));
fs.writeFileSync(path.join(destination,'Setup.ps1'), '& (Join-Path $PSScriptRoot "resources\\app\\scripts\\Initialize-Bridge.ps1") @args\r\n');
fs.writeFileSync(path.join(destination,'Create-Shortcut.ps1'), [
  '$ErrorActionPreference="Stop"',
  '$bridgeShell=New-Object -ComObject WScript.Shell',
  '$bridgeLink=$bridgeShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "DevSpace Bridge Console.lnk"))',
  '$bridgeLink.TargetPath=Join-Path $PSScriptRoot "DevSpace Bridge Console.exe"',
  '$bridgeLink.WorkingDirectory=$PSScriptRoot',
  '$bridgeLink.IconLocation=(Join-Path $PSScriptRoot "resources\\app\\assets\\icon.ico")+",0"',
  '$bridgeLink.Save()'
].join('\r\n'));
fs.copyFileSync(path.join(root,'README.md'),path.join(destination,'README.md'));
for(const name of ['docs','SECURITY.md','PRIVACY.md','LICENSE','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md']) fs.cpSync(path.join(root,name),path.join(destination,name),{recursive:true});
console.log('Built versioned Windows package. No runtime configuration or credential files were copied.');
