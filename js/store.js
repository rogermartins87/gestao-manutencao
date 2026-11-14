// =====================================================================
// Estado da sessão: usuário logado, perfil de acesso e permissões.
// As permissões aqui servem só para mostrar/esconder botões;
// quem realmente bloqueia é o banco (RLS).
// =====================================================================
import { sb } from './supabase.js';

export const store = {
  sessao: null,
  usuario: null,        // auth.users
  perfil: null,         // public.profiles (+ role)
  permissoes: new Set(),
  empresa: null,        // company_settings
};

export const pode = (codigo) => store.permissoes.has(codigo);
export const papel = () => store.perfil?.role?.code || null;
export const ativo = () => store.perfil?.status === 'ativo';

export async function carregarPerfil() {
  const { data, error } = await sb
    .from('profiles')
    .select('*, role:roles(id, code, name)')
    .eq('id', store.usuario.id)
    .maybeSingle();
  if (error) throw error;
  store.perfil = data;
  store.permissoes = new Set();
  store.empresa = null;
  if (!ativo()) return data;

  const [perms, emp] = await Promise.all([
    sb.rpc('minhas_permissoes'),
    sb.from('company_settings').select('*').maybeSingle(),
  ]);
  if (perms.error) throw perms.error;
  store.permissoes = new Set(perms.data || []);
  store.empresa = emp.data || null;
  sb.rpc('registrar_acesso').then(() => {}, () => {});
  return data;
}

export function limparSessao() {
  store.sessao = null; store.usuario = null; store.perfil = null;
  store.permissoes = new Set(); store.empresa = null;
}
