const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {createHash,randomBytes}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const {runtimeFixture,removeFixture}=require('./fixtures.cjs');
const {minimalEnvironment}=require('../installation.cjs');
const {Service,probe}=require('../service.cjs');
const {doctorHealthy}=require('../core.cjs');

(async()=>{
  const cli=process.env.BRIDGE_TEST_DEVSPACE_CLI;
  if(!cli) throw Error('Set BRIDGE_TEST_DEVSPACE_CLI to the installed 1.0.8 CLI.');
  const parent=runtimeFixture(),runtime=path.join(parent,'runtime');
  let service;
  try {
    const reservation=net.createServer();
    await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
    const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
    const credentials=path.join(parent,'synthetic-credentials.json');fs.writeFileSync(credentials,'{}');
    const ownerPassword='bridge-synthetic-owner-password-for-ci-only';
    const bash=process.env.BRIDGE_TEST_BASH || path.resolve(path.dirname(execFileSync('where.exe',['git.exe'],{encoding:'utf8'}).trim().split(/\r?\n/)[0]),'..','bin');
    const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
    execFileSync(powershell,['-NoProfile','-NonInteractive','-File',path.join(__dirname,'setup-wrapper.ps1'),'-Runtime',runtime,'-Node',process.execPath,'-Cli',cli,'-Bash',bash,'-Credentials',credentials,'-Port',String(port)],{windowsHide:true,encoding:'utf8',env:minimalEnvironment()});
    service=new Service(runtime);service.acknowledgeShellRisk();
    const doctor=execFileSync(process.execPath,[cli,'doctor'],{encoding:'utf8',env:service.environment(),windowsHide:true});
    assert.equal(doctorHealthy(doctor),true,'doctor component checks');
    service.launch('devspace');
    const local=`http://127.0.0.1:${port}`;
    let ready=false;
    for(let i=0;i<30;i++){if((await probe(local+'/healthz',200)).ok){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,300));}
    assert.equal(ready,true,'local service ready');
    assert.equal((await fetch(local+'/mcp')).status,401);
    const discovery=await (await fetch(local+'/.well-known/oauth-authorization-server')).json();
    assert.equal(discovery.issuer.replace(/\/$/,''),'https://devspace.example.com');
    const endpoint=url=>local+new URL(url).pathname;
    const redirect='http://127.0.0.1/callback';
    const registration=await fetch(endpoint(discovery.registration_endpoint),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],client_name:'Bridge synthetic local test'})});
    assert.equal(registration.status,201,'client registration');const client=await registration.json();
    const verifier=randomBytes(32).toString('base64url');
    const parameters={response_type:'code',client_id:client.client_id,redirect_uri:redirect,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',scope:'devspace',resource:'https://devspace.example.com/mcp'};
    const authorization=await fetch(endpoint(discovery.authorization_endpoint),{method:'POST',redirect:'manual',body:new URLSearchParams({...parameters,owner_token:ownerPassword})});
    assert.equal(authorization.status,302,'owner authorization');
    const code=new URL(authorization.headers.get('location')).searchParams.get('code');
    const exchange=await fetch(endpoint(discovery.token_endpoint),{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code,code_verifier:verifier,redirect_uri:redirect,resource:parameters.resource})});
    assert.equal(exchange.status,200,'PKCE token exchange');const tokens=await exchange.json();
    const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':'Bearer '+tokens.access_token};
    async function rpc(id,method,params) {
      const response=await fetch(local+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
      assert.equal(response.status,200,method+' status');
      if(response.headers.get('mcp-session-id')) headers['Mcp-Session-Id']=response.headers.get('mcp-session-id');
      const body=await response.text();
      const result=JSON.parse(body.startsWith('event:')||body.startsWith('data:') ? body.split(/\r?\n/).find(line=>line.startsWith('data:')).slice(5) : body);
      assert.equal(result.error,undefined,method+' result');return result.result;
    }
    const initialized=await rpc(1,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'bridge-synthetic-test',version:'1.0'}});
    headers['MCP-Protocol-Version']=initialized.protocolVersion;
    const listed=await rpc(2,'tools/list',{});
    assert.ok(listed.tools.some(tool=>tool.name==='open_workspace'));
    const opened=await rpc(3,'tools/call',{name:'open_workspace',arguments:{path:path.join(runtime,'workspace')}});
    assert.notEqual(opened.isError,true,'open test workspace');
    if(process.env.BRIDGE_TEST_REVOKE_RUNTIME==='1') {
      await service.stopInternal();
      const Database=createRequire(cli)('better-sqlite3');
      const filename=path.join(runtime,'state','devspace','devspace.sqlite');
      const countSessions=()=>{const db=new Database(filename);try{return db.prepare('SELECT count(*) AS n FROM workspace_sessions').get().n;}finally{db.close();}};
      const before=countSessions();assert.ok(before>0);
      const result=JSON.parse(execFileSync(process.execPath,[path.resolve(__dirname,'..','scripts','revoke-oauth.cjs'),'--all'],{encoding:'utf8',windowsHide:true,env:{...minimalEnvironment(),DEVSPACE_BRIDGE_HOME:runtime}}));
      assert.deepEqual(result,{accessTokens:1,refreshTokens:1,clients:1});assert.equal(countSessions(),before);
      service.launch('devspace');
      for(let i=0;i<30;i++){if((await probe(local+'/healthz',200)).ok)break;await new Promise(resolve=>setTimeout(resolve,300));}
      assert.equal((await fetch(local+'/mcp',{headers:{Authorization:'Bearer '+tokens.access_token}})).status,401);
      const oldRefresh=await fetch(endpoint(discovery.token_endpoint),{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:tokens.refresh_token,resource:parameters.resource})});
      assert.ok([400,401].includes(oldRefresh.status));
      console.log('Offline revocation CLI: PASS (both token types rejected after process restart; workspace sessions preserved)');
    }
    console.log('Local MCP: PASS (doctor, 401, discovery, Owner Password + PKCE, tools/list, open_workspace; synthetic data only)');
  } finally {if(service) await service.stopInternal();removeFixture(parent);}
})().catch(error=>{console.error('Local MCP: FAIL ('+error.name+': '+error.message+'). No credentials printed.');process.exitCode=1;});
