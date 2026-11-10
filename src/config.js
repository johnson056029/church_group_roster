export function requireDatabaseConfig(env = {}) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const missing = [!url && 'VITE_SUPABASE_URL', !publicKey && 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(Boolean);
  if (missing.length) throw new Error(`缺少資料庫設定：${missing.join('、')}。請在本機環境檔或 Netlify 建置環境變數填入，並重新建置部署。`);
  try {
    if (new URL(url).protocol !== 'https:') throw new Error();
  } catch {
    throw new Error('VITE_SUPABASE_URL 必須是有效的 HTTPS Project URL。');
  }
  if (publicKey.startsWith('sb_secret_')) throw new Error('請使用公開的 publishable／anon key，不可使用 secret key。');
  return {url, publicKey};
}
