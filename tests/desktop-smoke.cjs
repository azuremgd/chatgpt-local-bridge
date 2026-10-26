// Executes the actual main.cjs (or packaged executable), not a substitute window.
const {_electron}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {removeFixture}=require('./fixtures.cjs');
const {minimalEnvironment}=require('../installation.cjs');

(async()=>{
  const runtime=path.join(os.homedir(),'bridge-test-'+randomUUID());
  const packaged=process.argv[2];
  let application;
  try {
    application=await _electron.launch({
      executablePath:packaged ? path.resolve(packaged) : require('electron'),
      args:packaged ? [] : [path.resolve(__dirname,'..')],
      env:{...minimalEnvironment(),DEVSPACE_BRIDGE_HOME:runtime},timeout:30000
    });
    const window=await application.firstWindow();
    await window.waitForFunction(()=>document.querySelector('#primary-action')?.disabled);
    assert.equal(await window.locator('[data-action="openGuide"]').isEnabled(),true);
    assert.equal(fs.existsSync(path.join(runtime,'state','console','crashes')),true);
    assert.equal(fs.existsSync(path.join(runtime,'config','auth.json')),false);
    assert.equal(await application.evaluate(({app})=>app.getPath('userData')),path.join(runtime,'state','console'));
    // Exercise native-confirmation cancellation via the real IPC/main handler.
    await application.evaluate(({dialog})=>{
      globalThis.bridgeTestDialogs=[];
      dialog.showMessageBox=async(_window,options)=>{globalThis.bridgeTestDialogs.push(options);return {response:1};};
    });
    const response=await window.evaluate(()=>window.consoleAPI.invoke('start'));
    assert.equal(response.ok,true);
    const dialogs=await application.evaluate(()=>globalThis.bridgeTestDialogs);
    assert.equal(dialogs.length,1);
    assert.match(dialogs[0].detail,/Shell/);
    assert.match(dialogs[0].detail,/Cloudflare/);
    assert.equal(fs.existsSync(path.join(runtime,'state','shell-consent.json')),false);
    await window.locator('[data-page="settings"]').click();
    assert.equal(await window.locator('[data-action="revokeOAuth"]').count(),1);
    console.log(`Desktop startup: PASS (${packaged?'packaged executable':'source main'}; fresh private runtime; no credentials or services)`);
  } finally {
    if(application) {
      await application.evaluate(({app})=>app.exit(0)).catch(()=>{});
      await application.close().catch(()=>{});
    }
    if(fs.existsSync(runtime)) removeFixture(runtime);
  }
})().catch(()=>{console.error('Desktop startup smoke: FAIL. No private UI state was printed.');process.exitCode=1;});
