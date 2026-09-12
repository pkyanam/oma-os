import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatGPTHandler } from '@opencoredev/loginwithchatgpt-server';
import { authRequest } from './request';

test('uses browser host instead of wildcard bind address and preserves POST body', async () => {
  const request = authRequest(new Request('http://0.0.0.0:3017/api/chatgpt/logout', {
    method: 'POST', headers: { host: 'localhost:3017', origin: 'http://localhost:3017' }, body: '{}',
  }));
  assert.equal(new URL(request.url).host, 'localhost:3017');
  assert.equal(await request.clone().text(), '{}');
  const handler = createChatGPTHandler({ secret: 'test-only-secret-with-at-least-32-characters' });
  assert.equal((await handler.handler(request)).status, 200);
});

test('does not turn an untrusted Origin into an allowed origin', async () => {
  const request = authRequest(new Request('http://0.0.0.0:3017/api/chatgpt/login', {
    method: 'POST', headers: { host: 'localhost:3017', origin: 'https://untrusted.example' },
  }));
  const handler = createChatGPTHandler({ secret: 'test-only-secret-with-at-least-32-characters' });
  const response = await handler.handler(request);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'origin_not_allowed');
});
