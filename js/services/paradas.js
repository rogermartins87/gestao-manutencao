// =====================================================================
// Serviço: paradas (eventos), fases e motivos.
// O banco impede sobreposição, controla o status do equipamento e só deixa
// encerrar/corrigir horários pelas funções.
// =====================================================================
import { daPlanta } from '../plantas.js';
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const FASE = {
  reparo: { nome: 'Reparo', classe: 'aviso', icone: 'wrench' },
  aguardando_pecas: { nome: 'Aguardando peças', classe: 'perigo', icone: 'package-search' },
  aguardando_equipe: { nome: 'Aguardando equipe', classe: 'perigo', icone: 'users' },
  aguardando_aprovacao: { nome: 'Aguardando aprovação', classe: 'perigo', icone: 'stamp' },
  aguardando_terceiros: { nome: 'Aguardando terceiros', classe: 'perigo', icone: 'truck' },
};
export const CATEGORIA = { falha: 'Falha', preventiva: 'Preventiva', operacional: 'Operacional', externa: 'Externa' };
export const TIPO_PARADA = { nao_planejada: 'Não planejada', planejada: 'Planejada' };

export const listar = async ({ desde } = {}) => {
  let q = sb.from('vw_downtime_events').select('*');
  if (desde) q = q.or(`ended_at.is.null,ended_at.gte.${desde}`);
  return daPlanta(ok(await q.order('started_at', { ascending: false })));
};
export const abertas = async () =>
  daPlanta(ok(await sb.from('vw_downtime_events').select('*').is('ended_at', null).order('started_at')));
// Paradas que ainda não têm OS ligada (responsabilidade dos planejadores).
// A parada causada por outra máquina não pede OS: a OS fica na máquina que quebrou.
export const semOS = async () =>
  daPlanta(ok(await sb.from('vw_downtime_events').select('*').is('work_order_id', null).is('caused_by_event_id', null).order('started_at', { ascending: false })));
// Paradas de outras máquinas causadas por esta
export const ligadasDaParada = async (id) =>
  ok(await sb.from('vw_downtime_events').select('*').eq('caused_by_event_id', id).order('equipment_tag'));
export const doEquipamento = async (id) =>
  ok(await sb.from('vw_downtime_events').select('*').eq('equipment_id', id).order('started_at', { ascending: false }));
export const daOS = async (id) =>
  ok(await sb.from('vw_downtime_events').select('*').eq('work_order_id', id).order('started_at', { ascending: false }));
export const ler = async (id) =>
  ok(await sb.from('vw_downtime_events').select('*').eq('id', id).maybeSingle());

const CAMPOS = ['equipment_id', 'reason_id', 'type', 'started_at', 'ended_at', 'work_order_id', 'production_impact', 'notes'];
const so = (d, campos = CAMPOS) => Object.fromEntries(campos.filter((c) => c in d).map((c) => [c, d[c]]));

export const registrar = async (dados) =>
  ok(await sb.from('downtime_events').insert(so(dados)).select('id').single());

export const salvarDados = async (id, dados) =>
  ok(await sb.from('downtime_events').update(so(dados, ['reason_id', 'type', 'work_order_id', 'production_impact', 'notes'])).eq('id', id).select('id').single());

export const fases = async (id) =>
  ok(await sb.from('downtime_phases')
    .select('*, autor:profiles!downtime_phases_created_by_fkey(full_name)')
    .eq('downtime_event_id', id).order('started_at'));

export const mudarFase = async (id, fase, em, obs) =>
  ok(await sb.rpc('mudar_fase_parada', { p_parada: id, p_fase: fase, p_em: em || null, p_obs: obs || null }));

export const adicionarFase = async (id, { fase, inicio, fim, obs }) =>
  ok(await sb.from('downtime_phases').insert({ downtime_event_id: id, phase: fase, started_at: inicio, ended_at: fim, notes: obs || null }).select('id').single());

export const encerrar = async (id, retorno, obs) =>
  ok(await sb.rpc('encerrar_parada', { p_parada: id, p_retorno: retorno, p_obs: obs || null }));

// Máquinas que pararam junto: cria as paradas ligadas (mesmo início e tipo)
export const registrarLigadas = async (id, equipamentos) =>
  ok(await sb.rpc('registrar_paradas_ligadas', { p_parada: id, p_equipamentos: equipamentos }));
// Confirma o retorno desta parada e das ligadas escolhidas, no mesmo horário
export const encerrarComLigadas = async (id, retorno, obs, ligadas) =>
  ok(await sb.rpc('encerrar_parada_com_ligadas', { p_parada: id, p_retorno: retorno, p_obs: obs || null, p_ligadas: ligadas }));

// ---------- Máquinas ligadas ("quando esta para, também param") ----------
export const ligacoes = async () => ok(await sb.from('equipment_links').select('*'));
export const ligarMaquinas = async (de, para) =>
  ok(await sb.from('equipment_links').insert({ equipment_id: de, stops_equipment_id: para }).select('id').single());
export const desligarMaquinas = async (id) => ok(await sb.from('equipment_links').delete().eq('id', id));

export const corrigirHorarios = async (id, inicio, fim, justificativa) =>
  ok(await sb.rpc('corrigir_horarios_parada', { p_parada: id, p_inicio: inicio, p_fim: fim || null, p_justificativa: justificativa }));

// ---------- Motivos ----------
export const motivos = async () => ok(await sb.from('downtime_reasons').select('*').order('name'));
export const criarMotivo = async (name, category) =>
  ok(await sb.from('downtime_reasons').insert({ name: name.trim(), category }).select().single());
export const salvarMotivo = async (id, dados) =>
  ok(await sb.from('downtime_reasons').update(dados).eq('id', id).select().single());

export const alteracoes = async (id) =>
  ok(await sb.from('audit_logs').select('*')
    .in('table_name', ['downtime_events', 'downtime_phases'])
    .or(`record_id.eq.${id},new_data->>downtime_event_id.eq.${id}`)
    .order('created_at', { ascending: false }).limit(200));

// Horas → "3 h 25 min" / "2 d 4 h"
export function fmtDuracao(h) {
  if (h == null || !Number.isFinite(Number(h))) return '—';
  const min = Math.round(Number(h) * 60);
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60); const m = min % 60;
  if (horas < 48) return m ? `${horas} h ${String(m).padStart(2, '0')} min` : `${horas} h`;
  const d = Math.floor(horas / 24); const hr = horas % 24;
  return hr ? `${d} d ${hr} h` : `${d} d`;
}
