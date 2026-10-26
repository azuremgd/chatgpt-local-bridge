const icons = {
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
 pulse:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
 list:'<path d="M8 5h12M8 12h12M8 19h12M3 5h.01M3 12h.01M3 19h.01"/>',
 settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9 3-1 2-3 1-2 3 1 3-1 3 2 3 3 1 1 2h6l1-2 3-1 2-3-1-3 1-3-2-3-3-1-1-2Z"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/>',
 monitor:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
 refresh:'<path d="M20 7a9 9 0 0 0-15-2L3 8m0-5v5h5M4 17a9 9 0 0 0 15 2l2-3m0 5v-5h-5"/>',
 link:'<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9 1)"/>',
 server:'<rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 7h4M12 18h4"/>',
 tunnel:'<path d="M4 20V10a8 8 0 0 1 16 0v10M8 20V10a4 4 0 0 1 8 0v10M2 20h20M12 13v3m0 3v1"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
 play:'<path d="m8 4 12 8-12 8Z"/>', stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
 terminal:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
 cloud:'<path d="M7 18a5 5 0 1 1 0-10 6 6 0 0 1 11-1 5.5 5.5 0 0 1 0 11Z"/>',
 arrowRight:'<path d="M4 12h16m-6-6 6 6-6 6"/>', arrowUpRight:'<path d="M6 18 18 6M6 6h12v12"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 plus:'<path d="M12 4v16M4 12h16"/>', trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 check:'<path d="m5 12 4 4L19 6"/>', warning:'<path d="m12 3 10 17H2Z"/><path d="M12 9v5m0 3h.01"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.outerHTML = icon(el.dataset.icon));
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const time = value => value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '尚未检查';
const dateTime = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
let state = null, currentPage = 'overview', filter = 'all', toastTimer, rootsKey = '', logsKey = '';
const titles = { overview: '连接总览', workspaces: '授权目录', diagnostics: '连接诊断', logs: '运行记录', settings: '设置' };
function toast(message, error = false) { const el = $('toast'); el.textContent = message; el.className = 'toast' + (error ? ' error' : ''); el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, error ? 8000 : 3500); }
function go(page) {
  if (!titles[page]) return;
  currentPage = page;
  document.querySelectorAll('.page').forEach(el => { const active = el.id === 'page-' + page; el.hidden = !active; el.classList.toggle('active', active); });
  document.querySelectorAll('[data-page]').forEach(el => { const active = el.dataset.page === page; el.classList.toggle('selected', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  $('breadcrumb-title').textContent = titles[page]; $('main').scrollTop = 0;
}
async function action(command, payload) {
  if (!window.consoleAPI) { toast('请通过 DevSpace Console 桌面应用使用这些功能。', true); return; }
  try {
    const result = await window.consoleAPI.invoke(command, payload);
    if (!result.ok) throw Error(result.error);
    if (result.data?.summary) render(result.data);
    if (command === 'copyEndpoint') toast('MCP 地址已复制');
  } catch (e) { toast(e.message, true); }
}
document.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]'); if (pageButton) return go(pageButton.dataset.page);
  const goButton = event.target.closest('[data-go]'); if (goButton) return go(goButton.dataset.go);
  const filterButton = event.target.closest('[data-filter]'); if (filterButton) { filter = filterButton.dataset.filter; logsKey = ''; renderLogs(); document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x.dataset.filter === filter)); return; }
  const button = event.target.closest('[data-action]'); if (button && !button.disabled) action(button.dataset.action, button.dataset.path);
});
$('recovery-switch').addEventListener('click', () => action('recovery', !state?.settings.autoRecover));
function badge(id, text, tone) { $(id).textContent = text; $(id).className = 'badge ' + tone; }
function flow(name, tone, text) { $('flow-' + name).className = 'flow-icon ' + tone; $('flow-' + name + '-label').textContent = text; }
function render(s) {
  if (s.fatal) {
    document.querySelectorAll('[data-action]').forEach(el => el.disabled = !['openGuide','openRuntime','quit'].includes(el.dataset.action));
    $('status-title').textContent = '请先完成首次配置'; $('status-detail').textContent = s.fatal;
    badge('connection-badge', '待配置', 'neutral'); return;
  }
  state = s;
  $('device-name').textContent = s.host;
  $('service-local-address').textContent = s.localUrl.replace('http://', '');
  $('service-tunnel-name').textContent = s.tunnelName;
  $('nav-root-count').textContent = s.roots.length;
  $('endpoint-url').textContent = s.mcpUrl;
  $('runtime-path').textContent = s.runtime; $('config-path').textContent = s.configPath;
  $('status-title').textContent = s.busy || s.summary.title;
  $('status-detail').textContent = s.summary.detail;
  $('status-orb').className = 'status-orb ' + s.summary.tone;
  badge('connection-badge', s.busy ? '处理中' : ({good:'已验证',warn:'需要检查',pending:'待验证',off:'未连接'}[s.summary.tone]), s.summary.tone === 'good' ? 'good' : s.summary.tone === 'off' ? 'neutral' : 'warn');
  const primary = $('primary-action');
  const primaryCmd = s.managed ? 'stop' : s.external ? 'refresh' : 'start';
  primary.dataset.action = primaryCmd;
  primary.className = 'button ' + (s.managed ? 'stop' : 'primary');
  primary.innerHTML = icon(s.managed ? 'stop' : 'play') + '<span>' + (s.busy || (s.managed ? '停止连接' : s.external ? '重新检测' : '启动连接')) + '</span>';
  primary.disabled = Boolean(s.busy);
  $('restart-button').hidden = !s.managed; $('restart-button').disabled = Boolean(s.busy);
  $('external-notice').hidden = !s.external || s.managed;
  flow('local', s.local?.ok ? 'good' : '', s.local?.ok ? '运行正常' : '未连接');
  flow('tunnel', s.tunnelPid ? 'good' : '', s.tunnelPid ? '进程运行中' : '未运行');
  flow('public', !s.remote ? '' : s.remote.health.ok ? 'good' : 'warn', !s.remote ? '尚未验证' : s.remote.health.ok ? 'HTTPS 可访问' : '连接失败');
  const authOk = s.remote?.oauth.ok && s.remote?.auth.ok;
  flow('auth', !s.remote ? '' : authOk ? 'good' : 'warn', !s.remote ? '尚未验证' : authOk ? '认证保护正常' : '需要检查');
  badge('ds-badge', s.local?.ok ? '运行中' : s.devspacePid ? '启动中' : '已停止', s.local?.ok ? 'good' : s.devspacePid ? 'warn' : 'neutral');
  badge('cf-badge', s.tunnelPid ? '运行中' : '已停止', s.tunnelPid ? 'good' : 'neutral');
  $('uptime').textContent = s.startedAt ? '已运行 ' + duration(Date.now() - s.startedAt) : s.external ? '外部管理' : '未运行';
  $('footer-status').textContent = s.busy || (s.managed ? '控制台管理中' : s.external ? '外部服务运行中' : '等待启动');
  $('footer-dot').className = s.local?.ok ? 'good' : '';
  $('footer-check').textContent = s.remote ? '最近公网检查 ' + time(s.remote.checkedAt) : '尚未执行公网检查';
  $('recovery-switch').setAttribute('aria-checked', String(s.settings.autoRecover));
  document.querySelectorAll('[data-action="diagnose"]').forEach(el => { el.disabled = s.checking || Boolean(s.busy); el.querySelector('.check-button-label').textContent = s.checking ? '正在检查…' : el.closest('#page-diagnostics') ? '运行诊断' : '检查连接'; });
  document.querySelectorAll('[data-action="takeover"],[data-action="addRoot"]').forEach(el => el.disabled = Boolean(s.busy));
  renderRoots(); renderEvents(); renderDiagnostics(); renderLogs();
}
function duration(ms) { const minutes = Math.floor(ms / 60000); return minutes < 1 ? '不到 1 分钟' : minutes < 60 ? minutes + ' 分钟' : Math.floor(minutes / 60) + ' 小时 ' + minutes % 60 + ' 分钟'; }
function renderRoots() {
  const s = state; const key = JSON.stringify([s.roots, s.pending, s.activeKnown, s.busy, s.external, s.managed]);
  if (key === rootsKey) return; rootsKey = key;
  $('pending-banner').hidden = !s.pending;
  $('pending-title').textContent = s.activeKnown ? '授权配置已保存，等待应用' : '外部服务的已加载权限尚未确认';
  $('pending-detail').textContent = s.activeKnown ? '重启连接后，新的目录权限才会生效。' : '这里显示已保存的配置。请在原启动器停止服务，再从控制台启动以加载这些授权。';
  $('apply-roots').dataset.action = s.managed ? 'restart' : 'refresh';
  $('apply-roots').textContent = s.managed ? '应用并重启' : '重新检测'; $('apply-roots').disabled = Boolean(s.busy);
  $('roots-list').innerHTML = s.roots.map(root => {
    const name = root.path.split(/[\\/]/).filter(Boolean).pop();
    const label = !root.exists ? '路径不存在' : root.active ? '已加载' : s.local?.ok ? s.activeKnown ? '待应用' : '待确认' : '已保存';
    const tone = !root.exists ? 'bad' : root.active ? 'good' : s.local?.ok ? 'warn' : 'neutral';
    return `<div class="folder-row"><div class="folder-identity"><div class="folder-symbol">${icon('folder')}</div><div class="folder-text"><strong>${esc(name)}</strong><code>${esc(root.path)}</code></div></div><div class="folder-state"><span class="badge ${tone}">${label}</span><span>包含子目录</span></div><div class="folder-actions"><button class="icon-button" data-action="openRoot" data-path="${esc(root.path)}" title="打开 ${esc(name)}" aria-label="打开 ${esc(name)}">${icon('arrowUpRight')}</button><button class="icon-button remove" data-action="removeRoot" data-path="${esc(root.path)}" title="移除 ${esc(name)} 的授权" aria-label="移除 ${esc(name)} 的授权" ${s.busy?'disabled':''}>${icon('trash')}</button></div></div>`;
  }).join('') || '<div class="empty-table">尚未授权任何目录。点击添加目录开始。</div>';
}
function renderEvents() {
  const events = state.events.slice(-3).reverse();
  $('recent-events').innerHTML = events.length ? events.map(e => `<div class="recent-event"><i class="event-dot ${esc(e.level)}"></i><div class="event-content"><p title="${esc(e.message)}">${esc(e.message)}</p><span>${time(e.time)}</span></div></div>`).join('') : '<p class="empty-small">连接活动会记录在这里。</p>';
}
function renderDiagnostics() {
  const s = state;
  const rows = [
    {name:'本地 DevSpace',icon:'server',result:s.local,url:s.localUrl+'/healthz',hint:'确认服务在本机监听，网页工具才能连接项目。',fail:'本地服务不可访问。请先启动连接，或查看 DevSpace 服务日志。'},
    {name:'公网 HTTPS 入口',icon:'globe',result:s.remote?.health,url:s.publicUrl+'/healthz',hint:'从本机请求公网入口，确认隧道到本地服务的链路。',fail:'公网入口没有通过检查。请确认网络正常，并查看隧道日志。'},
    {name:'OAuth 发现',icon:'link',result:s.remote?.oauth,url:s.publicUrl+'/.well-known/oauth-authorization-server',hint:'验证认证服务的发现文档与端点是否匹配。',fail:'认证发现未通过检查。可先确认公网入口，再检查 DevSpace 配置。'},
    {name:'未认证访问保护',icon:'shield',result:s.remote?.auth,url:s.mcpUrl,hint:'未登录访问应返回 401，表明 MCP 认证保护生效。',fail:'未得到预期的 401 响应，请查看网络与认证配置。'},
    {name:'ChatGPT 实际工具调用',icon:'terminal',result:null,url:'',hint:'请在 ChatGPT 网页中选择 DevSpace，尝试打开一个授权项目。控制台不会代替网页授权。',fail:''}
  ];
  $('diagnostic-list').innerHTML = rows.map(row => {
    const r=row.result; const tone=!r?'':r.ok?'good':'warn';
    return `<div class="diagnostic-row"><div class="diagnostic-icon ${tone}">${icon(r?r.ok?'check':'warning':row.icon)}</div><div class="diagnostic-info"><h3>${row.name}</h3><p>${esc(r&&!r.ok?row.fail:row.hint)}</p>${r&&!r.ok?`<code>${esc(r.error)}</code>`:row.url?`<code>${esc(row.url)}</code>`:''}</div><div class="diagnostic-result"><span class="badge ${r?r.ok?'good':'warn':'neutral'}">${r?r.ok?'通过':'未通过':'尚未验证'}</span>${r?`<small>${r.ms} ms</small>`:''}</div></div>`;
  }).join('');
  $('diag-summary-text').textContent = s.checking ? '正在逐层检查，请稍候…' : s.remote ? s.local?.ok&&s.remote.health.ok&&s.remote.oauth.ok&&s.remote.auth.ok ? '服务与认证检查已通过' : '检查完成，部分环节需要处理' : '尚未执行完整检查';
  $('diag-time').textContent = s.remote ? '上次检查 ' + time(s.remote.checkedAt) : '点击运行诊断开始';
  badge('doctor-badge', s.doctor?s.doctor.ok?'正常':'需要处理':'未检查', s.doctor?s.doctor.ok?'good':'warn':'neutral');
  $('doctor-output').textContent = s.doctor?.text || '运行一次诊断后，结果会显示在这里。';
}
function renderLogs() {
  if (!state) return;
  const key=JSON.stringify([state.events,filter]); if(key===logsKey)return; logsKey=key;
  const events=state.events.filter(e=>filter==='all'||e.level===filter).slice().reverse();
  const names={system:'控制台',devspace:'DevSpace',tunnel:'隧道'};
  $('logs-list').innerHTML = events.map(e=>`<div class="log-row"><span class="log-time">${dateTime(e.time)}</span><span class="log-source">${names[e.source]||'控制台'}</span><div class="log-message"><i class="event-dot ${esc(e.level)}"></i><span>${esc(e.message)}</span></div></div>`).join('') || '<div class="empty-table">这里还没有对应的运行记录。</div>';
}
if (window.consoleAPI) { window.consoleAPI.onState(render); action('state'); }
else { $('status-title').textContent='请在桌面应用中打开'; $('status-detail').textContent='此页面需要本地控制台提供服务管理能力。'; }
