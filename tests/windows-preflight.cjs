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
  const root=path.resolve(__dirname,'..');
  let instrumented=fs.readFileSync(path.join(root,'scripts','RuntimeSecurity.ps1'),'utf8');
  for(const [phase,needle] of [
    ['identity','$identity=[Security.Principal.WindowsIdentity]::GetCurrent()'],
    ['profile-registry','$profileDirectory=[Microsoft.Win32.Registry]::GetValue'],
    ['sensitive-paths',"$sensitive=@('AppData'"],
    ['ancestor-acl','$acl=[IO.Directory]::GetAccessControl($cursor)'],
    ['create-private','[IO.Directory]::CreateDirectory($runtimeFull,$privateAcl)'],
    ['verify-private','$acl=if($item.PSIsContainer)'],
    ['scan-children','$pending=[Collections.Generic.Stack[string]]::new()']
  ]) instrumented=instrumented.replace(needle,`[Console]::WriteLine('Guard phase: ${phase} '+[DateTime]::UtcNow.ToString('o'));\n${needle}`);
  const diagnostic=path.join(os.tmpdir(),'bridge-guard-trace-'+randomUUID()+'.ps1');
  fs.writeFileSync(diagnostic,instrumented,{flag:'wx'});
  try {
    console.log(execFileSync(powershell,['-NoProfile','-NonInteractive','-File',diagnostic,'-RuntimeDirectory',runtime,'-SourceDirectory',root,'-Mode','Create'],{encoding:'utf8',windowsHide:true,timeout:45000,env:windowsPowerShellEnvironment(),stdio:['ignore','pipe','pipe']}));
  } catch(trace){console.log('Guard trace: '+JSON.stringify({stdout:String(trace.stdout||'').slice(-4000),stderr:String(trace.stderr||'').slice(-1000)}));}
  finally {fs.unlinkSync(diagnostic);}
  throw original;
} finally {if(fs.existsSync(runtime)) removeFixture(runtime);}
