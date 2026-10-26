const path = require('node:path');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {windowsPowerShellEnvironment} = require('./installation.cjs');

function secureRuntime(runtime, create = false) {
  if (process.platform !== 'win32') throw Error('Runtime security requires Windows.');
  if (typeof runtime !== 'string' || !/^[a-z]:[\\/]/i.test(runtime)) throw Error('Runtime requires a local absolute drive path.');
  // Refuse aliases (including DOS short names) rather than normalizing them into
  // an apparently safe path and losing evidence of a junction in an ancestor.
  let existing=path.resolve(runtime);
  const missing=[];
  while(!fs.existsSync(existing)) {
    const parent=path.dirname(existing);
    if(parent===existing) throw Error('Runtime drive is unavailable.');
    missing.unshift(path.basename(existing));existing=parent;
  }
  const canonical=path.join(fs.realpathSync.native(existing),...missing);
  if(canonical.toLowerCase()!==path.resolve(runtime).toLowerCase()) throw Error('Runtime path uses an alias, junction or symbolic link.');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    execFileSync(powershell, ['-NoProfile','-NonInteractive','-File',path.join(__dirname,'scripts','RuntimeSecurity.ps1'),
      '-RuntimeDirectory',runtime,'-SourceDirectory',__dirname,'-Mode',create ? 'Create' : 'Check'],
    {windowsHide:true,encoding:'utf8',timeout:30000,env:windowsPowerShellEnvironment(),stdio:['ignore','pipe','pipe']});
  } catch (error) {
    if(error.code==='ETIMEDOUT') throw Error('Runtime security check timed out; no permission check was bypassed.');
    // Do not return PowerShell's source/stack output, which may include private paths.
    const match = String(error.stderr || '').match(/BRIDGE_SECURITY: ([^\r\n]+)/);
    throw Error(match ? match[1] : 'Runtime security check failed. Use an ordinary Windows session and a new private directory.');
  }
  const pending=[path.resolve(runtime)];
  while(pending.length) {
    const directory=pending.pop();
    for(const name of fs.readdirSync(directory)) {
      const entry=path.join(directory,name),stat=fs.lstatSync(entry);
      if(stat.isSymbolicLink()) throw Error('Runtime contains a junction or symbolic link.');
      if(stat.isFile() && stat.nlink!==1) throw Error('Runtime contains a hard-linked file.');
      if(stat.isDirectory() && !(directory===path.resolve(runtime) && ['workspace','worktrees','disabled-agents'].includes(name.toLowerCase()))) pending.push(entry);
    }
  }
}
module.exports = {secureRuntime};
