const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const SUPPORTED_DEVSPACE = '1.0.8';

function runtimeHome(env = process.env, home = os.homedir()) {
  const value = env.DEVSPACE_BRIDGE_HOME || path.join(home, 'DevSpaceBridge');
  if (!path.isAbsolute(value)) throw Error('DEVSPACE_BRIDGE_HOME must be an absolute directory.');
  return path.resolve(value);
}
function publicOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname.includes('*')) {
    throw Error('Public URL must be an HTTPS origin without credentials, path, query or fragment.');
  }
  return url.origin;
}
function loadSettings(runtime, allowMissing = false) {
  const filename = path.join(runtime, 'bridge-settings.json');
  if (allowMissing && !fs.existsSync(filename)) return {};
  const value = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (value.schemaVersion !== 1) throw Error('Unsupported bridge settings version.');
  for (const key of ['nodePath', 'devspaceCliPath', 'cloudflaredPath', 'bashDirectory']) {
    if (typeof value[key] !== 'string' || !path.isAbsolute(value[key])) throw Error(`Missing absolute installation path: ${key}`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value.tunnelName)) throw Error('Invalid tunnel name or ID.');
  return value;
}
function assertDevSpaceVersion(cli) {
  const manifest = path.resolve(path.dirname(cli), '..', 'package.json');
  const installed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (installed.name !== '@waishnav/devspace' || installed.version !== SUPPORTED_DEVSPACE) {
    throw Error(`This console supports @waishnav/devspace ${SUPPORTED_DEVSPACE}. Install that version or review compatibility before upgrading.`);
  }
}
function minimalEnvironment(source = process.env) {
  const allowed = new Set(['path', 'pathext', 'systemroot', 'windir', 'systemdrive', 'comspec', 'temp', 'tmp', 'userprofile', 'home', 'appdata', 'localappdata', 'programfiles', 'programfiles(x86)', 'programdata', 'os', 'processor_architecture', 'number_of_processors']);
  const env = {};
  for (const [key, value] of Object.entries(source)) if (allowed.has(key.toLowerCase())) env[key.toLowerCase() === 'path' ? 'PATH' : key] = value;
  return env;
}
function windowsPowerShellEnvironment(source=process.env) {
  const env=minimalEnvironment(source);
  env.PSModulePath=path.join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules');
  return env;
}
module.exports = { SUPPORTED_DEVSPACE, runtimeHome, publicOrigin, loadSettings, assertDevSpaceVersion, minimalEnvironment, windowsPowerShellEnvironment };
