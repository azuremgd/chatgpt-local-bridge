const {execFileSync} = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
function findings(filename,bytes,deny=[]) {
  const problems=[];
  if (/(^|\/)(node_modules|dist|runtime|logs|state|\.devspace|\.cloudflared)(\/|$)/i.test(filename) || /(^|\/)(auth\.json|config\.jsonc?|bridge-settings\.json|\.env(?:\..*)?)$/i.test(filename) || /\.(?:pem|key|pfx|p12|log|db|sqlite|exe|lnk|zip)$/i.test(filename)) problems.push('runtime, credential or generated artifact filename');
  const text=bytes.toString('utf8');
  const patterns=[
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
    /["']TunnelSecret["']\s*:/,
    /["'](?:ownerToken|access_token|refresh_token|client_secret)["']\s*:\s*["'][A-Za-z0-9_+/=-]{24,}["']/
  ];
  if(patterns.some(pattern=>pattern.test(text)))problems.push('possible secret material');
  if(deny.some(value=>value&&text.toLowerCase().includes(value.toLowerCase())))problems.push('local private identifier');
  if(filename.endsWith('.png')) {
    let offset=8;
    while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);if(['tEXt','zTXt','iTXt','eXIf'].includes(type))problems.push('image metadata requires review');offset+=length+12;}
  }
  return [...new Set(problems)];
}
function main() {
  const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024});
  const files=git(['ls-files','--cached','-z']).toString('utf8').split('\0').filter(Boolean);
  if(!files.length)throw Error('No indexed files. Stage the intended source files before checking.');
  const deny=JSON.parse(process.env.BRIDGE_PRIVACY_DENY_JSON||'[]');
  let failed=0;
  for(const file of files){const hits=findings(file,git(['show',':'+file]),deny);if(hits.length){failed++;console.error(file+': '+hits.join('; '));}}
  if(failed)throw Error(`${failed} indexed files require review. No matching secret values were printed.`);
  console.log(`Privacy checks passed for ${files.length} indexed files. This is a heuristic, not a guarantee; review the complete diff and Git history before publication.`);
}
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={findings};
