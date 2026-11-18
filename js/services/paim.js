// =====================================================================
// Serviço: PAIM (Plano Anual de Inspeção e Manutenção).
// Tudo que grava passa pelas funções do banco (salvar_paim, gerar_os_paim,
// registrar_checklist_paim); as tabelas são só leitura.
// =====================================================================
import { daPlanta } from '../plantas.js';
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const AREA = {
  mecanica: { nome: 'Mecânica', icone: 'wrench' },
  eletrica: { nome: 'Elétrica', icone: 'zap' },
  operacional: { nome: 'Operacional', icone: 'play' },
};
export const AREAS = Object.keys(AREA);

// Frequências comuns; "outra" deixa digitar os dias
export const FREQUENCIA = [
  { dias: 7, nome: 'Semanal' }, { dias: 15, nome: 'Quinzenal' }, { dias: 30, nome: 'Mensal' },
  { dias: 60, nome: 'Bimestral' }, { dias: 90, nome: 'Trimestral' }, { dias: 120, nome: 'Quadrimestral' },
  { dias: 180, nome: 'Semestral' }, { dias: 365, nome: 'Anual' },
];
export function frequencia(dias) {
  if (dias == null) return 'A definir';
  const f = FREQUENCIA.find((x) => x.dias === Number(dias));
  return f ? `${f.nome} (${dias} dias)` : `A cada ${dias} dias`;
}
export const revisao = (n) => String(n ?? 0).padStart(2, '0');

export const listar = async () => ok(await sb.from('vw_paims').select('*').order('name'));
export const ler = async (id) => ok(await sb.from('vw_paims').select('*').eq('id', id).maybeSingle());
export const itens = async (id) => ok(await sb.from('paim_items').select('*').eq('paim_id', id).eq('active', true).order('position'));
export const maquinas = async (id) => ok(await sb.from('vw_paim_equipment').select('*').eq('paim_id', id).order('equipment_tag'));
export const todasMaquinas = async () => daPlanta(ok(await sb.from('vw_paim_equipment').select('*').order('next_due_date', { ascending: true, nullsFirst: false })));
export const historico = async (id) => ok(await sb.from('vw_paim_checks').select('*').eq('paim_id', id).order('created_at', { ascending: false }).limit(200));
export const doEquipamento = async (eqId) => ok(await sb.from('vw_paim_equipment').select('*').eq('equipment_id', eqId));

export const salvar = async (id, dados) => ok(await sb.rpc('salvar_paim', { p_id: id || null, p: dados }));
export const gerarOS = async (ligacao, responsavel = null, prazo = null) =>
  ok(await sb.rpc('gerar_os_paim', { p_ligacao: ligacao, p_responsavel: responsavel || null, p_prazo: prazo || null }));

// Checklist da OS
export const checklistDaOS = async (osId) => ok(await sb.from('vw_paim_checks').select('*').eq('work_order_id', osId).maybeSingle());
export const itensDoChecklist = async (checkId) => ok(await sb.from('vw_paim_check_items').select('*').eq('check_id', checkId).order('position'));
export const registrarChecklist = async (checkId, lista) => ok(await sb.rpc('registrar_checklist_paim', { p_check: checkId, p_itens: lista }));
