import { createClient } from '@supabase/supabase-js';
import { requireDatabaseConfig } from './config.js';

export function createRepository(env = import.meta.env) {
  const {url, publicKey} = requireDatabaseConfig(env);
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
        // A stale compare-and-swap cannot succeed on retry. Let the user reload
        // or explicitly retry after an ambiguous network failure instead.
        const {error} = await client.rpc('demo_apply_changes', {changes}).retry(false);
        if (error) throw error;
      }
    };
}
