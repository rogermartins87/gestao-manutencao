// =====================================================================
// Serviço: iluminação — pontos de luz das plantas, trocas e manutenções.
// O banco calcula a vida útil (vw_lighting_points) e confere as regras.
// =====================================================================
import { store } from '../store.js';
import { sb } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const TIPO_LAMPADA = {
  led: 'LED', vapor_sodio: 'Vapor de sódio', vapor_metalico: 'Vapor metálico', vapor_mercurio: 'Vapor de mercúrio',
  fluorescente: 'Fluorescente', halogena: 'Halógena', incandescente: 'Incandescente', outra: 'Outra',
};
// Vida útil típica (horas) — só sugestão no cadastro
export const VIDA_TIPICA = { led: 50000, vapor_sodio: 24000, vapor_metalico: 15000, vapor_mercurio: 16000, fluorescente: 10000, halogena: 2000, incandescente: 1000 };
export const MOTIVO_TROCA = {
  queimada: 'Queimada', fim_vida_util: 'Fim da vida útil', quebrada: 'Quebrada', melhoria: 'Melhoria / troca de tecnologia', preventiva: 'Troca preventiva', outro: 'Outro',
};
export const VIDA = {
  vencida: { nome: 'Vida útil vencida', classe: 'perigo', ordem: 0 },
  vence_breve: { nome: 'Vence em até 30 dias', classe: 'aviso', ordem: 1 },
  sem_dados: { nome: 'Sem data de troca', classe: 'info', ordem: 2 },
  ok: { nome: 'Em dia', classe: 'sucesso', ordem: 3 },
  inativo: { nome: 'Inativo', classe: 'inativo', ordem: 4 },
};

const daPlantaEscolhida = (linhas) => (store.planta ? linhas.filter((l) => l.plant_id === store.planta) : linhas);

export const listar = async () => daPlantaEscolhida(ok(await sb.from('vw_lighting_points').select('*').order('code')));
export const ler = async (id) => ok(await sb.from('vw_lighting_points').select('*').eq('id', id).maybeSingle());
export const historico = async (id) =>
  ok(await sb.from('vw_lighting_events').select('*').eq('point_id', id).order('done_at', { ascending: false }).order('created_at', { ascending: false }));
export const historicoGeral = async () =>
  daPlantaEscolhida(ok(await sb.from('vw_lighting_events').select('*').order('done_at', { ascending: false }).order('created_at', { ascending: false }).limit(500)));

const CAMPOS = ['plant_id', 'code', 'location', 'lamp_type', 'power_w', 'quantity', 'lifetime_hours', 'hours_per_day', 'last_replaced_at', 'notes', 'active'];
const so = (d) => Object.fromEntries(CAMPOS.filter((c) => c in d).map((c) => [c, d[c]]));

export const criar = async (dados) => ok(await sb.from('lighting_points').insert(so(dados)).select('id').single());
export const salvar = async (id, dados) => ok(await sb.from('lighting_points').update(so(dados)).eq('id', id).select('id').single());

export const registrar = async (dados) =>
  ok(await sb.from('lighting_events').insert({
    point_id: dados.point_id, kind: dados.kind, done_at: dados.done_at, lamps_replaced: dados.lamps_replaced ?? null, reason: dados.reason ?? null,
    new_lamp_type: dados.new_lamp_type ?? null, new_power_w: dados.new_power_w ?? null, notes: dados.notes ?? null,
  }).select('id').single());

export const fmtW = (w) => (w == null ? '—' : Number(w) >= 1000 ? `${(Number(w) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kW` : `${Number(w).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} W`);
