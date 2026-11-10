import { createRepository } from './repository.js';
import { toRecords, fromRecords, diffRecords } from './records.js';

export const users = [];
export const state = {...fromRecords([]).state, currentUser: null, currentGroup: null};
export const LEVEL_RANK = { '無': 0, '成長班（含在上）': 1, '門徒班（含在上）': 2, '領袖班結業': 3 };
export const SERVICES = ['會前禱告', '破冰', '敬拜', '音控', '見證', '異象報告', '話語'];
const sessionKey = 'group-life-selection-v1';
let repository, baseline = [], ready = false, dirty = false, timer, pending, blocked = false, loading = false, version = 0;
let refresh = () => {};
export function onRefresh(callback) { refresh = callback; }
export function loadSession() { try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch { return null; } }
function status(message, isError = false) {
  document.getElementById('storageError').hidden = !isError;
  document.getElementById('storageStatus').textContent = isError ? message : '';
}
function setSnapshot(rows) {
  const snapshot = fromRecords(rows);
  users.splice(0, users.length, ...snapshot.users);
  Object.assign(state, snapshot.state);
  if (!users.some(user => user.name === state.currentUser)) state.currentUser = null;
  if (!state.groups[state.currentGroup]) state.currentGroup = Object.keys(state.groups)[0];
  baseline = toRecords(state, users);
}
function savedStatus() { status('已儲存至 Supabase（共用測試資料）'); }
export async function initialize() {
  try {
    repository = createRepository();
    const session = loadSession();
    state.currentGroup = session?.currentGroup || state.currentGroup;
    setSnapshot(await repository.load());
    state.currentUser = users.find(user => user.id === session?.currentMemberId)?.name || null;
    ready = true;
    status('已連接 Supabase 資料庫');
    return true;
  } catch (error) { status(`載入失敗：${error.message}。請檢查設定後重新整理。`, true); return false; }
}
export function save() {
  version++;
  sessionStorage.setItem(sessionKey, JSON.stringify({currentMemberId: users.find(user => user.name === state.currentUser)?.id || null, currentGroup: state.currentGroup}));
  if (!ready) return;
  dirty = true;
  if (blocked) return;
  status('尚未儲存…');
  clearTimeout(timer);
  timer = setTimeout(() => flush().catch(() => {}), 280);
}
export async function flush() {
  clearTimeout(timer);
  if (pending) { await pending; if (dirty) return flush(); return; }
  if (!dirty) return;
  if (blocked) throw new Error('請先重試儲存或重新載入資料。');
  const snapshot = toRecords(state, users);
  const changes = diffRecords(baseline, snapshot);
  dirty = false;
  status('儲存中…');
  pending = repository.commit(changes);
  try {
    await pending;
    baseline = snapshot;
    savedStatus();
  } catch (error) {
    dirty = true;
    blocked = true;
    status(`未儲存：${error.message}`, true);
    document.getElementById('retrySave').hidden = false;
    throw error;
  } finally { pending = null; }
  if (dirty) return flush();
}
export async function retrySave() {
  blocked = false;
  document.getElementById('retrySave').hidden = true;
  try { await flush(); } catch { /* Keep the error and retry control visible. */ }
}
export async function reloadData(manual = false) {
  if (!ready || pending || loading) return;
  if ((dirty || blocked) && (!manual || !confirm('尚有未儲存的修改。要放棄修改並載入最新資料嗎？'))) return;
  if (!manual && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  loading = true;
  const startedVersion = version;
  try {
    const rows = await repository.load();
    if (version !== startedVersion || pending || (!manual && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName))) return;
    const snapshot = fromRecords(rows);
    if (!manual && !diffRecords(baseline, toRecords(snapshot.state, snapshot.users)).length) {savedStatus(); return;}
    clearTimeout(timer);
    setSnapshot(rows);
    dirty = blocked = false;
    document.getElementById('retrySave').hidden = true;
    savedStatus();
    refresh();
  } catch (error) { status(`重新載入失敗：${error.message}`, true); }
  finally { loading = false; }
}
export function startSync() {
  setInterval(() => { if (!document.hidden) reloadData(); }, 10000);
  window.addEventListener('focus', () => reloadData());
  window.addEventListener('beforeunload', event => { if (dirty || pending) { event.preventDefault(); event.returnValue = ''; } });
  document.getElementById('retrySave').onclick = retrySave;
  document.getElementById('reloadData').onclick = () => ready ? reloadData(true) : location.reload();
}
