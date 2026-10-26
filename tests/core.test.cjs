const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { within, validateRoot, sameRoots, redact, summarize } = require('../core.cjs');
const { Service, probe } = require('../service.cjs');
const home = 'C:\\Users\\example';
const identity = x => x;
test('directory boundaries are case insensitive and do not match siblings', () => {
  assert.equal(within('E:\\Projects', 'e:\\projects\\project'), true);
  assert.equal(within('E:\\Projects', 'E:\\Projects-old'), false);
  assert.equal(sameRoots(['E:\\A\\', 'E:\\B'], ['e:\\b', 'e:\\a']), true);
});
test('reject broad, sensitive, network and ambiguous directories', () => {
  for (const candidate of ['E:\\', home, 'C:\\Users', home+'\\.ssh', home+'\\AppData\\Local', 'C:\\Windows', 'C:\\ProgramData', '\\\\server\\project', 'relative', 'E:\\comma,name']) {
    assert.throws(() => validateRoot(candidate, [], home, identity), candidate);
  }
  assert.throws(() => validateRoot('E:\\link', [], home, () => home+'\\.cloudflared'));
  assert.throws(() => validateRoot('E:\\Projects\\child', ['E:\\Projects'], home, identity));
  assert.equal(validateRoot('E:\\Samples\\Demo', [], home, identity), 'E:\\Samples\\Demo');
});
test('failed or missing public checks never claim connection is ready', () => {
  assert.equal(summarize({ok:true}, null).tone, 'pending');
  assert.equal(summarize({ok:true}, {checkedAt:1,health:{ok:false}}).tone, 'warn');
  assert.equal(summarize({ok:true}, {checkedAt:1,health:{ok:true},oauth:{ok:true},auth:{ok:false}}).tone, 'warn');
  assert.equal(summarize({ok:true}, {checkedAt:1,health:{ok:true},oauth:{ok:true},auth:{ok:true}}).tone, 'good');
});
test('redact common credentials and URL query values', () => {
  const clean = redact('password=secret123 Bearer abcdef https://x.example/mcp?code=code123 token: tunnel123');
  for (const secret of ['secret123', 'abcdef', 'code123', 'tunnel123']) assert.equal(clean.includes(secret), false);
});
test('directory edits preserve unrelated configuration and guard last root', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'devspace-console-test-'));
  const service = new Service(temp);
  service.home = 'C:\\Users\\console-test-fixture';
  try {
    service.configPath = path.join(temp, 'config.json');
    const project = path.join(temp, 'project'); fs.mkdirSync(project);
    const original = {host:'127.0.0.1',port:17676,allowedRoots:['E:\\Existing'], publicBaseUrl:'https://devspace.example.com', allowedHosts:['devspace.example.com'], subagents:{enabled:false}, custom:{preserve:true}};
    fs.writeFileSync(service.configPath, JSON.stringify(original));
    const canonicalProject = await service.addRoot(project);
    assert.deepEqual(service.config().custom, original.custom);
    assert.deepEqual(service.config().allowedHosts, original.allowedHosts);
    assert.equal(service.config().allowedRoots.length, 2);
    assert.ok(service.config().allowedRoots.includes(canonicalProject));
    await service.removeRoot(canonicalProject);
    await assert.rejects(service.removeRoot('E:\\Existing'));
    assert.deepEqual(service.config(), original);
    assert.throws(() => service.writeConfig('stale', original));
  } finally { fs.rmSync(temp, {recursive:true,force:true}); }
});
test('probe validates status and discovery payload', async () => {
  const server = require('node:http').createServer((req, res) => {
    res.writeHead(req.url === '/mcp' ? 401 : 200, {'Content-Type':'application/json'}); res.end('{"issuer":"correct"}');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await probe(base+'/mcp',401)).ok,true);
    assert.equal((await probe(base,200,d=>d.issuer==='wrong')).ok,false);
    assert.equal((await probe(base,200,d=>d.issuer==='correct')).ok,true);
  } finally { await new Promise(r=>server.close(r)); }
});
