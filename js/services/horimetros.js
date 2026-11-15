// =====================================================================
// Serviço: leituras de horímetro.
// O banco valida e calcula tudo (delta, bloqueios, correção). A tela só envia
// equipamento, valor, data/hora, observação e foto.
// =====================================================================
import { daPlanta } from '../plantas.js';
import { sb, BUCKET } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const SITUACAO = {
  atrasada: { nome: 'Leitura atrasada', curto: 'Atrasada', classe: 'perigo', icone: 'clock-alert', cor: 'parado' },
  sem_leitura: { nome: 'Sem leitura', curto: 'Sem leitura', classe: 'aviso', icone: 'circle-help', cor: 'manutencao' },
  em_dia: { nome: 'Em dia', curto: 'Em dia', classe: 'ativo', icone: 'circle-check', cor: 'operando' },
};
export const TIPO = { inicial: 'Inicial', normal: 'Leitura', correcao: 'Correção' };
export const STATUS_LEITURA = { valida: 'Válida', substituida: 'Corrigida', anulada: 'Anulada' };

export const situacao = async () =>
  daPlanta(ok(await sb.from('vw_horimetro_situacao').select('*').order('tag')), 'id');

export const situacaoEquipamento = async (id) =>
  ok(await sb.from('vw_horimetro_situacao').select('*').eq('id', id).maybeSingle());

export const leituras = async (equipmentId) =>
  ok(await sb.from('hour_meter_readings')
    .select('*, autor:profiles!hour_meter_readings_created_by_fkey(full_name), quem_corrigiu:profiles!hour_meter_readings_replaced_by_fkey(full_name)')
    .eq('equipment_id', equipmentId)
    .order('read_at', { ascending: false }).order('created_at', { ascending: false }));

const limparNome = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-60);

export async function registrar({ equipmentId, valor, quando, obs, foto }) {
  let caminho = null;
  if (foto) {
    caminho = `horimetros/${equipmentId}/${crypto.randomUUID()}-${limparNome(foto.name || 'foto.jpg')}`;
    ok(await sb.storage.from(BUCKET).upload(caminho, foto, { contentType: foto.type, upsert: false }));
  }
  return ok(await sb.from('hour_meter_readings').insert({
    equipment_id: equipmentId,
    value: valor,
    ...(quando ? { read_at: quando } : {}),
    notes: obs || null,
    attachment_path: caminho,
  }).select('id, value, read_at, delta_hours, kind').single());
}

export const corrigir = async (id, valor, justificativa) =>
  ok(await sb.rpc('corrigir_leitura_horimetro', { p_leitura: id, p_valor: valor, p_justificativa: justificativa }));

export const anular = async (id, justificativa) =>
  ok(await sb.rpc('anular_leitura_horimetro', { p_leitura: id, p_justificativa: justificativa }));

export async function linkFoto(caminho) {
  return ok(await sb.storage.from(BUCKET).createSignedUrl(caminho, 120)).signedUrl;
}

// "2026-11-14T08:30" (campo datetime-local) → ISO com fuso do navegador
export const localParaISO = (v) => (v ? new Date(v).toISOString() : null);
export const agoraLocal = () => {
  const d = new Date(); d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// Número digitado em pt-BR ("12.345,6" ou "12345.6") → Number
export function lerNumero(txt) {
  let s = String(txt ?? '').trim().replace(/\s|h/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : NaN;
}
