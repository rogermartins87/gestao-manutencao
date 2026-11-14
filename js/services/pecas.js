// =====================================================================
// Serviço: catálogo de peças, peças usadas na OS, custos de peças e
// serviços externos, histórico de trocas por equipamento.
// O banco copia código/nome/custo no momento do uso e esconde os R$ de
// quem não tem permissão de ver custos.
// =====================================================================
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const UNIDADE = { un: 'Unidade (un)', par: 'Par', jogo: 'Jogo', cx: 'Caixa (cx)', m: 'Metro (m)', kg: 'Quilo (kg)', L: 'Litro (L)' };
export const INTEIRAS = ['un', 'par', 'jogo', 'cx'];
export const TIPO_CUSTO = { servico_externo: 'Serviço externo', outro: 'Outro custo' };
export const MOTIVOS_TROCA = ['Desgaste', 'Quebra', 'Preventiva programada', 'Vazamento', 'Superaquecimento', 'Ruído / vibração', 'Melhoria'];

export const fmtQtd = (q, unidade) => {
  const n = Number(q);
  const casas = INTEIRAS.includes(unidade) || Number.isInteger(n) ? 0 : 3;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: casas })} ${unidade || ''}`.trim();
};

// ---------- Catálogo ----------
const CAMPOS = ['code', 'name', 'description', 'manufacturer', 'manufacturer_code', 'unit', 'category', 'active'];
const so = (d) => Object.fromEntries(CAMPOS.filter((c) => c in d).map((c) => [c, d[c]]));

export const catalogo = async () => ok(await sb.from('parts_catalog').select('*').order('code'));
export const ler = async (id) => ok(await sb.from('parts_catalog').select('*').eq('id', id).maybeSingle());
export const criar = async (d) => ok(await sb.from('parts_catalog').insert(so(d)).select('id').single());
export const salvar = async (id, d) => ok(await sb.from('parts_catalog').update(so(d)).eq('id', id).select('id').single());

// Custo de referência (só quem vê custos)
export const custosReferencia = async () => ok(await sb.from('part_reference_costs').select('*'));
export async function definirCustoReferencia(id, valor, existe) {
  return existe
    ? ok(await sb.from('part_reference_costs').update({ cost: valor }).eq('id', id).select().single())
    : ok(await sb.from('part_reference_costs').insert({ id, cost: valor }).select().single());
}

// ---------- Peças na OS ----------
export const daOS = async (osId) =>
  ok(await sb.from('vw_work_order_parts').select('*').eq('work_order_id', osId).is('removed_at', null).order('replaced_at', { ascending: true }));

export const usosDaPeca = async (partId) =>
  ok(await sb.from('vw_work_order_parts').select('*').eq('part_id', partId).is('removed_at', null).order('replaced_at', { ascending: false }));

export const lancar = async (d) => ok(await sb.from('work_order_parts').insert(d).select('id').single());
export const alterar = async (id, d) => ok(await sb.from('work_order_parts').update(d).eq('id', id).select('id').single());
export const remover = async (id, motivo) =>
  ok(await sb.from('work_order_parts').update({ removed_at: new Date().toISOString(), removed_reason: motivo }).eq('id', id).select('id').single());
export const definirCusto = async (id, valor) => ok(await sb.rpc('definir_custo_peca', { p_uso: id, p_custo_unitario: valor }));

// ---------- Custos da OS ----------
export const custosOS = async (osId) => ok(await sb.from('vw_work_order_costs').select('*').eq('work_order_id', osId).maybeSingle());
export const servicos = async (osId) =>
  ok(await sb.from('maintenance_costs').select('*').eq('work_order_id', osId).is('removed_at', null).order('incurred_at', { ascending: true }));
export const lancarServico = async (d) => ok(await sb.from('maintenance_costs').insert(d).select('id').single());
export const removerServico = async (id, motivo) =>
  ok(await sb.from('maintenance_costs').update({ removed_at: new Date().toISOString(), removed_reason: motivo }).eq('id', id).select('id').single());

// ---------- Histórico por equipamento ----------
export const historicoEquipamento = async (eqId) =>
  ok(await sb.from('vw_equipment_parts_history').select('*').eq('equipment_id', eqId));

export const alteracoes = async (id) =>
  ok(await sb.from('audit_logs').select('*').in('table_name', ['parts_catalog', 'part_reference_costs'])
    .eq('record_id', id).order('created_at', { ascending: false }).limit(100));
