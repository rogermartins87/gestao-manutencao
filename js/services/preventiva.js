// =====================================================================
// Serviço: planos de manutenção preventiva, tarefas, agenda e cumprimento.
// A agenda é escrita só pelo banco (criação do plano, conclusão da OS,
// pular, reprogramar); a tela apenas pede.
// =====================================================================
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const GATILHO = {
  calendario: { nome: 'Por calendário', curto: 'Calendário', icone: 'calendar' },
  horimetro: { nome: 'Por horímetro', curto: 'Horímetro', icone: 'gauge' },
  o_que_vier_primeiro: { nome: 'O que vier primeiro (dias ou horas)', curto: 'Dias ou horas', icone: 'timer' },
};
export const SITUACAO = {
  vencida: { nome: 'Vencida', classe: 'perigo', icone: 'calendar-x' },
  proxima: { nome: 'Vence em breve', classe: 'aviso', icone: 'calendar-clock' },
  em_dia: { nome: 'Em dia', classe: 'ativo', icone: 'calendar-check' },
  executada: { nome: 'Executada', classe: 'ativo', icone: 'circle-check' },
  cancelada: { nome: 'Cancelada', classe: 'inativo', icone: 'circle-x' },
};
export const STATUS_AGENDA = { prevista: 'Prevista', os_gerada: 'OS gerada', executada: 'Executada', cancelada: 'Cancelada' };

// ---------- Planos ----------
const CAMPOS = ['equipment_id', 'name', 'description', 'trigger', 'interval_days', 'interval_hours', 'tolerance_days', 'tolerance_hours',
  'priority', 'default_assignee', 'first_due_date', 'first_due_hour_meter', 'active', 'deactivated_reason'];
const so = (d) => Object.fromEntries(CAMPOS.filter((c) => c in d).map((c) => [c, d[c]]));

export const planos = async () => ok(await sb.from('vw_maintenance_plans').select('*').order('equipment_tag'));
export const planosDoEquipamento = async (eqId) => ok(await sb.from('vw_maintenance_plans').select('*').eq('equipment_id', eqId).order('name'));
export const lerPlano = async (id) => ok(await sb.from('vw_maintenance_plans').select('*').eq('id', id).maybeSingle());
export const criarPlano = async (d) => ok(await sb.from('maintenance_plans').insert(so(d)).select('id').single());
export const salvarPlano = async (id, d) => ok(await sb.from('maintenance_plans').update(so(d)).eq('id', id).select('id').single());
export const desativarPlano = async (id, motivo) => salvarPlano(id, { active: false, deactivated_reason: motivo });
export const reativarPlano = async (id) => salvarPlano(id, { active: true });

// ---------- Tarefas ----------
export const tarefas = async (planoId) =>
  ok(await sb.from('maintenance_plan_tasks').select('*').eq('plan_id', planoId).order('position').order('created_at'));
export const criarTarefa = async (d) => ok(await sb.from('maintenance_plan_tasks').insert(d).select('id').single());
export const salvarTarefa = async (id, d) => ok(await sb.from('maintenance_plan_tasks').update(d).eq('id', id).select('id').single());

// ---------- Agenda ----------
export const agendaAberta = async () =>
  ok(await sb.from('vw_maintenance_schedule').select('*').in('status', ['prevista', 'os_gerada']).order('next_date', { ascending: true }));
export const agendaDoPlano = async (planoId) =>
  ok(await sb.from('vw_maintenance_schedule').select('*').eq('plan_id', planoId).order('sequence', { ascending: false }));
export const agendaDaOS = async (osId) =>
  ok(await sb.from('vw_maintenance_schedule').select('*').eq('work_order_id', osId).maybeSingle());
export const executadas = async (desde) =>
  ok(await sb.from('vw_maintenance_schedule').select('*').eq('status', 'executada').gte('executed_at', desde).order('executed_at', { ascending: false }));

export const gerarOS = async (agendaId, responsavel = null, prazo = null) =>
  ok(await sb.rpc('gerar_os_preventiva', { p_agenda: agendaId, p_responsavel: responsavel, p_prazo: prazo }));
export const gerarEmLote = async (dias) => ok(await sb.rpc('gerar_os_preventivas', { p_dias: dias }));
export const pular = async (agendaId, motivo) => ok(await sb.rpc('cancelar_preventiva', { p_agenda: agendaId, p_motivo: motivo }));
export const reprogramar = async (agendaId, data, horimetro, motivo) =>
  ok(await sb.rpc('reprogramar_preventiva', { p_agenda: agendaId, p_data: data, p_horimetro: horimetro, p_motivo: motivo }));

export const cumprimento = async (inicio, fim, equipamento = null) =>
  ok(await sb.rpc('cumprimento_preventivo', { p_inicio: inicio, p_fim: fim, p_equipamento: equipamento }))?.[0] || null;

export const alteracoes = async (planoId, agendaIds = []) =>
  ok(await sb.from('audit_logs').select('*').in('table_name', ['maintenance_plans', 'maintenance_plan_tasks', 'maintenance_schedule'])
    .or([`record_id.eq.${planoId}`, `new_data->>plan_id.eq.${planoId}`, ...agendaIds.map((i) => `record_id.eq.${i}`)].join(','))
    .order('created_at', { ascending: false }).limit(200));

// Texto do intervalo: "a cada 30 dias", "a cada 500 h", "a cada 90 dias ou 1.000 h"
export function intervalo(p) {
  const d = p.interval_days ? `${p.interval_days} dia${p.interval_days === 1 ? '' : 's'}` : null;
  const h = p.interval_hours ? `${Number(p.interval_hours).toLocaleString('pt-BR')} h` : null;
  return `a cada ${[d, h].filter(Boolean).join(' ou ')}`;
}
