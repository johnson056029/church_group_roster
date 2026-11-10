import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRepository } from '../src/repository.js';

const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options = {}) => nativeFetch(input, {
  ...options,
  signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
});

// Run with: node --env-file=.env.local scripts/check-supabase.mjs [--write]
// Never log credentials or database contents. Writes are opt-in and isolated.
async function main() {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error('請填寫 Supabase URL 與公開金鑰。');
  if (new URL(url).protocol !== 'https:') throw new Error('雲端 URL 必須使用 HTTPS。');
  if (key.startsWith('sb_secret_')) throw new Error('設定中是 secret key，請改用 publishable key。');
  if (key.split('.').length === 3) {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    if (claims.role !== 'anon') throw new Error('請使用 anon key，不可使用管理金鑰。');
  } else if (!key.startsWith('sb_publishable_')) {
    throw new Error('公開金鑰格式不正確。');
  }
  try {
    // A response (including 401) confirms DNS/TLS connectivity without credentials.
    await fetch(new URL('/rest/v1/', url), {signal: AbortSignal.timeout(15000)});
  } catch (error) {
    throw new Error(`無法連接 Supabase 主機：${error.cause?.code || error.name} ${error.cause?.message || error.message}`);
  }
  const first = createRepository(process.env);
  const second = createRepository(process.env);
  const rows = await first.load();
  console.log(JSON.stringify({check: 'cloud_read', ok: true, records: rows.length, tables: new Set(rows.map(row => row.table)).size, probes: rows.filter(row => row.table === 'group_documents' && row.data.field === '__connection_check').map(row => row.id)}));
  const cleanupIndex = process.argv.indexOf('--cleanup-probe');
  if (cleanupIndex !== -1) {
    const cleanupId = process.argv[cleanupIndex + 1];
    const row = rows.find(row => row.table === 'group_documents' && row.id === cleanupId);
    if (row) {
      assert.ok(cleanupId.startsWith('connection-check-'));
      assert.equal(row.data.field, '__connection_check');
      assert.equal(row.data.value, cleanupId);
      await first.commit([{table: row.table, id: row.id, before: row, after: null}]);
    }
    assert.ok(!(await second.load()).some(row => row.table === 'group_documents' && row.id === cleanupId));
    console.log(JSON.stringify({check: 'probe_cleanup', ok: true}));
    return;
  }
  if (!process.argv.includes('--write')) return;
  const group = rows.find(row => row.table === 'groups');
  if (!group) throw new Error('沒有可供測試的小組資料。');
  const id = `connection-check-${randomUUID()}`;
  const probe = {table: 'group_documents', id, group_id: group.id, member_id: null, data: {field: '__connection_check', value: id, version: 1}};
  console.log(JSON.stringify({check: 'probe_started', id}));
  const changed = {...probe, data: {...probe.data, version: 2}};
  const findProbe = records => records.find(row => row.table === probe.table && row.id === id);
  try {
    await first.commit([{table: probe.table, id, before: null, after: probe}]);
    console.log(JSON.stringify({check: 'cloud_insert', ok: true}));
    assert.deepEqual(findProbe(await second.load()), probe);
    await second.commit([{table: probe.table, id, before: probe, after: changed}]);
    assert.deepEqual(findProbe(await first.load()), changed);
    await assert.rejects(() => first.commit([{table: probe.table, id, before: probe, after: probe}]), error => error.code === 'PT409');
    console.log(JSON.stringify({check: 'cloud_insert_update_independent_clients_conflict', ok: true}));
  } finally {
    const current = findProbe(await first.load());
    if (current) {
      assert.equal(current.data.value, id, '暫存紀錄內容不符，未自動刪除。');
      await first.commit([{table: probe.table, id, before: current, after: null}]);
    }
    assert.equal(findProbe(await second.load()), undefined);
    console.log(JSON.stringify({check: 'probe_cleanup', ok: true}));
  }
}

main().catch(error => {
  // Avoid printing fetch details or full URLs, which may contain configuration.
  console.error(JSON.stringify({ok: false, code: error.code || null, message: error.message}));
  process.exitCode = 1;
});
