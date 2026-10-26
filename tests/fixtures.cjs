const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {secureRuntime} = require('../runtime-security.cjs');
function runtimeFixture() {
  const runtime=path.join(os.homedir(), 'bridge-test-'+randomUUID());
  secureRuntime(runtime,true);
  return runtime;
}
function removeFixture(directory) {
  if (path.dirname(directory)!==os.homedir() || !path.basename(directory).startsWith('bridge-test-')) throw Error('Not a test fixture');
  fs.rmSync(directory,{recursive:true,force:true});
}
module.exports={runtimeFixture,removeFixture};
