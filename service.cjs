const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const https = require('node:https');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { sameRoots, redact, summarize, validateRoot, doctorHealthy } = require('./core.cjs');
const { publicOrigin, loadSettings, assertDevSpaceVersion, minimalEnvironment, windowsPowerShellEnvironment } = require('./installation.cjs');
const { secureRuntime } = require('./runtime-security.cjs');
const { boundedLog } = require('./bounded-log.cjs');
const delay = ms => new Promise(r => setTimeout(r, ms));
const psQuote = s => "'" + s.replace(/'/g, "''") + "'";
const healthy = body => body?.ok === true && body?.name === 'devspace';

function probe(url, expected, parse) {
  const started = Date.now();
  return new Promise(resolve => {
    let finished = false;
    const done = result => { if (!finished) { finished = true; clearTimeout(timer); resolve({ ...result, at: Date.now(), ms: Date.now() - started }); } };
    const req = (url.startsWith('https:') ? https : http).get(url, { headers: { 'User-Agent': 'DevSpace-Console/1.0' } }, res => {
      let body = '';
      res.on('data', b => { body += b; if (body.length > 65536) req.destroy(Error('响应过大')); });
      res.on('end', () => {
        let ok = res.statusCode === expected;
        if (ok && parse) { try { ok = Boolean(parse(JSON.parse(body))); } catch { ok = false; } }
        done({ ok, status: res.statusCode, error: ok ? null : `HTTP ${res.statusCode} · 响应未通过检查` });
      });
    });
    const timer = setTimeout(() => req.destroy(Error('连接超时（8 秒）')), 8000);
    req.on('error', error => done({ ok: false, status: null, error: redact(error.message) }));
  });
}

class Service extends EventEmitter {
  constructor(runtime) {
    super();
    secureRuntime(runtime);
    this.runtime = runtime;
    this.home = os.homedir();
    this.configPath = path.join(runtime, 'config', 'config.json');
    const installation = loadSettings(runtime, true);
    this.node = installation.nodePath;
    this.cli = installation.devspaceCliPath;
    this.cf = installation.cloudflaredPath;
    this.bashDirectory = installation.bashDirectory;
    this.tunnelName = installation.tunnelName;
    this.tunnelConfig = path.join(runtime, 'cloudflared', 'config.yml');
    this.powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    this.logsDir = path.join(runtime, 'logs');
    fs.mkdirSync(this.logsDir, { recursive: true });
    fs.mkdirSync(path.join(runtime, 'state'), { recursive: true });
    this.children = {}; this.retries = { devspace: [], tunnel: [] }; this.retryTimers = new Set();
    this.activeRoots = []; this.desired = false; this.busy = null; this.checking = false;
    this.startedAt = null; this.local = null; this.remote = null; this.doctor = null;
    this.external = { devspace: null, tunnel: null, supervisors: [] }; this.events = [];
    this.polling = false; this.pollCount = 0; this.settings = { autoRecover: true };
    this.eventFile = path.join(runtime, 'state', 'console-events.json');
    this.settingsFile = path.join(runtime, 'state', 'console-settings.json');
    this.consentFile = path.join(runtime, 'state', 'shell-consent.json');
    try { this.events = JSON.parse(fs.readFileSync(this.eventFile, 'utf8')).slice(-200); } catch {}
    try { this.settings.autoRecover = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8')).autoRecover !== false; } catch {}
  }
  shellRiskAccepted() {
    try { return JSON.parse(fs.readFileSync(this.consentFile,'utf8')).version === 1; } catch { return false; }
  }
  acknowledgeShellRisk() {
    secureRuntime(this.runtime);
    fs.writeFileSync(this.consentFile,JSON.stringify({version:1,acceptedAt:new Date().toISOString()}));
  }
  config() {
    if (!fs.existsSync(this.configPath)) throw Error('请先在 PowerShell 中运行 scripts/Initialize-Bridge.ps1 完成首次配置，再重新打开控制台。点击使用说明查看步骤。');
    const value = JSON.parse(fs.readFileSync(this.configPath, 'utf8').replace(/^\uFEFF/, ''));
    if (!Array.isArray(value.allowedRoots) || !value.allowedRoots.length || value.allowedRoots.some(x => typeof x !== 'string' || !x)) throw Error('配置中缺少授权目录列表。');
    publicOrigin(value.publicBaseUrl);
    if (value.host !== '127.0.0.1' || !Number.isInteger(value.port) || value.port < 1024 || value.port > 65535) throw Error('服务必须监听 127.0.0.1，端口应为 1024–65535。');
    if (value.allowedHosts?.includes('*')) throw Error('不允许通配符 Host 白名单。');
    for (const [key,relative] of [['stateDir','state/devspace'],['worktreeRoot','worktrees'],['agentDir','disabled-agents']]) {
      if (typeof value[key]!=='string' || path.resolve(value[key]).toLowerCase()!==path.join(this.runtime,relative).toLowerCase()) throw Error('运行数据路径必须位于当前专用运行目录。');
    }
    return value;
  }
  localUrl() { return `http://127.0.0.1:${this.config().port}`; }
  protectedPaths() { return ['config', 'cloudflared', 'state', 'logs', 'bridge-settings.json'].map(p => path.join(this.runtime, p)); }
  log(level, message, source = 'system') {
    const event = { id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, time: Date.now(), level, message: redact(message).slice(0, 1200), source };
    this.events.push(event); this.events = this.events.slice(-200);
    // On a rejected runtime, keep the event in memory without following its paths.
    try { secureRuntime(this.runtime); fs.writeFileSync(this.eventFile, JSON.stringify(this.events)); } catch {}
    this.emit('change');
  }
  snapshot() {
    let c; try { c = this.config(); } catch (e) { return { fatal: e.message, events: this.events }; }
    const running = Boolean(this.children.devspace || this.external.devspace);
    const activeKnown = this.desired || this.activeRoots.length > 0;
    return {
      host: os.hostname(), runtime: this.runtime, configPath: this.configPath,
      localUrl: this.localUrl(), tunnelName: this.tunnelName,
      publicUrl: c.publicBaseUrl.replace(/\/$/, ''), mcpUrl: c.publicBaseUrl.replace(/\/$/, '') + '/mcp',
      roots: c.allowedRoots.map(root => ({ path: root, exists: fs.existsSync(root), active: running && activeKnown && this.activeRoots.some(x => x.toLowerCase() === root.toLowerCase()) })),
      pending: running && (!activeKnown || !sameRoots(this.activeRoots, c.allowedRoots)),
      activeKnown,
      busy: this.busy, checking: this.checking, desired: this.desired,
      managed: Boolean(this.children.devspace || this.children.tunnel || this.desired),
      external: Boolean(this.external.devspace || this.external.tunnel || this.external.supervisors.length),
      devspacePid: this.children.devspace?.pid || this.external.devspace,
      tunnelPid: this.children.tunnel?.pid || this.external.tunnel,
      local: this.local, remote: this.remote, doctor: this.doctor, startedAt: this.startedAt,
      summary: summarize(this.local, this.remote), settings: this.settings,
      events: this.events.slice(-100), version: require('./package.json').version
    };
  }
  async ps(command, timeout = 15000) {
    return exec(this.powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout, maxBuffer: 512 * 1024, encoding: 'utf8', env:windowsPowerShellEnvironment() });
  }
  async inspect() {
    if (this.desired || this.busy) return;
    const q = psQuote(this.tunnelConfig);
    const port = this.config().port;
    const { stdout } = await this.ps(`$ErrorActionPreference='Stop'; $d=@(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue); $t=@(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains(${q}) }); [pscustomobject]@{devspace=if($d.Count){$d[0].OwningProcess}else{$null};tunnel=if($t.Count){$t[0].ProcessId}else{$null};supervisors=@()} | ConvertTo-Json -Compress`);
    this.external = JSON.parse(stdout.trim());
    // External process configuration cannot be inferred from historical logs.
    this.activeRoots = [];
  }
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      this.local = await probe(this.localUrl() + '/healthz', 200, healthy);
      if (this.pollCount++ % 4 === 0) await this.inspect().catch(() => {});
      this.emit('change');
    } finally { this.polling = false; }
  }
  async initialize() {
    try { this.config(); } catch (e) { this.log('info', e.message); return; }
    await this.inspect().catch(e => this.log('warn', '运行状态读取失败：' + e.message));
    await this.poll();
    this.pollTimer = setInterval(() => this.poll().catch(() => {}), 5000);
    this.log('info', '控制台已打开，正在读取本机服务状态。');
  }
  async operation(name, fn) {
    if (this.busy) throw Error('上一项操作还在进行，请稍后。');
    this.busy = name; this.emit('change');
    try { return await fn(); } finally { this.busy = null; this.emit('change'); }
  }
  environment() {
    secureRuntime(this.runtime);
    const c = this.config();
    for (const root of c.allowedRoots) validateRoot(root, [], this.home, undefined, this.protectedPaths());
    const baseEnv = minimalEnvironment();
    const env = { ...baseEnv,
      PATH: this.bashDirectory + path.delimiter + (baseEnv.PATH || ''),
      DEVSPACE_CONFIG_DIR: path.dirname(this.configPath), HOST: '127.0.0.1', PORT: String(c.port),
      DEVSPACE_PUBLIC_BASE_URL: c.publicBaseUrl,
      DEVSPACE_ALLOWED_ROOTS: c.allowedRoots.join(','),
      DEVSPACE_ALLOWED_HOSTS: '127.0.0.1,localhost,::1,' + new URL(c.publicBaseUrl).hostname,
      DEVSPACE_SUBAGENTS: 'false', DEVSPACE_ARTIFACTS: 'false', DEVSPACE_SKILLS: 'false',
      DEVSPACE_WIDGETS: 'off', DEVSPACE_TOOL_MODE: 'minimal', DEVSPACE_LOG_SHELL_COMMANDS: 'false',
      DEVSPACE_LOG_REQUESTS: 'false', DEVSPACE_LOG_LEVEL: 'info', DEVSPACE_TRUST_PROXY: 'false'
    };
    delete env.DEVSPACE_OAUTH_OWNER_TOKEN;
    return env;
  }
  launch(name) {
    secureRuntime(this.runtime);
    if (!this.shellRiskAccepted()) throw Error('启动前请阅读并确认 Shell 权限与数据传输说明。');
    if (fs.existsSync(path.join(this.runtime,'state','oauth-maintenance.lock'))) throw Error('OAuth 授权撤销尚未完成，请先检查维护锁。');
    const isDev = name === 'devspace';
    const environment = isDev ? this.environment() : minimalEnvironment();
    if (isDev) this.activeRoots = environment.DEVSPACE_ALLOWED_ROOTS.split(',');
    const binary = isDev ? this.node : this.cf;
    const args = isDev ? [this.cli, 'serve'] : ['tunnel', '--config', this.tunnelConfig, 'run', this.tunnelName];
    const output = boundedLog(this.logsDir,name);
    output.on('error',()=>this.log('warn','服务日志写入失败；请检查磁盘空间与权限。',name));
    const child = spawn(binary, args, { cwd: path.join(this.runtime, 'workspace'), env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.children[name] = child;
    child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
    child.once('error', error => this.log('error', `启动失败：${error.message}`, name));
    child.once('close', (code, signal) => {
      output.end();
      if (this.children[name] !== child) return;
      delete this.children[name];
      this.log(this.desired ? 'warn' : 'info', `${isDev ? 'DevSpace' : '隧道'}已退出 · ${signal || '退出码 ' + code}`, name);
      if (this.desired && this.settings.autoRecover) {
        const now = Date.now();
        this.retries[name] = this.retries[name].filter(t => now - t < 600000);
        if (this.retries[name].length >= 3) { this.log('error', '10 分钟内连续退出，已暂停自动恢复。请检查日志后重新启动。', name); return; }
        this.retries[name].push(now);
        this.log('info', '将在 5 秒后尝试恢复。', name);
        const timer = setTimeout(() => {
          this.retryTimers.delete(timer);
          if (this.desired) { try { this.launch(name); } catch (error) { this.log('error', '自动恢复暂停：' + error.message, name); } }
        }, 5000);
        this.retryTimers.add(timer);
      }
      this.emit('change');
    });
    this.log('info', `${isDev ? 'DevSpace' : 'Cloudflare Tunnel'}已启动 · PID ${child.pid || '待确认'}`, name);
  }
  async startInternal() {
    if (this.desired) return;
    if (this.external.devspace || this.external.tunnel) throw Error('检测到外部进程，请在原启动器停止它，再重新检测。');
    for (const p of [this.node, this.cli, this.cf, this.tunnelConfig, path.join(this.runtime, 'config', 'auth.json')]) if (!p || !fs.existsSync(p)) throw Error('缺少运行文件，请完成首次配置。');
    assertDevSpaceVersion(this.cli);
    for (const root of this.config().allowedRoots) validateRoot(root, [], this.home, undefined, this.protectedPaths());
    const before = await probe(this.localUrl() + '/healthz', 200);
    if (before.ok) throw Error('本地端口已经被占用，请在原启动器停止服务。');
    this.desired = true; this.startedAt = Date.now(); this.activeRoots = this.config().allowedRoots.slice();
    this.retries = { devspace: [], tunnel: [] }; this.remote = null;
    this.launch('devspace');
    let ready = false;
    for (let i = 0; i < 12; i++) { await delay(500); this.local = await probe(this.localUrl() + '/healthz', 200, healthy); if (this.local.ok && this.children.devspace?.exitCode === null) { ready = true; break; } }
    if (!ready) { await this.stopInternal(); throw Error('DevSpace 未能启动，请查看服务日志。'); }
    this.launch('tunnel'); this.emit('change');
  }
  async stopInternal() {
    this.desired = false;
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers.clear();
    for (const name of ['tunnel', 'devspace']) {
      const child = this.children[name];
      if (!child) continue;
      if (child.exitCode === null && child.pid) {
        await exec('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 }).catch(e => { if (child.exitCode === null && this.children[name]) throw Error('停止服务失败：' + e.message); });
      }
      delete this.children[name];
    }
    this.startedAt = null; this.activeRoots = []; this.remote = null;
    this.local = fs.existsSync(this.configPath) ? await probe(this.localUrl() + '/healthz', 200, healthy) : null;
    this.log('info', '由控制台管理的连接已停止。');
  }
  async start() { await this.inspect(); return this.operation('正在启动', () => this.startInternal()); }
  async stop() { return this.operation('正在停止', () => this.stopInternal()); }
  async revokeOAuth() {
    return this.operation('正在撤销授权',async()=>{
      await this.stopInternal();
      secureRuntime(this.runtime);
      const {stdout}=await exec(this.node,[path.join(__dirname,'scripts','revoke-oauth.cjs'),'--all'],{
        windowsHide:true,timeout:30000,env:{...minimalEnvironment(),DEVSPACE_BRIDGE_HOME:this.runtime}
      });
      const counts=JSON.parse(stdout);
      this.log('info',`已撤销全部 OAuth 授权（${counts.clients} 个客户端）。重新启动后需要在 ChatGPT 中重新添加并授权。`);
    });
  }
  async restart() {
    if (!this.desired) throw Error('请先启动服务，再应用并重启。');
    return this.operation('正在重启', async () => { await this.stopInternal(); await this.startInternal(); });
  }
  async diagnose() {
    if (this.checking) return;
    this.checking = true; this.emit('change');
    try {
      const c = this.config(); const base = c.publicBaseUrl.replace(/\/$/, '');
      const [local, health, oauth, auth] = await Promise.all([
        probe(this.localUrl() + '/healthz', 200, healthy), probe(base + '/healthz', 200, healthy),
        probe(base + '/.well-known/oauth-authorization-server', 200, d => String(d.issuer).replace(/\/$/, '') === base && new URL(d.authorization_endpoint).origin === base && new URL(d.token_endpoint).origin === base),
        probe(base + '/mcp', 401)
      ]);
      this.local = local; this.remote = { health, oauth, auth, checkedAt: Date.now() };
      try {
        const { stdout } = await exec(this.node, [this.cli, 'doctor'], { cwd: this.runtime, env: this.environment(), windowsHide: true, timeout: 15000 });
        this.doctor = { ok: doctorHealthy(stdout), at: Date.now(), text: redact(stdout).slice(0, 6000) };
      } catch (error) { this.doctor = { ok: false, at: Date.now(), text: redact(error.stderr || error.message).slice(0, 3000) }; }
      const all = local.ok && health.ok && oauth.ok && auth.ok && this.doctor.ok;
      this.log(all ? 'info' : 'warn', all ? '连接检查通过：本地、公网、OAuth 与认证保护均正常。' : '连接检查完成，部分环节需要处理。请查看诊断结果。');
    } finally { this.checking = false; this.emit('change'); }
  }
  async addRoot(folder) {
    if (this.busy) throw Error('服务正在切换，请稍后修改授权。');
    const raw = fs.readFileSync(this.configPath, 'utf8'); const c = JSON.parse(raw.replace(/^\uFEFF/, ''));
    const resolved = validateRoot(folder, c.allowedRoots, this.home, undefined, this.protectedPaths());
    if (!fs.statSync(resolved).isDirectory()) throw Error('请选择文件夹。');
    c.allowedRoots.push(resolved); this.writeConfig(raw, c);
    this.log('info', '已授权目录：' + resolved); return resolved;
  }
  async removeRoot(folder) {
    if (this.busy) throw Error('服务正在切换，请稍后修改授权。');
    const raw = fs.readFileSync(this.configPath, 'utf8'); const c = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (!c.allowedRoots.includes(folder)) throw Error('该目录已经不在授权列表中。');
    if (c.allowedRoots.length === 1) throw Error('请至少保留一个授权目录。');
    c.allowedRoots = c.allowedRoots.filter(x => x !== folder); this.writeConfig(raw, c);
    this.log('info', '已移除目录授权：' + folder);
  }
  writeConfig(previous, config) {
    secureRuntime(this.runtime);
    if (fs.readFileSync(this.configPath, 'utf8') !== previous) throw Error('配置已被其他程序修改，请刷新后重试。');
    const tmp = this.configPath + '.console-tmp';
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    try { fs.renameSync(tmp, this.configPath); } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    this.emit('change');
  }
  setRecovery(value) {
    secureRuntime(this.runtime);
    this.settings.autoRecover = value === true;
    if (!this.settings.autoRecover) { for (const timer of this.retryTimers) clearTimeout(timer); this.retryTimers.clear(); }
    fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings)); this.emit('change');
  }
  async dispose() { clearInterval(this.pollTimer); await this.stopInternal(); }
}
module.exports = { Service, probe };
