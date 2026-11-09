import { createClient } from '@supabase/supabase-js';
import { applyChanges } from './records.js';

export function createRepository(initialRows, env = import.meta.env) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (Boolean(url) !== Boolean(publicKey)) throw new Error('Supabase URL 與公開金鑰必須一起設定。');
  if (url) {
    const client = createClient(url, publicKey, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
    return {
      mode: 'cloud',
      async load() {
        const {data, error} = await client.rpc('demo_snapshot');
        if (error) throw error;
        if (!data?.length) throw new Error('資料庫沒有初始資料，請先執行 seed.sql。');
        return data;
      },
      async commit(changes) {
        if (!changes.length) return;
        const {error} = await client.rpc('demo_apply_changes', {changes});
        if (error) throw error;
      }
    };
  }
  const storageKey = 'group-life-records-v1';
  const read = () => JSON.parse(localStorage.getItem(storageKey) || 'null');
  const write = rows => localStorage.setItem(storageKey, JSON.stringify(rows));
  const locked = fn => navigator.locks.request(storageKey, fn);
  return {
    mode: 'local',
    load: () => locked(() => {
      let rows = read();
      if (!rows) { rows = structuredClone(initialRows); write(rows); }
      return rows;
    }),
    commit: changes => locked(() => { write(applyChanges(read() || [], changes)); })
  };
}
