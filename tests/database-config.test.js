import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRepository } from '../src/repository.js';

const env = {VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'};

test('missing database settings cannot silently create a local repository', () => {
  for (const config of [{}, {...env, VITE_SUPABASE_URL: ''}, {...env, VITE_SUPABASE_PUBLISHABLE_KEY: '  '}]) {
    assert.throws(() => createRepository(config), /缺少資料庫設定/);
  }
});

test('cloud read failure propagates instead of returning browser or seed data', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({code: 'TEST_UNAVAILABLE', message: 'database unavailable'}), {status: 400, headers: {'Content-Type': 'application/json'}}));
  const repository = createRepository(env);
  await assert.rejects(() => repository.load(), error => error.code === 'TEST_UNAVAILABLE');
});

test('production build refuses missing Netlify settings even when local env exists', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: root,
    env: {...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: ''},
    encoding: 'utf8',
    timeout: 20000
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /缺少資料庫設定/);
  assert.match(result.stderr, /VITE_SUPABASE_URL/);
  assert.match(result.stderr, /VITE_SUPABASE_PUBLISHABLE_KEY/);
});
