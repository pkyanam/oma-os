import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserTarget } from './browser-target';
test('browser defaults to its start page',()=>assert.equal(browserTarget(''),'oma:start'));
test('browser resolves a host to https',()=>assert.equal(browserTarget('example.com'),'https://example.com/'));
test('browser opens normalized local paths',()=>assert.equal(browserTarget('/home/guest/Projects/../test.html'),'/home/guest/test.html'));
test('browser rejects executable URLs',()=>{for(const url of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd'])assert.throws(()=>browserTarget(url));});
test('plain text becomes a real Google search URL',()=>assert.equal(browserTarget('tokyo night theme'),'https://www.google.com/search?q=tokyo%20night%20theme'));
