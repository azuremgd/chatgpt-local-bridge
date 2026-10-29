const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell, clipboard, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { Service } = require('./service.cjs');
const { runtimeHome } = require('./installation.cjs');
const { secureRuntime } = require('./runtime-security.cjs');

const runtime = runtimeHome();
try { secureRuntime(runtime, true); }
catch (error) { dialog.showErrorBox('ChatGPT 本地桥安全检查未通过', error.message); app.exit(1); }
const appState = path.join(runtime, 'state', 'console');
fs.mkdirSync(appState, { recursive: true });
fs.mkdirSync(path.join(appState, 'crashes'), { recursive: true });
app.setPath('userData', appState);
app.setPath('crashDumps', path.join(appState, 'crashes'));
app.setAppUserModelId('DevSpaceBridge.Console');
let window, tray, service, quitting = false, quittingNow = false;
const indexUrl = pathToFileURL(path.join(__dirname, 'ui', 'index.html')).href;
const iconPath = path.join(__dirname, 'assets', 'icon.png');
const singleton = app.requestSingleInstanceLock();
if (!singleton) app.quit();
else {
  app.on('second-instance', () => show());
  app.whenReady().then(async () => {
    service = new Service(runtime);
    window = new BrowserWindow({ width: 1240, height: 860, minWidth: 1000, minHeight: 720,
      title: 'ChatGPT Local Bridge', icon: iconPath, backgroundColor: '#f6f7f8', show: false,
      autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
    });
    window.setMenu(null);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (url !== indexUrl) event.preventDefault(); });
    window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
    window.once('ready-to-show', () => window.show());
    await window.loadFile(path.join(__dirname, 'ui', 'index.html'));
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 }));
    tray.on('double-click', show); tray.on('click', show);
    updateTray();
    service.on('change', () => {
      if (window && !window.isDestroyed()) window.webContents.send('console:state', service.snapshot());
      updateTray();
    });
    await service.initialize();
    powerMonitor.on('resume', () => { service.log('info', '电脑已唤醒，正在重新检查连接。'); service.poll().then(() => service.diagnose()).catch(() => {}); });
    if (service.local?.ok) service.diagnose().catch(() => {});
  }).catch(error => { dialog.showErrorBox('ChatGPT 本地桥无法启动', error.message); quitting = true; app.quit(); });
}
function show() { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } }
function updateTray() {
  if (!tray || !service) return;
  const s = service.snapshot();
  tray.setToolTip('ChatGPT 本地桥 · ' + (s.summary?.title || '等待配置'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开控制台', click: show },
    { label: s.summary?.title || '等待配置', enabled: false }, { type: 'separator' },
    { label: '启动连接', enabled: !s.busy && !s.managed && !s.external, click: () => invoke('start').catch(notifyError) },
    { label: '停止连接', enabled: !s.busy && s.managed, click: () => invoke('stop').catch(notifyError) },
    { type: 'separator' }, { label: '退出控制台', click: () => quit() }
  ]));
}
function notifyError(error) { show(); dialog.showErrorBox('操作未完成', error.message); }
async function confirm(message, detail, accept) {
  const result = await dialog.showMessageBox(window, { type: 'question', title: 'ChatGPT 本地桥', message, detail, buttons: [accept, '取消'], defaultId: 1, cancelId: 1, noLink: true });
  return result.response === 0;
}
async function quit() {
  if (quittingNow) return;
  if (service?.snapshot().managed && !await confirm('退出并停止连接？', 'ChatGPT 将暂时无法访问本机项目。如果希望保持连接，请直接关闭窗口，控制台会留在托盘。', '停止并退出')) return;
  quittingNow = true;
  try { if (service) await service.dispose(); } catch (e) { quittingNow = false; notifyError(e); return; }
  quitting = true; tray?.destroy(); app.quit();
}
app.on('before-quit', event => { if (!quitting) { event.preventDefault(); quit(); } });
app.on('window-all-closed', () => {});
app.on('activate', show);

