// =====================================================================
// Serviço: programação semanal da equipe de manutenção (colaboradores e
// atividades por dia). O banco confere quem pode programar e registrar.
// =====================================================================
import { store } from '../store.js';
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const STATUS_PROG = {
  programada: { nome: 'Programada', classe: 'info', icone: 'circle' },
  feita: { nome: 'Feita', classe: 'ativo', icone: 'circle-check' },
  nao_feita: { nome: 'Não feita', classe: 'perigo', icone: 'circle-x' },
};

export const colaboradores = async () => ok(await sb.from('maintenance_staff').select('*').order('sort_order').order('name'));
export const salvarColaborador = async (id, d) => {
  const campos = { name: d.name, job_title: d.job_title ?? null, specialty: d.specialty ?? null, profile_id: d.profile_id ?? null, active: d.active ?? true };
  return id ? ok(await sb.from('maintenance_staff').update(campos).eq('id', id).select('id').single())
    : ok(await sb.from('maintenance_staff').insert(campos).select('id').single());
};

export const daSemana = async (ini, fim) => {
  const r = ok(await sb.from('vw_schedule_items').select('*').gte('scheduled_date', ini).lte('scheduled_date', fim)
    .order('scheduled_date').order('position'));
  // planta escolhida: atividades sem equipamento continuam aparecendo
  return store.planta ? r.filter((x) => !x.plant_id || x.plant_id === store.planta) : r;
};
export const daPendencia = async (id) => ok(await sb.from('vw_schedule_items').select('*').eq('pending_task_id', id).order('scheduled_date'));
export const daOS = async (id) => ok(await sb.from('vw_schedule_items').select('*').eq('work_order_id', id).order('scheduled_date'));
// OS que já têm atividade ainda programada (para "esconder as já programadas")
export const osProgramadas = async () => ok(await sb.from('vw_schedule_items').select('work_order_id, scheduled_date, staff_name')
  .not('work_order_id', 'is', null).eq('status', 'programada').order('scheduled_date'));

export const programar = async (d) => ok(await sb.from('schedule_items').insert({
  staff_id: d.staff_id, scheduled_date: d.scheduled_date, position: d.position || 1, title: d.title,
  equipment_id: d.equipment_id || null, pending_task_id: d.pending_task_id || null, work_order_id: d.work_order_id || null,
  rescheduled_from_id: d.rescheduled_from_id || null,
}).select('id').single());

// ---------- Reprogramar o que não foi feito ----------
const PEND_RESOLVIDA = ['concluida', 'cancelada'];
const OS_RESOLVIDA = ['atendida', 'concluida', 'cancelada'];
// Não feitas que ainda não voltaram para a programação (nem foram dispensadas).
// Se a pendência ou a OS já foi resolvida por outro caminho, não precisa voltar.
export const aReprogramar = async () => {
  const r = ok(await sb.from('vw_schedule_items').select('*').eq('status', 'nao_feita').eq('reschedule_dismissed', false)
    .is('rescheduled_to_id', null).order('scheduled_date').order('position'));
  return r.filter((x) => !PEND_RESOLVIDA.includes(x.pending_status) && !OS_RESOLVIDA.includes(x.work_order_status)
    && (!store.planta || !x.plant_id || x.plant_id === store.planta));
};
// Cria a atividade nova (mesmo título, equipamento, OS ou pendência) ligada à não feita
export const reprogramar = async (i, { dia, staffId }) => programar({
  staff_id: staffId || i.staff_id, scheduled_date: dia, title: i.title, equipment_id: i.equipment_id,
  pending_task_id: i.pending_task_id, work_order_id: i.work_order_id, rescheduled_from_id: i.id,
});
export const dispensar = async (id) => alterar(id, { reschedule_dismissed: true });
// Próximo dia útil (segunda a sexta) depois de "iso"
export const proxDiaUtil = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  do { d.setDate(d.getDate() + 1); } while ([0, 6].includes(d.getDay()));
  return d.toISOString().slice(0, 10);
};
export async function alterar(id, d) {
  const r = ok(await sb.from('schedule_items').update(d).eq('id', id).select('id'));
  if (!r?.length) throw new Error('Você não pode alterar esta atividade: só quem programa ou o próprio colaborador.');
  return r[0];
}
export async function remover(id) {
  const r = ok(await sb.from('schedule_items').delete().eq('id', id).select('id'));
  if (!r?.length) throw new Error('Só dá para tirar da programação uma atividade que ainda não foi registrada.');
}
