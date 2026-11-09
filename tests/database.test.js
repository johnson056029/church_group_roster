import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { toRecords, fromRecords, diffRecords, applyChanges, equal } from '../src/records.js';

const seed = JSON.parse(await fs.readFile(new URL('../src/seed.json', import.meta.url)));
const initial = toRecords(seed.defaultState, seed.users);
let db;
before(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated;');
  await db.exec(await fs.readFile(new URL('../supabase/migrations/001_schema.sql', import.meta.url), 'utf8'));
  await db.exec(await fs.readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
});
after(async () => { await db?.close(); });
const snapshot = async () => (await db.query('select public.demo_snapshot() as records')).rows[0].records;
const commit = changes => db.query('select public.demo_apply_changes($1::jsonb)', [JSON.stringify(changes)]);

test('records round trip retains schedules, roles, surveys and stable member IDs', () => {
  const loaded = fromRecords(initial);
  assert.deepEqual(loaded.state.groups, seed.defaultState.groups);
  assert.deepEqual(loaded.state.prayerSurvey, seed.defaultState.prayerSurvey);
  assert.equal(diffRecords(initial, toRecords(loaded.state, loaded.users)).length, 0);
  assert.equal(initial.find(row => row.table === 'assignments').member_id, 'member-006');
});
test('local mode rejects stale changes without mutating its input', () => {
  const row = initial.find(row => row.table === 'survey_responses');
  const change = {table: row.table, id: row.id, before: row, after: {...row, data: {...row.data, response: {...row.data.response, note: 'edited'}}}};
  const updated = applyChanges(initial, [change]);
  assert.throws(() => applyChanges(updated, [change]), /其他人修改/);
  assert.notEqual(row.data.response.note, 'edited');
});
test('database is closed by default; demo grants expose only RPCs', async () => {
  await db.exec('set role anon');
  await assert.rejects(snapshot, /permission denied/);
  await db.exec('reset role');
  await db.exec(await fs.readFile(new URL('../supabase/enable-demo.sql', import.meta.url), 'utf8'));
  await db.exec('set role anon');
  assert.ok((await snapshot()).length > 100);
  await assert.rejects(() => db.query('select * from public.members'), /permission denied/);
  await assert.rejects(() => db.query("delete from public.members"), /permission denied/);
});
test('two members can save independently, same member stale edit is rejected', async () => {
  const rows = await snapshot();
  const responses = rows.filter(row => row.table === 'survey_responses');
  const changes = responses.slice(0, 2).map((row, index) => ({table: row.table, id: row.id, before: row, after: {...row, data: {...row.data, response: {...row.data.response, note: `member ${index}`, availability: {'12/7': 'no'}}}}}));
  await commit([changes[0]]);
  await commit([changes[1]]);
  await assert.rejects(() => commit([changes[0]]), /其他人修改/);
  const loaded = fromRecords(await snapshot());
  assert.equal(Object.values(loaded.state.prayerSurvey.monday).filter(r => r.availability?.['12/7'] === 'no').length, 2);
});
test('failed substitute batch rolls back the assignment and the request together', async () => {
  const rows = await snapshot();
  const assignment = rows.find(row => row.table === 'assignments' && row.group_id === 'monday' && row.data.date === '11/16' && row.data.service === '敬拜');
  const request = rows.find(row => row.table === 'leave_requests');
  const change = row => ({table: row.table, id: row.id, before: row, after: {...row, member_id: 'member-002'}});
  await assert.rejects(() => commit([change(assignment), {...change(request), before: null}]), /其他人修改/);
  const after = await snapshot();
  assert.ok(equal(after.find(row => row.table === assignment.table && row.id === assignment.id), assignment));
  assert.ok(equal(after.find(row => row.table === request.table && row.id === request.id), request));
  const requestChange = {table: request.table, id: request.id, before: request, after: {...request, data: {...request.data, status: 'filled', substitute_id: 'member-002'}}};
  await commit([change(assignment), requestChange]);
  await assert.rejects(() => commit([change(assignment), requestChange]), /其他人修改/);
});
test('RPC rejects unknown tables and invalid foreign keys', async () => {
  await assert.rejects(() => commit([{table: 'pg_authid', id: 'x', before: null, after: null}]), /Invalid table/);
  await assert.rejects(() => commit([{table: 'memberships', id: 'bad', before: null, after: {table: 'memberships', id: 'bad', group_id: 'monday', member_id: 'missing', data: {role: 'member'}}}]), /foreign key/);
});
