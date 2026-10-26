const {app,BrowserWindow,ipcMain} = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const testHome = process.env.DEVSPACE_BRIDGE_UI_TEST_HOME;
if (!testHome || !path.isAbsolute(testHome) || !fs.existsSync(testHome)) throw Error('Set DEVSPACE_BRIDGE_UI_TEST_HOME to a newly created temporary directory; remove it after the test exits.');
app.setPath('userData',testHome);
let window;
const result = {ok:true,status:200,at:Date.now(),ms:1};
const state = {
  host:'example-computer',runtime:'D:\\ExampleRuntime',configPath:'D:\\ExampleRuntime\\config\\config.json',
  publicUrl:'https://devspace.example.com',mcpUrl:'https://devspace.example.com/mcp',localUrl:'http://127.0.0.1:17676',tunnelName:'example-tunnel',
  roots:[{path:'D:\\Projects\\sample',exists:true,active:true}],pending:false,activeKnown:true,busy:null,checking:false,desired:true,managed:true,external:false,
  devspacePid:1,tunnelPid:2,local:result,remote:{health:result,oauth:result,auth:{...result,status:401},checkedAt:Date.now()},doctor:{ok:true,text:'Synthetic test result',at:Date.now()},startedAt:Date.now(),
  summary:{tone:'good',title:'连接已就绪',detail:'Synthetic fixture; no network requests.'},settings:{autoRecover:true},events:[],version:'0.1.0'
};
const commands=[];
ipcMain.handle('console:invoke',(_event,command)=>{commands.push(command);return {ok:true,data:command==='copyEndpoint'?{copied:true}:state};});
app.whenReady().then(async()=>{
  const errors=[];
  window=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'..','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  await window.loadFile(path.join(__dirname,'..','ui','index.html'));
  const evaluate=code=>window.webContents.executeJavaScript(code);
  await new Promise(r=>setTimeout(r,150));
  assert.equal(await evaluate('document.getElementById("status-title").textContent'),'连接已就绪');
  assert.equal(await evaluate('document.getElementById("service-local-address").textContent'),'127.0.0.1:17676');
  await evaluate('document.querySelector("[data-page=workspaces]").click()');
  assert.equal(await evaluate('document.getElementById("page-workspaces").hidden'),false);
  assert.equal(await evaluate('document.querySelectorAll(".folder-row").length'),1);
  await evaluate('document.querySelector("[data-action=copyEndpoint]").click()');
  await new Promise(r=>setTimeout(r,30));
  assert.ok(commands.includes('copyEndpoint'));
  window.webContents.send('console:state',{fatal:'First-run setup required',events:[]});
  await new Promise(r=>setTimeout(r,30));
  assert.equal(await evaluate('document.getElementById("primary-action").disabled'),true);
  assert.equal(await evaluate('document.querySelector("[data-action=openGuide]").disabled'),false);
  assert.deepEqual(errors,[]);
  console.log('UI smoke: PASS (synthetic data only; no services, credentials or public connections)');
  window.destroy();app.exit(0);
}).catch(error=>{console.error(error.message);window?.destroy();app.exit(1);});
