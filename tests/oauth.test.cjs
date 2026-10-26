const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createRequire}=require('node:module');
const fs=require('node:fs');
const net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const {runtimeFixture,removeFixture}=require('./fixtures.cjs');
const cli=process.env.BRIDGE_TEST_DEVSPACE_CLI;

test('offline revocation refuses a DevSpace process before it starts listening',async()=>{
  const {revokeRuntime}=require('../scripts/revoke-oauth.cjs');
  const runtime=runtimeFixture();
  let child;
  try {
    const packageDir=path.join(runtime,'devspace');fs.mkdirSync(path.join(packageDir,'dist'),{recursive:true});
    fs.mkdirSync(path.join(runtime,'config'));fs.mkdirSync(path.join(runtime,'state','devspace'),{recursive:true});
    fs.writeFileSync(path.join(packageDir,'package.json'),JSON.stringify({name:'@waishnav/devspace',version:'1.0.8'}));
    const worker=path.join(packageDir,'dist','cli.js');fs.writeFileSync(worker,'setInterval(()=>{},1000)');
    fs.writeFileSync(path.join(runtime,'bridge-settings.json'),JSON.stringify({schemaVersion:1,nodePath:process.execPath,devspaceCliPath:worker,cloudflaredPath:process.execPath,bashDirectory:runtime,tunnelName:'test'}));
    const portProbe=net.createServer();await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
    const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
    fs.writeFileSync(path.join(runtime,'config','config.json'),JSON.stringify({port,stateDir:path.join(runtime,'state','devspace')}));
    child=spawn(process.execPath,[worker],{windowsHide:true,stdio:'ignore'});await once(child,'spawn');
    await assert.rejects(revokeRuntime(runtime),/Stop all DevSpace/);
    assert.equal(fs.existsSync(path.join(runtime,'state','oauth-maintenance.lock')),false);
  } finally {
    if(child?.pid) {const closed=once(child,'close');execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'pipe'});await closed;}
    removeFixture(runtime);
  }
});

test('revocation invalidates access and refresh after restart, preserving unrelated SQLite state', {skip:!cli}, async()=>{
  const {revokeDatabase}=require('../scripts/revoke-oauth.cjs');
  const {SingleUserOAuthProvider}=await import(pathToFileURL(path.join(path.dirname(cli),'oauth-provider.js')).href);
  const Database=createRequire(cli)('better-sqlite3');
  const runtime=runtimeFixture(), state=path.join(runtime,'state','devspace');
  const options={allowedRedirectHosts:['example.com'],scopes:['devspace'],accessTokenTtlSeconds:3600,refreshTokenTtlSeconds:86400,ownerToken:'synthetic-only'};
  let provider;
  try {
    provider=new SingleUserOAuthProvider(options,new URL('https://devspace.example.com'),state);
    const client=await provider.clientsStore.registerClient({redirect_uris:['https://example.com/callback']});
    const tokens=provider.issueTokens(client.client_id,['devspace'],new URL('https://devspace.example.com/mcp'));
    await provider.verifyAccessToken(tokens.access_token);
    provider.close(); provider=null;
    let db=new Database(path.join(state,'devspace.sqlite'));
    db.exec("CREATE TABLE bridge_test_preserved (value TEXT); INSERT INTO bridge_test_preserved VALUES ('keep');");db.close();
    // Password rotation does not invalidate issued tokens in pinned upstream.
    provider=new SingleUserOAuthProvider({...options,ownerToken:'changed-synthetic'},new URL('https://devspace.example.com'),state);
    await provider.verifyAccessToken(tokens.access_token);provider.close();provider=null;
    assert.deepEqual(revokeDatabase(path.join(state,'devspace.sqlite'),Database),{accessTokens:1,refreshTokens:1,clients:1});
    provider=new SingleUserOAuthProvider(options,new URL('https://devspace.example.com'),state);
    await assert.rejects(provider.verifyAccessToken(tokens.access_token),/Invalid|expired/);
    await assert.rejects(provider.exchangeRefreshToken(client,tokens.refresh_token,[]),/Invalid/);
    assert.equal(await provider.clientsStore.getClient(client.client_id),undefined);
    provider.close();provider=null;
    db=new Database(path.join(state,'devspace.sqlite'));
    assert.equal(db.prepare('SELECT value FROM bridge_test_preserved').get().value,'keep');db.close();
  } finally {provider?.close();removeFixture(runtime);}
});
