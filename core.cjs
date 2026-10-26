const path = require('node:path');
const fs = require('node:fs');

const normalize = p => path.win32.normalize(p).replace(/[\\/]+$/, '').toLowerCase();
function within(parent, child) {
  const rel = path.win32.relative(normalize(parent), normalize(child));
  return rel === '' || (!rel.startsWith('..\\') && rel !== '..' && !path.win32.isAbsolute(rel));
}
function validateRoot(candidate, roots, home, resolve = p => fs.realpathSync.native(p), protectedPaths = []) {
  if (typeof candidate !== 'string' || !path.win32.isAbsolute(candidate) || candidate.startsWith('\\\\')) throw Error('请选择本机上的项目文件夹。');
  if (candidate.includes(',')) throw Error('目录名称不能包含逗号。');
  const resolved = resolve(candidate);
  if (!path.win32.isAbsolute(resolved) || resolved.startsWith('\\\\') || resolved.includes(',')) throw Error('请选择本机上的项目文件夹。');
  if (normalize(resolved) === normalize(path.win32.parse(resolved).root)) throw Error('不能授权整个磁盘，请选择具体项目目录。');
  if (within(resolved, home)) throw Error('不能授权用户主目录或它的上级目录。');
  const sensitive = ['AppData', '.ssh', '.aws', '.azure', '.cloudflared', '.devspace', '.codex', '.gnupg', '.kube'];
  if (sensitive.some(name => within(path.win32.join(home, name), resolved))) throw Error('此目录包含敏感配置，请选择项目目录。');
  const system = [process.env.SystemRoot || 'C:\\Windows', process.env.ProgramFiles || 'C:\\Program Files', process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', process.env.ProgramData || 'C:\\ProgramData'];
  if (system.some(root => within(root, resolved) || within(resolved, root))) throw Error('不能授权系统或软件配置目录。');
  if (protectedPaths.some(root => within(root, resolved) || within(resolved, root))) throw Error('不能授权控制台配置、日志或凭证所在目录。');
  if (roots.some(root => within(root, resolved))) throw Error('这个目录已经在现有授权范围内。');
  return resolved;
}
function sameRoots(a, b) { return a.map(normalize).sort().join('\n') === b.map(normalize).sort().join('\n'); }
function doctorHealthy(output) {
  return /^SQLite native dependency: ok\s*$/m.test(output)
    && /^Git: git version /m.test(output)
    && /^Bash shell: (?!.*(?:missing|unavailable|error)).+/mi.test(output)
    && /^Node: .*\(supported /m.test(output)
    && !/^Config status:/m.test(output);
}
function redact(value) {
  return String(value)
    .replace(/((?:access_token|refresh_token|client_secret|owner_password|password|authorization|token)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[已隐藏]')
    .replace(/Bearer\s+[\w.\-]+/gi, 'Bearer [已隐藏]')
    .replace(/(https?:\/\/[^\s?"']+)\?[^\s"']+/gi, '$1?[已隐藏]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[已隐藏]');
}
function summarize(local, remote) {
  if (!local || !local.ok) return { tone: 'off', title: '连接尚未启动', detail: '启动本地服务与隧道，让 ChatGPT 访问你授权的项目。' };
  if (!remote || !remote.checkedAt) return { tone: 'pending', title: '本地服务已就绪', detail: '公网连接尚未检查，点击检查连接获取完整状态。' };
  if (!remote.health?.ok) return { tone: 'warn', title: '本地正常，公网待恢复', detail: '服务正在运行，公网入口暂时无法连通。打开连接诊断查看原因。' };
  if (!remote.oauth?.ok || !remote.auth?.ok) return { tone: 'warn', title: '公网已通，认证待检查', detail: '入口可以访问，但认证检查没有全部通过。' };
  return { tone: 'good', title: '连接已就绪', detail: '本地、公网与认证保护均正常，可以在 ChatGPT 网页中使用。' };
}
module.exports = { within, validateRoot, sameRoots, redact, summarize, doctorHealthy };
