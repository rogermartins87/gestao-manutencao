// =====================================================================
// Serviço: ordens de serviço, mão de obra, anexos e custo da hora.
// O banco decide número, status, quem pode o quê e o custo copiado.
// =====================================================================
import { daPlanta } from '../plantas.js';
import { sb, BUCKET } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const STATUS_OS = {
  aberta: { nome: 'Aberta', classe: 'info', icone: 'inbox' },
  aprovada: { nome: 'Aprovada', classe: 'info', icone: 'badge-check' },
  planejada: { nome: 'Planejada', classe: 'info', icone: 'calendar-clock' },
  em_execucao: { nome: 'Em execução', classe: 'aviso', icone: 'wrench' },
  aguardando_pecas: { nome: 'Aguardando peças', classe: 'perigo', icone: 'package-search' },
  aguardando_terceiros: { nome: 'Aguardando terceiros', classe: 'perigo', icone: 'users' },
  concluida: { nome: 'Concluída', classe: 'ativo', icone: 'circle-check' },
  cancelada: { nome: 'Cancelada', classe: 'inativo', icone: 'circle-x' },
};
export const ENCERRADAS = ['concluida', 'cancelada'];
export const TIPO_OS = {
  corretiva: 'Corretiva', preventiva: 'Preventiva', preditiva: 'Preditiva', inspecao: 'Inspeção', melhoria: 'Melhoria',
};
export const PRIORIDADE = {
  urgente: { nome: 'Urgente', classe: 'perigo' },
  alta: { nome: 'Alta', classe: 'aviso' },
  media: { nome: 'Média', classe: 'info' },
  baixa: { nome: 'Baixa', classe: 'inativo' },
};
export const TIPO_ANEXO = { foto: 'Foto', relatorio: 'Relatório', outro: 'Outro' };

const CAMPOS = ['equipment_id', 'type', 'is_failure', 'priority', 'title', 'description', 'assigned_to', 'planned_start', 'due_date'];
const so = (d) => Object.fromEntries(CAMPOS.filter((c) => c in d).map((c) => [c, d[c]]));

export const listar = async () =>
  daPlanta(ok(await sb.from('vw_work_orders').select('*').order('created_at', { ascending: false })));

export const listarDoEquipamento = async (equipmentId) =>
  ok(await sb.from('vw_work_orders').select('*').eq('equipment_id', equipmentId).order('created_at', { ascending: false }));

export const ler = async (id) =>
  ok(await sb.from('vw_work_orders').select('*').eq('id', id).maybeSingle());

export const criar = async (dados) =>
  ok(await sb.from('work_orders').insert(so(dados)).select('id').single());

export const salvar = async (id, dados) =>
  ok(await sb.from('work_orders').update(so(dados)).eq('id', id).select('id').single());

export const mudarStatus = async (id, status, nota) =>
  ok(await sb.rpc('mudar_status_os', { p_os: id, p_status: status, p_nota: nota || null }));

export const concluir = async (id, solucao, quando) =>
  ok(await sb.rpc('concluir_os', { p_os: id, p_solucao: solucao, p_concluida_em: quando || null }));

export const cancelar = async (id, motivo) =>
  ok(await sb.rpc('cancelar_os', { p_os: id, p_motivo: motivo }));

export const responsaveis = async () => ok(await sb.rpc('responsaveis_os'));

export const historico = async (id) =>
  ok(await sb.from('work_order_status_history')
    .select('*, autor:profiles!work_order_status_history_changed_by_fkey(full_name)')
    .eq('work_order_id', id).order('changed_at', { ascending: true }));

// ---------- Mão de obra ----------
export const maoDeObra = async (id) =>
  ok(await sb.from('work_order_labor')
    .select('*, tecnico:profiles!work_order_labor_technician_id_fkey(full_name), autor:profiles!work_order_labor_created_by_fkey(full_name)')
    .eq('work_order_id', id).order('started_at', { ascending: true }));

export const custosMaoDeObra = async (ids) =>
  (ids.length ? ok(await sb.from('work_order_labor_costs').select('*').in('labor_id', ids)) : []);

export const lancarMaoDeObra = async (dados) =>
  ok(await sb.from('work_order_labor').insert(dados).select('id').single());

export const alterarMaoDeObra = async (id, dados) =>
  ok(await sb.from('work_order_labor').update(dados).eq('id', id).select('id').single());

// ---------- Custo da hora ----------
export const taxas = async () => ok(await sb.from('labor_rates').select('*'));
export const salvarTaxa = async (id, valor) =>
  ok(await sb.from('labor_rates').update({ hourly_cost: valor }).eq('id', id).select().single());
export const criarTaxa = async (profileId, valor) =>
  ok(await sb.from('labor_rates').insert({ profile_id: profileId, hourly_cost: valor }).select().single());

// ---------- Anexos ----------
export const anexos = async (id) =>
  ok(await sb.from('work_order_attachments')
    .select('*, autor:profiles!work_order_attachments_created_by_fkey(full_name)')
    .eq('work_order_id', id).is('removed_at', null).order('created_at', { ascending: false }));

const limparNome = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);

export async function enviarAnexo(osId, arquivo, { titulo, tipo }) {
  const caminho = `ordens/${osId}/${crypto.randomUUID()}-${limparNome(arquivo.name)}`;
  ok(await sb.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false }));
  return ok(await sb.from('work_order_attachments').insert({
    work_order_id: osId, kind: tipo, title: titulo, storage_path: caminho,
    file_name: arquivo.name, mime_type: arquivo.type, size_bytes: arquivo.size,
  }).select().single());
}

export const removerAnexo = async (id) =>
  ok(await sb.from('work_order_attachments').update({ removed_at: new Date().toISOString() }).eq('id', id));

export async function linkAnexo(caminho) {
  return ok(await sb.storage.from(BUCKET).createSignedUrl(caminho, 120)).signedUrl;
}

export const alteracoes = async (id) =>
  ok(await sb.from('audit_logs').select('*')
    .in('table_name', ['work_orders', 'work_order_labor', 'work_order_attachments', 'work_order_parts', 'maintenance_costs'])
    .or(`record_id.eq.${id},new_data->>work_order_id.eq.${id}`)
    .order('created_at', { ascending: false }).limit(200));