async function invoke(command, payload) {
  if (!service) throw Error('控制台正在初始化，请稍后。');
  if (['start','restart'].includes(command) && !service.shellRiskAccepted()) {
    if (!await confirm('允许网页端使用此 Windows 账户的 Shell 权限？',
      '项目白名单约束文件工具，不是 Shell 沙箱。Shell 可以读写当前 Windows 账户能访问的文件，包括账户自身的凭证。\n\n工具请求、返回的文件内容和命令输出会经 Cloudflare 传给 ChatGPT；不会因此自动上传整个项目。建议使用独立普通账户与系统权限限制。\n\n仅在你理解并接受这些权限时继续。本次确认会保存在本机。', '理解并继续')) return service.snapshot();
    service.acknowledgeShellRisk();
  }
  switch (command) {
    case 'state': return service.snapshot();
    case 'refresh': await service.inspect(); await service.poll(); break;
    case 'diagnose': await service.diagnose(); break;
    case 'start': await service.start(); setTimeout(() => service.diagnose().catch(() => {}), 2500); break;
    case 'stop': if (await confirm('停止网页端连接？', '正在进行的工具调用可能中断。你可以随时重新启动。', '停止连接')) await service.stop(); break;
    case 'revokeOAuth': if (await confirm('撤销所有网页客户端授权？','将停止本控制台管理的连接，并清除全部 OAuth 访问令牌、刷新令牌和客户端注册。保留项目文件、Owner Password 和其他会话数据。随后需要在 ChatGPT 中重新添加并授权。若另一个 DevSpace 正在运行，操作会拒绝继续。','停止并撤销')) await service.revokeOAuth(); break;
    case 'restart': if (await confirm('应用配置并重启连接？', '服务会短暂断开，随后自动重新连接。', '应用并重启')) { await service.restart(); setTimeout(() => service.diagnose().catch(() => {}), 2500); } break;
    case 'takeover': throw Error('请在原启动器停止外部服务，再点击重新检测。控制台只停止自己启动的进程。');
    case 'addRoot': {
      const result = await dialog.showOpenDialog(window, { title: '选择要授权的项目文件夹', properties: ['openDirectory'], buttonLabel: '选择此目录' });
      if (!result.canceled && result.filePaths[0] && await confirm('授权这个项目目录？', result.filePaths[0] + '\n\n将允许网页端访问此目录及子目录。DevSpace 的 shell 权限由当前 Windows 用户决定，目录白名单不等同于 shell 沙箱。', '确认授权')) await service.addRoot(result.filePaths[0]);
      break;
    }
    case 'removeRoot': {
      if (typeof payload !== 'string' || !service.config().allowedRoots.includes(payload)) throw Error('请选择已授权的目录。');
      if (await confirm('移除这个目录的授权？', payload + '\n\n文件会保留。运行中的服务需要重启才能停止使用这项授权。', '移除授权')) await service.removeRoot(payload);
      break;
    }
    case 'openRoot': {
      if (typeof payload !== 'string' || !service.config().allowedRoots.includes(payload)) throw Error('请选择已授权的目录。');
      const error = await shell.openPath(payload); if (error) throw Error(error); break;
    }
    case 'openLogs': { const error = await shell.openPath(service.logsDir); if (error) throw Error(error); break; }
    case 'openRuntime': { const error = await shell.openPath(runtime); if (error) throw Error(error); break; }
    case 'openGuide': { const error = await shell.openPath(path.join(__dirname, 'docs', 'SETUP.md')); if (error) throw Error(error); break; }
    case 'copyEndpoint': clipboard.writeText(service.snapshot().mcpUrl); return { copied: true };
    case 'recovery': if (typeof payload !== 'boolean') throw Error('无效设置。'); service.setRecovery(payload); break;
    case 'quit': await quit(); return null;
    default: throw Error('不支持的操作。');
  }
  return service.snapshot();
}
ipcMain.handle('console:invoke', async (event, command, payload) => {
  if (event.senderFrame?.url !== indexUrl || event.sender !== window?.webContents) return { ok: false, error: '不受信任的请求来源。' };
  try { return { ok: true, data: await invoke(command, payload) }; }
  catch (error) { service?.log('error', error.message); return { ok: false, error: error.message }; }
});
