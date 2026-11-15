// =====================================================================
// Plantas da empresa (Matriz e outras).
// Todos os usuários veem todas as plantas; a planta escolhida no topo
// da tela filtra listas, dashboard, relatórios e indicadores.
// Nada escolhido = "Todas as plantas" (o total da empresa).
// Antes do SQL 019 rodar, a tabela não existe: o sistema segue como antes.
// =====================================================================
import { sb } from './supabase.js';
import { store } from './store.js';

const CHAVE = 'planta.escolhida';
store.plantas = [];
store.planta = null;              // id da planta escolhida (null = todas)
store.equipPlanta = new Map();    // equipamento → planta

export async function carregarPlantas() {
  const { data, error } = await sb.from('plants').select('*').order('sort_order').order('name');
  store.plantas = error ? [] : (data || []);
  let salva = null;
  try { salva = localStorage.getItem(CHAVE); } catch { /* sem armazenamento */ }
  store.planta = variasPlantas() && store.plantas.some((p) => p.id === salva && p.active) ? salva : null;
}

export const temPlantas = () => store.plantas.length > 0;
export const plantasAtivas = () => store.plantas.filter((p) => p.active);
export const variasPlantas = () => plantasAtivas().length > 1;
export const plantaEscolhida = () => store.plantas.find((p) => p.id === store.planta) || null;
export const nomePlanta = (id) => store.plantas.find((p) => p.id === id)?.name || '';
export const plantaDoEquipamento = (eqId) => nomePlanta(store.equipPlanta.get(eqId));

export function escolherPlanta(id) {
  store.planta = id || null;
  try { if (id) localStorage.setItem(CHAVE, id); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
}

// Mapa equipamento → planta (leve: só dois campos). Recarregado a cada tela.
export async function carregarMapaPlantas() {
  if (!temPlantas()) { store.equipPlanta = new Map(); return; }
  const { data, error } = await sb.from('equipment').select('id, plant_id');
  if (!error) store.equipPlanta = new Map((data || []).map((e) => [e.id, e.plant_id]));
}

// Item sem equipamento (ex.: pendência geral) aparece em todas as plantas.
export const naPlanta = (eqId) => !store.planta || !eqId || store.equipPlanta.get(eqId) === store.planta;
export const daPlanta = (linhas, campo = 'equipment_id') => (store.planta ? (linhas || []).filter((l) => naPlanta(l[campo])) : linhas);
// Para listas de escolha: filtra pela planta, mas mantém o item já escolhido
export const equipamentosParaEscolher = (lista, manter = null) => (store.planta ? lista.filter((e) => naPlanta(e.id) || e.id === manter) : lista);
// Parâmetro das funções do banco (só vai quando há planta escolhida e nenhum equipamento)
export const argPlanta = (equipamento = null) => (store.planta && !equipamento ? { p_planta: store.planta } : {});
// "OEE da planta" vira "OEE geral" quando a tela soma todas as plantas
export const escopoOEE = () => (variasPlantas() && !store.planta ? 'geral' : 'da planta');
