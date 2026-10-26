const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createRequire}=require('node:module');
const {runtimeFixture,removeFixture}=require('./fixtures.cjs');
const cli=process.env.BRIDGE_TEST_DEVSPACE_CLI;

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
