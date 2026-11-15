// =====================================================================
// Serviço: usuários, perfis, permissões, configurações e auditoria.
// Única camada que fala com o banco para estes assuntos.
// =====================================================================
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const listarUsuarios = async () => ok(await sb.rpc('usuarios_lista'));

export const listarPerfis = async () =>
  ok(await sb.from('roles').select('id, code, name, description, sort_order').order('sort_order'));

export const listarPermissoes = async () =>
  ok(await sb.from('permissions').select('id, code, module, description').order('module').order('code'));

export const listarMatriz = async () =>
  ok(await sb.from('role_permissions').select('role_id, permission_id'));

export const listarNomesUsuarios = async () =>
  ok(await sb.from('profiles').select('id, full_name').order('full_name'));

export async function atualizarAcesso({ usuario, perfil, situacao, horimetro = false, justificativa = null }) {
  return ok(await sb.rpc('atualizar_acesso_usuario', {
    p_user: usuario, p_role_code: perfil, p_status: situacao,
    p_hour_meter: horimetro, p_justificativa: justificativa,
  }));
}

export async function concederPermissao(roleId, permissionId) {
  return ok(await sb.from('role_permissions').insert({ role_id: roleId, permission_id: permissionId }));
}

export async function retirarPermissao(roleId, permissionId) {
  return ok(await sb.from('role_permissions').delete().eq('role_id', roleId).eq('permission_id', permissionId));
}

export const lerConfiguracoes = async () => ok(await sb.from('company_settings').select('*').maybeSingle());

export async function salvarConfiguracoes({ company_name, plant_name, parameters }) {
  return ok(await sb.from('company_settings')
    .update({ company_name, plant_name, parameters })
    .eq('id', true)
    .select()
    .single());
}

// Auditoria paginada (mais recente primeiro)
export async function listarAuditoria({ de, ate, tabela, usuario, acao, pagina = 0, porPagina = 50 }) {
  let q = sb.from('audit_logs').select('*').order('created_at', { ascending: false }).order('id', { ascending: false });
  // datas do filtro são do fuso do usuário (Brasília); o banco guarda em UTC
  if (de) q = q.gte('created_at', new Date(`${de}T00:00:00`).toISOString());
  if (ate) q = q.lte('created_at', new Date(`${ate}T23:59:59.999`).toISOString());
  if (tabela) q = q.eq('table_name', tabela);
  if (usuario) q = q.eq('user_id', usuario);
  if (acao) q = q.eq('action', acao);
  return ok(await q.range(pagina * porPagina, pagina * porPagina + porPagina));   // pede 1 a mais para saber se há próxima página
}

// ---------- Plantas ----------
export const listarPlantas = async () => ok(await sb.from('plants').select('*').order('sort_order').order('name'));
export const contarEquipamentosPorPlanta = async () => {
  const ls = ok(await sb.from('equipment').select('plant_id, status'));
  const m = {};
  ls.forEach((e) => { const x = (m[e.plant_id] ||= { ativos: 0, desativados: 0 }); if (e.status === 'desativado') x.desativados++; else x.ativos++; });
  return m;
};
export const criarPlanta = async (d) => ok(await sb.from('plants').insert(d).select('id').single());
export const salvarPlanta = async (id, d) => ok(await sb.from('plants').update(d).eq('id', id).select('id').single());
