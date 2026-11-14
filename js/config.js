// =====================================================================
// CONFIGURAÇÃO DO SUPABASE
// Supabase → Project Settings → API:
//   * Project URL
//   * chave "publishable" (ou "anon public"). Ela é pública por natureza:
//     a proteção dos dados é feita pelas políticas RLS do banco.
// NUNCA coloque aqui a chave "secret" / "service_role".
// =====================================================================
export const SUPABASE_URL = 'https://txqdyjtruhxtwkrlyfwt.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_NuXSxUnbIQoRC0j2WbXdCg_6XRXk2Jm';
