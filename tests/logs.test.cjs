const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {finished}=require('node:stream/promises');
const {runtimeFixture,removeFixture}=require('./fixtures.cjs');
test('subprocess logs bound bytes and retention without deleting unrelated files',async()=>{
  const {boundedLog}=require('../bounded-log.cjs');
  const dir=runtimeFixture();
  try {
    fs.writeFileSync(path.join(dir,'notes.txt'),'keep');
    for(let i=0;i<8;i++) {
      const output=boundedLog(dir,'devspace',32,3);
      output.end(Buffer.alloc(100,65));await finished(output);
    }
    const names=fs.readdirSync(dir).filter(name=>name.endsWith('.log'));
    assert.equal(names.length,3);
    for(const name of names) assert.ok(fs.statSync(path.join(dir,name)).size<=32);
    assert.equal(fs.readFileSync(path.join(dir,'notes.txt'),'utf8'),'keep');
  } finally {removeFixture(dir);}
});
