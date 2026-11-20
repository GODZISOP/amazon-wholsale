/**
 * Supabase Configuration
 */
window.SUPABASE_CONFIG = {
  url: "https://loktzfoqddojwcnpdmvs.supabase.co",
  anonKey: "sb_publishable_KjL9PATPlZpgL1MoqVg1sA_8goZjD1U",
  table: "portfolio_config",
  rowId: "main",
  bucket: "portfolio-assets"
};

window.getSupabaseHeaders = function (key, extra = {}) {
  const headers = Object.assign({ apikey: key }, extra);
  if (key && key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
};
