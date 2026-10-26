const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {windowsPowerShellEnvironment}=require('../installation.cjs');
const {removeFixture}=require('./fixtures.cjs');
const {secureRuntime}=require('../runtime-security.cjs');
const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
let started=Date.now();
execFileSync(powershell,['-NoProfile','-NonInteractive','-Command','[Console]::WriteLine(1)'],{encoding:'utf8',windowsHide:true,timeout:30000,env:windowsPowerShellEnvironment()});
console.log('Native PowerShell startup milliseconds: '+(Date.now()-started));
started=Date.now();
const runtime=path.join(os.homedir(),'bridge-test-'+randomUUID());
try {
  secureRuntime(runtime,true);
  console.log('Private runtime initialization milliseconds: '+(Date.now()-started));
} catch(original) {
  // Trace only the synthetic fixture guard, never user configuration or auth.
  const quote=value=>"'"+value.replace(/'/g,"''")+"'";
  const root=path.resolve(__dirname,'..');
  const command=`Set-PSDebug -Trace 1; & ${quote(path.join(root,'scripts','RuntimeSecurity.ps1'))} -RuntimeDirectory ${quote(runtime)} -SourceDirectory ${quote(root)} -Mode Create`;
  try {console.log(execFileSync(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:45000,env:windowsPowerShellEnvironment()}).slice(-12000));}
  catch(trace){console.log(String(trace.stdout||'').slice(-12000));}
  throw original;
} finally {if(fs.existsSync(runtime)) removeFixture(runtime);}
