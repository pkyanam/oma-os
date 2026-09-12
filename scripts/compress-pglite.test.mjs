import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compressPGlite } from './compress-pglite.mjs';

test('asset preparation preserves raw fallback and emits verifiable gzip metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oma-pglite-'));
  try {
    const raw = Buffer.from('postgres filesystem fixture\0'.repeat(200));
    await writeFile(join(dir, 'pglite.data'), raw);
    const manifest = await compressPGlite(dir);
    const packed = await readFile(join(dir, 'pglite.data.gz'));
    assert.deepEqual(gunzipSync(packed), raw);
    assert.deepEqual(await readFile(join(dir, 'pglite.data')), raw);
    assert.equal(manifest.rawBytes, raw.length);
    assert.equal(manifest.compressedBytes, packed.length);
    assert.equal(manifest.sha256, createHash('sha256').update(raw).digest('hex'));
    assert.equal(manifest.compressedSha256, createHash('sha256').update(packed).digest('hex'));
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'pglite.data.meta.json'), 'utf8')), manifest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
