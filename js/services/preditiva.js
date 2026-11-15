// =====================================================================
// Serviço: manutenção preditiva — pontos de medição (com limites),
// inspeções e medições. Inspeção é gravada só pela RPC registrar_inspecao
// (o banco calcula o status de cada medição e o resultado).
// =====================================================================
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const TECNICA = {
  vibracao: { nome: 'Vibração', icone: 'activity' },
  termografia: { nome: 'Termografia', icone: 'thermometer' },
  analise_oleo: { nome: 'Análise de óleo', icone: 'droplet' },
  ultrassom: { nome: 'Ultrassom', icone: 'audio-lines' },
  outra: { nome: 'Outra / visual', icone: 'eye' },
};
export const RESULTADO = {
  critico: { nome: 'Crítico', classe: 'perigo', icone: 'octagon-alert' },
  alerta: { nome: 'Alerta', classe: 'aviso', icone: 'triangle-alert' },
  normal: { nome: 'Normal', classe: 'ativo', icone: 'circle-check' },
  sem_limite: { nome: 'Sem limite', classe: 'inativo', icone: 'minus' },
  sem_medicao: { nome: 'Sem medição', classe: 'inativo', icone: 'circle-dashed' },
  inativo: { nome: 'Desativado', classe: 'inativo', icone: 'circle-off' },
};
export const SENTIDO = { acima: 'Acima do limite é ruim (vibração, temperatura)', abaixo: 'Abaixo do limite é ruim (viscosidade, pressão)' };

// Mesmo cálculo do banco (classificar_medicao), para mostrar a cor enquanto digita
export function classificar(valor, alerta, critico, sentido = 'acima') {
  if (valor == null || Number.isNaN(valor)) return null;
  if (alerta == null && critico == null) return 'sem_limite';
  const a = alerta == null ? null : Number(alerta); const c = critico == null ? null : Number(critico);
  if (sentido === 'abaixo') return c != null && valor <= c ? 'critico' : a != null && valor <= a ? 'alerta' : 'normal';
  return c != null && valor >= c ? 'critico' : a != null && valor >= a ? 'alerta' : 'normal';
}

// ---------- Pontos ----------
const CAMPOS = ['equipment_id', 'name', 'technique', 'variable', 'unit', 'direction', 'alert_limit', 'critical_limit',
  'interval_days', 'notes', 'active', 'deactivated_reason'];
const so = (d) => Object.fromEntries(CAMPOS.filter((c) => c in d).map((c) => [c, d[c]]));

export const pontos = async () => ok(await sb.from('vw_inspection_points').select('*').order('equipment_tag'));
export const pontosDoEquipamento = async (eqId) => ok(await sb.from('vw_inspection_points').select('*').eq('equipment_id', eqId).order('name'));
export const lerPonto = async (id) => ok(await sb.from('vw_inspection_points').select('*').eq('id', id).maybeSingle());
export const criarPonto = async (d) => ok(await sb.from('inspection_points').insert(so(d)).select('id').single());
export const salvarPonto = async (id, d) => ok(await sb.from('inspection_points').update(so(d)).eq('id', id).select('id').single());

// ---------- Inspeções ----------
export const inspecoes = async (desde) => {
  let q = sb.from('vw_inspections').select('*');
  if (desde) q = q.gte('performed_at', desde);
  return ok(await q.order('performed_at', { ascending: false }).limit(1000));
};
export const inspecoesDoEquipamento = async (eqId) =>
  ok(await sb.from('vw_inspections').select('*').eq('equipment_id', eqId).order('performed_at', { ascending: false }).limit(500));
export const lerInspecao = async (id) => ok(await sb.from('vw_inspections').select('*').eq('id', id).maybeSingle());
export const inspecaoDaOS = async (osId) => ok(await sb.from('vw_inspections').select('*').eq('work_order_id', osId).maybeSingle());
export const medicoes = async (inspId) =>
  ok(await sb.from('inspection_measurements').select('*').eq('inspection_id', inspId).order('point'));
export const historicoDoPonto = async (pontoId) =>
  ok(await sb.from('vw_inspection_measurements').select('*').eq('point_id', pontoId).is('voided_at', null).order('performed_at', { ascending: false }).limit(500));

export const registrar = async ({ equipamento, tipo, quando, resultado, observacoes, medicoes: lista }) =>
  ok(await sb.rpc('registrar_inspecao', { p_equipamento: equipamento, p_tipo: tipo, p_quando: quando,
    p_resultado: resultado || null, p_observacoes: observacoes || null, p_medicoes: lista }));
export const anular = async (id, motivo) => ok(await sb.rpc('anular_inspecao', { p_inspecao: id, p_motivo: motivo }));
export const gerarOS = async (id, prioridade = null, responsavel = null, prazo = null) =>
  ok(await sb.rpc('gerar_os_inspecao', { p_inspecao: id, p_prioridade: prioridade, p_responsavel: responsavel, p_prazo: prazo }));

export const alteracoes = async (ids) =>
  ok(await sb.from('audit_logs').select('*').in('table_name', ['inspections', 'inspection_points'])
    .or(ids.map((i) => `record_id.eq.${i}`).join(','))
    .order('created_at', { ascending: false }).limit(200));

// 4.2 → "4,2"; 10 → "10"
export const fmtMedida = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 }));
export function textoLimites(p) {
  const s = p.direction === 'abaixo' ? '≤' : '≥';
  const partes = [];
  if (p.alert_limit != null) partes.push(`alerta ${s} ${fmtMedida(p.alert_limit)}`);
  if (p.critical_limit != null) partes.push(`crítico ${s} ${fmtMedida(p.critical_limit)}`);
  return partes.length ? `${partes.join(' · ')} ${p.unit}` : 'sem limites';
}
