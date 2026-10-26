const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {once} = require('node:events');
const {Service} = require('../service.cjs');
const {runtimeFixture,removeFixture} = require('./fixtures.cjs');
function fixture(source) {
  const runtime = runtimeFixture();
  fs.mkdirSync(path.join(runtime, 'workspace'));
  fs.mkdirSync(path.join(runtime, 'state'));
  const service = new Service(runtime);
  service.node = process.execPath;
  service.cli = path.join(runtime, 'worker.cjs');
  fs.writeFileSync(service.cli, source);
  service.environment = () => ({...process.env, DEVSPACE_ALLOWED_ROOTS:'E:\\fixture'});
  return {service, cleanup:()=>removeFixture(runtime)};
}

test('worker cannot launch before Shell risk acknowledgement; consent survives reopening', async () => {
  const {service,cleanup}=fixture('setInterval(()=>{},1000);');
  try {
    assert.throws(()=>service.launch('devspace'),/Shell/);
    assert.equal(service.children.devspace,undefined);
    service.acknowledgeShellRisk();
    const reopened=new Service(service.runtime);
    assert.equal(reopened.shellRiskAccepted(),true);
  } finally {await service.stopInternal();cleanup();}
});
test('stop terminates owned worker and cancels scheduled recovery', async () => {
  const {service,cleanup}=fixture('setInterval(()=>{},1000);');
  try {
    service.acknowledgeShellRisk();
    service.desired=true;
    service.launch('devspace');
    const worker=service.children.devspace;
    await once(worker,'spawn');
    const closed=once(worker,'close');
    const timer=setTimeout(()=>assert.fail('recovery must be cancelled'),20000);
    service.retryTimers.add(timer);
    await service.stopInternal();
    await closed;
    assert.equal(service.desired,false);
    assert.equal(service.retryTimers.size,0);
    assert.equal(service.children.devspace,undefined);
    assert.throws(()=>process.kill(worker.pid,0));
  } finally { await service.stopInternal(); cleanup(); }
});
test('crash recovery is queued, can be cancelled, and stops after three retries', async () => {
  const {service,cleanup}=fixture('process.exit(2);');
  try {
    service.acknowledgeShellRisk();
    service.desired=true;
    service.launch('devspace');
    await once(service.children.devspace,'close');
    assert.equal(service.retryTimers.size,1);
    service.setRecovery(false);
    assert.equal(service.retryTimers.size,0);
    service.setRecovery(true);
    service.retries.devspace=[Date.now(),Date.now(),Date.now()];
    service.launch('devspace');
    await once(service.children.devspace,'close');
    assert.equal(service.retryTimers.size,0);
    assert.ok(service.events.some(e=>e.level==='error'&&e.message.includes('已暂停自动恢复')));
  } finally { await service.stopInternal(); cleanup(); }
});
