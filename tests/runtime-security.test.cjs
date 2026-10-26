const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {install} = require('../scripts/setup.cjs');
const {secureRuntime} = require('../runtime-security.cjs');
const {runtimeFixture,removeFixture} = require('./fixtures.cjs');
const {execFileSync} = require('node:child_process');
const {Service}=require('../service.cjs');

test('error logging never follows a replaced state junction',()=>{
  const runtime=runtimeFixture(),outside=runtimeFixture();
  const service=new Service(runtime);
  const state=path.join(runtime,'state'),saved=path.join(runtime,'saved-state');
  try {
    fs.renameSync(state,saved);fs.symlinkSync(outside,state,'junction');
    service.log('error','synthetic security failure');
    assert.equal(fs.existsSync(path.join(outside,'console-events.json')),false);
    assert.ok(service.events.some(event=>event.message==='synthetic security failure'));
  } finally {fs.unlinkSync(state);removeFixture(runtime);removeFixture(outside);}
});

test('a deletable ancestor is rejected before creating a runtime',()=>{
  const parent=runtimeFixture();
  try {
    execFileSync('icacls.exe',[parent,'/grant','*S-1-1-0:D'],{stdio:'pipe'});
    const candidate=path.join(parent,'new-runtime');
    assert.throws(()=>secureRuntime(candidate,true),/ancestor/);
    assert.equal(fs.existsSync(candidate),false);
  } finally {removeFixture(parent);}
});

test('settings hardlink cannot overwrite a file outside the runtime',()=>{
  const runtime=runtimeFixture(),outside=runtimeFixture();
  const service=new Service(runtime),target=path.join(outside,'preserved.txt');
  try {
    fs.writeFileSync(target,'preserve');fs.linkSync(target,service.settingsFile);
    assert.throws(()=>service.setRecovery(false),/hard.link/i);
    assert.equal(fs.readFileSync(target,'utf8'),'preserve');
  } finally {removeFixture(runtime);removeFixture(outside);}
});

test('new private runtime remains usable; extra explicit ACE is rejected without alteration', () => {
  const runtime=runtimeFixture();
  try {
    secureRuntime(runtime);
    execFileSync('icacls.exe',[runtime,'/grant','*S-1-1-0:(OI)(CI)R'],{stdio:'pipe'});
    const before=execFileSync('icacls.exe',[runtime],{encoding:'utf8'});
    assert.throws(()=>secureRuntime(runtime,true),/ACL/);
    assert.equal(execFileSync('icacls.exe',[runtime],{encoding:'utf8'}),before);
  } finally {removeFixture(runtime);}
});

test('critical child junction and parent alias are rejected without writing through them', () => {
  const runtime=runtimeFixture(), outside=runtimeFixture();
  const link=path.join(runtime,'config');
  try {
    fs.symlinkSync(outside,link,'junction');
    assert.throws(()=>secureRuntime(runtime),/junction|link/);
    assert.throws(()=>secureRuntime(path.join(link,'nested'),true),/link/);
    assert.equal(fs.existsSync(path.join(outside,'nested')),false);
  } finally {fs.unlinkSync(link);removeFixture(runtime);removeFixture(outside);}
});

test('protected and ambiguous runtime paths are rejected',()=>{
  for(const candidate of [os.homedir(),path.parse(os.homedir()).root,path.join(os.homedir(),'AppData','unsafe'),path.join(os.homedir(),'trailing.'),'\\\\localhost\\share\\runtime',path.resolve(__dirname,'..')]) {
    assert.throws(()=>secureRuntime(candidate,true));
  }
});

test('direct setup rejects a pre-existing untrusted runtime before writing secrets', () => {
  const parent = fs.mkdtempSync(path.join(os.homedir(), 'bridge-security-test-'));
  const runtime = path.join(parent, 'runtime');
  fs.mkdirSync(runtime);
  fs.mkdirSync(path.join(parent, 'dist'));
  fs.writeFileSync(path.join(parent, 'package.json'), JSON.stringify({name:'@waishnav/devspace',version:'1.0.8'}));
  fs.writeFileSync(path.join(parent, 'dist', 'cli.js'), '');
  fs.writeFileSync(path.join(parent, 'credentials.json'), '{}');
  try {
    assert.throws(() => install({runtime, publicUrl:'https://devspace.example.com',
      tunnelId:'00000000-0000-0000-0000-000000000000',port:17676,
      nodePath:process.execPath,devspaceCliPath:path.join(parent,'dist','cli.js'),
      cloudflaredPath:process.execPath,bashDirectory:parent,credentialsFile:path.join(parent,'credentials.json'),
      ownerPassword:'synthetic-security-test-password'}), /runtime|permission|ACL/i);
    assert.equal(fs.existsSync(path.join(runtime, 'config', 'auth.json')), false);
  } finally {
    // Only the uniquely created fixture under the current home is removable.
    assert.equal(path.dirname(parent), os.homedir());
    fs.rmSync(parent, {recursive:true,force:true});
  }
});
