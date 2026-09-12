// Explicit deployment smoke: creates two short-lived, anonymous sign-in attempts,
// then logs both out. Never prints cookies, device codes, or response bodies.
import assert from 'node:assert/strict';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:3018').origin;
const cookies = [];
async function call(path, {cookie, method = 'GET'} = {}) {
  return fetch(origin + path, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {Origin: origin, ...(cookie ? {Cookie: cookie} : {})},
  });
}
try {
  const health = await call('/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).platform, 'cloudflare');
  const config = await (await call('/api/agent-config')).json();
  assert.equal(config.chatgpt.storage, 'durable-objects');
  assert.equal(config.chatgpt.enabled, true);
  const page = await call('/api/browser?format=text&url=https%3A%2F%2Fexample.com');
  assert.equal(page.status, 200);
  const document = await page.json();
  assert.equal(document.title, 'Example Domain');
  assert.equal(typeof document.readableText, 'string');
  assert.equal('html' in document, false);
  const denied = await call('/api/browser?url=http%3A%2F%2F127.0.0.1');
  assert.equal(denied.status, 422);
  const browser = await (await call('/api/browser-runtime?capabilities=1')).json();
  assert.equal(browser.provider, 'cloudflare');
  assert.equal(browser.requiresAuthentication, browser.transport === 'live-view');
  if (config.workersAI?.enabled) {
    const deniedAI = await fetch(origin + '/api/ai/v1/chat/completions', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: '{}', signal: AbortSignal.timeout(30000)});
    assert.equal(deniedAI.status, 400, 'Anonymous hosted inference must validate an invalid request without running a model');
    assert.ok(config.workersAI.models.includes('@cf/zai-org/glm-5.3-flash'));
    assert.equal(config.workersAI.models.length, 4);
  }
  for (let i = 0; i < 2; i++) {
    const login = await call('/api/chatgpt/login', {method: 'POST'});
    assert.equal(login.status, 200, 'Sign-in initialization failed');
    const cookie = login.headers.getSetCookie().find(value => value.startsWith('lwc_session='))?.split(';')[0];
    assert.ok(cookie, 'Sign-in must issue a session cookie');
    cookies.push(cookie);
    await login.body?.cancel();
    const session = await call('/api/chatgpt/session', {cookie});
    assert.equal(session.status, 200);
    assert.equal((await session.json()).status, 'pending');
  }
  assert.notEqual(cookies[0], cookies[1], 'Independent visitors must receive distinct sessions');
  console.log('PASS: Cloudflare health, readable pages, private-address denial, browser capabilities and independent sign-in sessions.');
} finally {
  const results = await Promise.all(cookies.map(async cookie => {
    const response = await call('/api/chatgpt/logout', {cookie, method: 'POST'});
    assert.equal(response.status, 200, 'Temporary sign-in cleanup failed');
  }));
  if (results.length) console.log(`Cleaned up ${results.length} temporary sign-in sessions.`);
}
