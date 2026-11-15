// =====================================================================
// Serviço: produção por turno e OEE (Etapa 13).
// O cálculo do OEE é todo do banco (oee_equipamentos / oee_mensal);
// aqui só se junta a planta (ponderado pelas horas programadas).
// =====================================================================
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const SELO_OEE = {
  completo: null,
  sem_calendario: 'cadastre o horário de funcionamento',
  sem_horas_programadas: 'sem horário programado no período',
  sem_producao: 'nenhum turno lançado no período',
  sem_tempo_rodando: 'ficou parado todo o horário programado',
};

// ---------- Turnos ----------
export const turnos = async () => ok(await sb.from('production_shifts').select('*').order('sort_order').order('start_time'));
export const criarTurno = async (d) => ok(await sb.from('production_shifts').insert(d).select('id').single());
export const salvarTurno = async (id, d) => ok(await sb.from('production_shifts').update(d).eq('id', id).select('id').single());

// ---------- Equipamentos que medem OEE ----------
export const equipamentosOEE = async () =>
  ok(await sb.from('equipment').select('id, tag, name, sector, status, production_unit, ideal_rate').eq('oee_enabled', true).neq('status', 'desativado').order('tag'));
export const dadosOEE = async (id) =>
  ok(await sb.from('equipment').select('oee_enabled, production_unit, ideal_rate').eq('id', id).maybeSingle());

// ---------- Lançamentos ----------
export const lancamentos = async ({ desde, ate, equipamento = null, todos = false }) => {
  let q = sb.from('production_records').select('*').gte('shift_date', desde).lte('shift_date', ate);
  if (equipamento) q = q.eq('equipment_id', equipamento);
  if (!todos) q = q.eq('status', 'valida');
  return ok(await q.order('shift_date', { ascending: false }).order('created_at', { ascending: false }).limit(5000));
};
export const lancar = async (d) => ok(await sb.from('production_records').insert(d).select('id').single());
export const corrigir = async (id, produzido, refugo, justificativa) =>
  ok(await sb.rpc('corrigir_producao', { p_registro: id, p_produzido: produzido, p_refugo: refugo, p_justificativa: justificativa }));
export const anular = async (id, justificativa) => ok(await sb.rpc('anular_producao', { p_registro: id, p_justificativa: justificativa }));

// ---------- OEE ----------
export const porEquipamento = async (inicio, fim, equipamento = null) =>
  ok(await sb.rpc('oee_equipamentos', { p_inicio: inicio, p_fim: fim, p_equipamento: equipamento })) || [];
export const mensal = async (meses = 12, equipamento = null) =>
  ok(await sb.rpc('oee_mensal', { p_meses: meses, p_equipamento: equipamento })) || [];

// OEE da planta: média dos equipamentos com OEE, pesando pelas horas programadas de cada um
export function planta(linhas) {
  const com = linhas.filter((l) => l.oee != null && Number(l.scheduled_hours) > 0);
  const h = com.reduce((a, l) => a + Number(l.scheduled_hours), 0);
  const pond = (k) => (h ? com.reduce((a, l) => a + Number(l[k] ?? 0) * Number(l.scheduled_hours), 0) / h : null);
  return {
    maquinas: linhas.length, comOEE: com.length, horas: h,
    oee: pond('oee'), disponibilidade: pond('availability'), performance: pond('performance'), qualidade: pond('quality'),
    semCalendario: linhas.some((l) => l.oee_seal === 'sem_calendario'),
    acimaIdeal: linhas.filter((l) => l.performance_capped).length,
  };
}
