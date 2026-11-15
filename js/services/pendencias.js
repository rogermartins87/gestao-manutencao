// =====================================================================
// Serviço: pendências (tarefas avulsas) e avisos (o "sininho").
// Os avisos são criados só pelo banco; aqui se lê, marca como lido e apaga.
// =====================================================================
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const STATUS_PEND = {
  aberta: { nome: 'A fazer', classe: 'info', icone: 'circle' },
  em_andamento: { nome: 'Em andamento', classe: 'aviso', icone: 'loader' },
  concluida: { nome: 'Concluída', classe: 'ativo', icone: 'circle-check' },
  cancelada: { nome: 'Cancelada', classe: 'inativo', icone: 'circle-x' },
};
export const ABERTAS = ['aberta', 'em_andamento'];

const CAMPOS = ['title', 'description', 'equipment_id', 'work_order_id', 'assigned_to', 'due_date', 'priority', 'status', 'done_note', 'cancel_reason'];
const so = (d) => Object.fromEntries(CAMPOS.filter((c) => c in d).map((c) => [c, d[c]]));

export const listar = async () => ok(await sb.from('vw_pending_tasks').select('*').order('due_date', { ascending: true }).limit(2000));
export const doEquipamento = async (eqId) => ok(await sb.from('vw_pending_tasks').select('*').eq('equipment_id', eqId).order('created_at', { ascending: false }));
export const daOS = async (osId) => ok(await sb.from('vw_pending_tasks').select('*').eq('work_order_id', osId).order('created_at', { ascending: false }));
export const ler = async (id) => ok(await sb.from('vw_pending_tasks').select('*').eq('id', id).maybeSingle());
export const criar = async (d) => ok(await sb.from('pending_tasks').insert(so(d)).select('id').single());
// .select() devolve a linha: se a segurança do banco não deixou alterar, vem vazio
export async function salvar(id, d) {
  const r = ok(await sb.from('pending_tasks').update(so(d)).eq('id', id).select('id'));
  if (!r?.length) throw new Error('Você não pode alterar esta pendência: só quem criou, o responsável ou o gestor.');
  return r[0];
}
export const alteracoes = async (id) =>
  ok(await sb.from('audit_logs').select('*').eq('table_name', 'pending_tasks').eq('record_id', id).order('created_at', { ascending: false }).limit(100));
export const pessoasAtivas = async () => ok(await sb.from('profiles').select('id, full_name').eq('status', 'ativo').order('full_name'));

// ---------- Avisos ----------
export const avisos = async (limite = 30) => ok(await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(limite));
export const naoLidos = async () => ok(await sb.rpc('avisos_nao_lidos'));
export const marcarLidos = async (ids = null) => ok(await sb.rpc('marcar_avisos_lidos', { p_ids: ids }));
export const apagarAviso = async (id) => ok(await sb.from('notifications').delete().eq('id', id));
export const apagarLidos = async () => ok(await sb.from('notifications').delete().not('read_at', 'is', null));

export const ICONE_AVISO = {
  pendencia_atribuida: 'list-todo', pendencia_concluida: 'circle-check', pendencia_cancelada: 'circle-x',
  os_atribuida: 'user-check', os_aprovar: 'stamp', os_concluida: 'clipboard-check', os_cancelada: 'clipboard-x',
  inspecao_critica: 'octagon-alert', conta_pendente: 'user-plus',
};
