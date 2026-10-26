const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
const {secureRuntime}=require('../runtime-security.cjs');
const {runtimeHome,loadSettings,assertDevSpaceVersion,minimalEnvironment}=require('../installation.cjs');

function revokeDatabase(filename,Database) {
  const db=new Database(filename,{fileMustExist:true,timeout:1000});
  try {
    db.pragma('foreign_keys = ON');
    const result=db.transaction(()=>({
      accessTokens:db.prepare('DELETE FROM oauth_access_tokens').run().changes,
      refreshTokens:db.prepare('DELETE FROM oauth_refresh_tokens').run().changes,
      clients:db.prepare('DELETE FROM oauth_clients').run().changes
    })).immediate();
    // Do not retain valid-token backups or delete unrelated DevSpace tables.
    db.pragma('wal_checkpoint(TRUNCATE)');
    return result;
  } finally {db.close();}
}

async function revokeRuntime(runtime) {
  secureRuntime(runtime);
  const settings=loadSettings(runtime);
  assertDevSpaceVersion(settings.devspaceCliPath);
  const config=JSON.parse(fs.readFileSync(path.join(runtime,'config','config.json'),'utf8'));
  const state=path.join(runtime,'state','devspace');
  if (typeof config.stateDir!=='string' || path.resolve(config.stateDir).toLowerCase()!==state.toLowerCase()) throw Error('State directory does not match this runtime.');
  if (!Number.isInteger(config.port)||config.port<1024||config.port>65535) throw Error('Invalid local port.');
  const lock=path.join(runtime,'state','oauth-maintenance.lock');
  const fd=fs.openSync(lock,'wx');
  const reservation=net.createServer();
  try {
    await new Promise((resolve,reject)=>{reservation.once('error',()=>reject(Error('Stop DevSpace first: its local port is occupied.')));reservation.listen({host:'127.0.0.1',port:config.port,exclusive:true},resolve);});
    // Stop all DevSpace serve processes first, including those not listening yet.
    // Conservatively reject another installation rather than killing it.
    const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
    const status=execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',
      "$ErrorActionPreference='Stop'; $running=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|devspace)(\\.exe)?$' -and ($_.Name -match '^devspace' -or $_.CommandLine -match '(?i)[\\\\/]devspace[\\\\/]dist[\\\\/]cli\\.js(?:[\\s\"\x27]|$)') }); if($running.Count){'running'}else{'stopped'}"],
    {windowsHide:true,encoding:'utf8',timeout:15000,env:minimalEnvironment()}).trim();
    if(status!=='stopped') throw Error('Stop all DevSpace serve processes before revoking OAuth. No external process was stopped.');
    secureRuntime(runtime);
    const filename=path.join(state,'devspace.sqlite');
    if(!fs.existsSync(filename)) return {accessTokens:0,refreshTokens:0,clients:0};
    return revokeDatabase(filename,createRequire(settings.devspaceCliPath)('better-sqlite3'));
  } finally {
    if(reservation.listening) await new Promise(resolve=>reservation.close(resolve));
    fs.closeSync(fd);fs.unlinkSync(lock);
  }
}
if(require.main===module) {
  if(process.argv[2]!=='--all') {console.error('Explicit --all required. This revokes every OAuth client in the selected runtime.');process.exitCode=1;}
  else revokeRuntime(runtimeHome()).then(result=>console.log(JSON.stringify(result))).catch(()=>{
    console.error('OAuth revocation failed. Stop all DevSpace processes and check runtime permissions, version, port and maintenance lock. No success is claimed.');process.exitCode=1;
  });
}
module.exports={revokeDatabase,revokeRuntime};
