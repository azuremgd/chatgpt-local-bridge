const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {windowsPowerShellEnvironment}=require('../installation.cjs');
const {runtimeFixture,removeFixture}=require('./fixtures.cjs');
const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
let started=Date.now();
execFileSync(powershell,['-NoProfile','-NonInteractive','-Command','[Console]::WriteLine(1)'],{encoding:'utf8',windowsHide:true,timeout:30000,env:windowsPowerShellEnvironment()});
console.log('Native PowerShell startup milliseconds: '+(Date.now()-started));
started=Date.now();
const runtime=runtimeFixture();
try {console.log('Private runtime initialization milliseconds: '+(Date.now()-started));}
finally {removeFixture(runtime);}
