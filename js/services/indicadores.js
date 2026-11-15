// =====================================================================
// Serviço: indicadores (disponibilidade, MTBF, MTTR, custos) e o
// calendário de funcionamento (horário normal + exceções).
// O cálculo é todo do banco (indicadores_equipamentos / indicadores_mensais);
// aqui só se soma a usina e se explica de onde veio cada número.
// =====================================================================
import { daPlanta, argPlanta } from '../plantas.js';
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Selo de cada indicador: diz se o número é completo, parcial ou por que não há número
export const SELO = {
  completo: null,
  parcial: 'parcial',
  sem_calendario: 'cadastre o horário de funcionamento',
  sem_horas_programadas: 'sem horário programado no período',
  sem_horimetro: 'equipamento sem horímetro',
  sem_leituras: 'faltam leituras do horímetro',
  sem_falhas: 'sem falhas no período',
  sem_reparos: 'sem reparos no período',
};

// ---------- Indicadores ----------
export const porEquipamento = async (inicio, fim, equipamento = null) =>
  ok(await sb.rpc('indicadores_equipamentos', { p_inicio: inicio, p_fim: fim, p_equipamento: equipamento, ...argPlanta(equipamento) })) || [];
export const mensais = async (meses = 12, equipamento = null) =>
  ok(await sb.rpc('indicadores_mensais', { p_meses: meses, p_equipamento: equipamento, ...argPlanta(equipamento) })) || [];

const n = (v) => (v == null ? 0 : Number(v));
const soma = (l, k) => l.reduce((s, x) => s + n(x[k]), 0);

// Soma a usina (ou o grupo filtrado) a partir das linhas por equipamento
export function somar(linhas) {
  const comDisp = linhas.filter((l) => l.availability_seal === 'completo');
  const prog = soma(comDisp, 'scheduled_hours'); const parado = soma(comDisp, 'downtime_hours');
  const comHm = linhas.filter((l) => ['completo', 'parcial', 'sem_falhas'].includes(l.mtbf_seal));
  const operadas = soma(comHm, 'operated_hours');
  const falhasMtbf = soma(linhas.filter((l) => ['completo', 'parcial'].includes(l.mtbf_seal)), 'failures');
  const falhas = soma(linhas, 'failures');
  const reparos = soma(linhas, 'repairs'); const hReparo = soma(linhas, 'repair_hours');
  const concl = soma(linhas, 'wo_finished'); const corr = soma(linhas, 'wo_corrective_finished');
  const custos = linhas.some((l) => l.cost_total != null);
  return {
    equipamentos: linhas.length,
    semCalendario: linhas.some((l) => l.availability_seal === 'sem_calendario'),
    comCalendario: comDisp.length,
    horasProgramadas: prog, horasParadas: parado,
    disponibilidade: prog > 0 ? (100 * (prog - parado)) / prog : null,
    horasOperadas: operadas, comHorimetro: comHm.length,
    falhas, falhasSemHorimetro: falhas - falhasMtbf,
    mtbf: falhasMtbf > 0 && comHm.length ? operadas / falhasMtbf : null,
    mtbfParcial: linhas.some((l) => l.mtbf_seal === 'parcial'),
    reparos, horasReparo: hReparo,
    mttr: reparos > 0 ? hReparo / reparos : null,
    mttrParcial: linhas.some((l) => l.mttr_seal === 'parcial'),
    osConcluidas: concl, corretivas: corr, preventivas: soma(linhas, 'wo_preventive_finished'), osAbertas: soma(linhas, 'wo_opened'),
    taxaCorretiva: concl > 0 ? (100 * corr) / concl : null,
    custos: custos ? {
      maoDeObra: soma(linhas, 'cost_labor'), pecas: soma(linhas, 'cost_parts'), servicos: soma(linhas, 'cost_external'),
      total: soma(linhas, 'cost_total'), corretiva: soma(linhas, 'cost_corrective'),
    } : null,
  };
}

// ---------- Calendário de funcionamento ----------
export const horarios = async () =>
  ok(await sb.from('operating_schedules').select('*').order('weekday').order('start_time'));
export const excecoes = async (desde) =>
  ok(await sb.from('operating_exceptions').select('*').gte('date', desde).order('date').limit(500));
export const criarHorarios = async (linhas) => ok(await sb.from('operating_schedules').insert(linhas).select('id'));
export const apagarHorarios = async (ids) => ok(await sb.from('operating_schedules').delete().in('id', ids));
export const criarExcecao = async (d) => ok(await sb.from('operating_exceptions').insert(d).select('id').single());
export const apagarExcecao = async (id) => ok(await sb.from('operating_exceptions').delete().eq('id', id));

// "06:00:00" → "06:00"; fim igual ou antes do início = vira o dia
export const hora = (t) => (t ? String(t).slice(0, 5) : '');
export function faixa(ini, fim) {
  const a = hora(ini); const b = hora(fim);
  if (a === b) return a === '00:00' ? '24 horas' : `${a} – ${b} (dia seguinte)`;
  if (b === '00:00') return `${a} – 24:00`;
  return b < a ? `${a} – ${b} (dia seguinte)` : `${a} – ${b}`;
}
export function horasFaixa(ini, fim) {
  const m = (t) => { const [h, mi] = hora(t).split(':').map(Number); return h * 60 + mi; };
  let d = m(fim) - m(ini); if (d <= 0) d += 24 * 60;
  return d / 60;
}

// ---------- Listas para os relatórios ----------
export const pecasTrocadas = async (desde, ate) =>
  daPlanta(ok(await sb.from('vw_work_order_parts').select('*').is('removed_at', null).gte('replaced_at', desde).lt('replaced_at', ate)
    .order('replaced_at', { ascending: false }).limit(5000)));
export const ordensDoPeriodo = async (desde, ate) =>
  daPlanta(ok(await sb.from('vw_work_orders').select('*').gte('created_at', desde).lt('created_at', ate).order('created_at', { ascending: false }).limit(5000)));
export const paradasDoPeriodo = async (desde, ate) =>
  daPlanta(ok(await sb.from('vw_downtime_events').select('*').lt('started_at', ate).or(`ended_at.is.null,ended_at.gte.${desde}`)
    .order('started_at', { ascending: false }).limit(5000)));
export const inspecoesDoPeriodo = async (desde, ate) =>
  daPlanta(ok(await sb.from('vw_inspections').select('*').gte('performed_at', desde).lt('performed_at', ate).order('performed_at', { ascending: false }).limit(5000)));
export const preventivasDoPeriodo = async (desde, ate) =>
  daPlanta(ok(await sb.from('vw_maintenance_schedule').select('*').eq('status', 'executada').gte('executed_at', desde).lt('executed_at', ate)
    .order('executed_at', { ascending: false }).limit(5000)));
