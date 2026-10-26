const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {publicOrigin,minimalEnvironment,loadSettings,runtimeHome,windowsPowerShellEnvironment} = require('../installation.cjs');
const {validateRoot,doctorHealthy} = require('../core.cjs');
const {install,prepare} = require('../scripts/setup.cjs');
const {findings} = require('../scripts/privacy-check.cjs');
const {runtimeFixture,removeFixture} = require('./fixtures.cjs');

test('HTTPS origin rejects credentials, paths and wildcard hosts',()=>{
  assert.equal(publicOrigin('https://devspace.example.com/'),'https://devspace.example.com');
  for(const value of ['http://example.com','https://user:pass@example.com','https://example.com/mcp','https://example.com/?code=x','https://example.com/#x','https://*.example.com'])assert.throws(()=>publicOrigin(value));
});
test('doctor success requires its component checks, not only an exit code',()=>{
  const good='Node: v24.0.0 (supported >=20.12 <27)\nGit: git version 2.0\nBash shell: bash -c\nSQLite native dependency: ok\n';
  assert.equal(doctorHealthy(good),true);
  assert.equal(doctorHealthy(good.replace('dependency: ok','dependency: failed')),false);
  assert.equal(doctorHealthy(good+'Config status: invalid\n'),false);
  assert.equal(doctorHealthy(''),false);
});
test('child process environment does not forward parent provider or tunnel secrets',()=>{
  const env=minimalEnvironment({Path:'C:\\Windows',SystemRoot:'C:\\Windows',OPENAI_API_KEY:'synthetic',TUNNEL_TOKEN:'synthetic',AWS_SECRET_ACCESS_KEY:'synthetic',DEVSPACE_OAUTH_OWNER_TOKEN:'synthetic',NODE_OPTIONS:'--inspect'});
  assert.deepEqual(env,{PATH:'C:\\Windows',SystemRoot:'C:\\Windows'});
});

test('Windows PowerShell searches only its built-in module directory',()=>{
  const env=windowsPowerShellEnvironment({SystemRoot:'C:\\Windows',PSModulePath:'D:\\UntrustedModules',NODE_OPTIONS:'--inspect'});
  assert.equal(env.PSModulePath,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules');
  assert.equal(env.NODE_OPTIONS,undefined);
});
test('runtime defaults outside source; relative overrides rejected',()=>{
  assert.equal(runtimeHome({},'C:\\Users\\example'),path.resolve('C:\\Users\\example\\DevSpaceBridge'));
  assert.throws(()=>runtimeHome({DEVSPACE_BRIDGE_HOME:'relative'},'C:\\Users\\example'));
});
test('project roots cannot contain runtime credentials or resolve to UNC paths',()=>{
  assert.throws(()=>validateRoot('D:\\Bridge',[],'C:\\Users\\example',p=>p,['D:\\Bridge\\config']));
  assert.throws(()=>validateRoot('D:\\Link',[],'C:\\Users\\example',()=> '\\\\server\\share'));
  assert.equal(validateRoot('D:\\Bridge\\workspace',[],'C:\\Users\\example',p=>p,['D:\\Bridge\\config']),'D:\\Bridge\\workspace');
});
function setupFixture() {
  const temp=runtimeFixture();
  const runtime=path.join(temp,'runtime');
  fs.mkdirSync(path.join(temp,'devspace','dist'),{recursive:true});
  fs.writeFileSync(path.join(temp,'devspace','package.json'),JSON.stringify({name:'@waishnav/devspace',version:'1.0.8'}));
  const cli=path.join(temp,'devspace','dist','cli.js'); fs.writeFileSync(cli,'// fixture');
  const cf=path.join(temp,'cloudflared.exe'); fs.writeFileSync(cf,'fixture only');
  const cred=path.join(temp,'tunnel-credentials.json'); fs.writeFileSync(cred,'{}');
  return {temp,input:{runtime,publicUrl:'https://devspace.example.com',tunnelId:'00000000-0000-0000-0000-000000000000',port:17676,nodePath:process.execPath,devspaceCliPath:cli,cloudflaredPath:cf,bashDirectory:temp,credentialsFile:cred,ownerPassword:'synthetic-test-password-not-a-real-credential'}};
}
test('setup creates only isolated config, keeps native OAuth and refuses overwrite',()=>{
  const {temp,input}=setupFixture();
  try {
    const result=install(input,'C:\\Users\\example');
    assert.equal(JSON.stringify(result).includes(input.ownerPassword),false);
    const config=JSON.parse(fs.readFileSync(path.join(input.runtime,'config','config.json'),'utf8'));
    assert.deepEqual(config.allowedRoots,[path.join(input.runtime,'workspace')]);
    assert.equal(config.host,'127.0.0.1');
    assert.equal(config.subagents.enabled,false);
    const auth=JSON.parse(fs.readFileSync(path.join(input.runtime,'config','auth.json'),'utf8'));
    assert.equal(auth.ownerToken,input.ownerPassword);
    assert.equal(loadSettings(input.runtime).tunnelName,input.tunnelId);
    const tunnel=fs.readFileSync(path.join(input.runtime,'cloudflared','config.yml'),'utf8');
    assert.ok(tunnel.includes('service: http://127.0.0.1:17676'));
    assert.equal(tunnel.includes('path:'),false);
    assert.throws(()=>install(input,'C:\\Users\\example'),/already exists/);
    assert.equal(fs.readFileSync(input.credentialsFile,'utf8'),'{}');
  } finally {removeFixture(temp);}
});
test('setup rejects unsupported version and weak password before writing files',()=>{
  const {temp,input}=setupFixture();
  try {
    assert.throws(()=>prepare({...input,ownerPassword:'short'},'C:\\Users\\example'),/24/);
    fs.writeFileSync(path.join(temp,'devspace','package.json'),JSON.stringify({name:'@waishnav/devspace',version:'9.0.0'}));
    assert.throws(()=>prepare(input,'C:\\Users\\example'),/supports/);
    assert.equal(fs.existsSync(path.join(input.runtime,'config','auth.json')),false);
  } finally {removeFixture(temp);}
});
test('privacy checker rejects runtime files, synthetic secrets, local identifiers and PNG metadata',()=>{
  assert.ok(findings('config/auth.json',Buffer.from('{}')).length);
  assert.ok(findings('leak.txt',Buffer.from('gh'+'p_'+'x'.repeat(40))).length);
  assert.ok(findings('notes.md',Buffer.from('private-demo-host'),['private-demo-host']).length);
  const png=Buffer.alloc(20);png.write('tEXt',12,'ascii');
  assert.ok(findings('icon.png',png).length);
  assert.deepEqual(findings('examples/devspace.example.json',Buffer.from('{"publicBaseUrl":"https://devspace.example.com"}')),[]);
});
