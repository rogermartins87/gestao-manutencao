// =====================================================================
// Serviço: equipamentos, categorias, histórico de status e documentos.
// =====================================================================
import { sb, BUCKET } from '../supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const STATUS = {
  operando: { nome: 'Operando', classe: 'ativo', cor: 'operando', icone: 'circle-check' },
  em_manutencao: { nome: 'Em manutenção', classe: 'aviso', cor: 'manutencao', icone: 'wrench' },
  parado: { nome: 'Parado', classe: 'perigo', cor: 'parado', icone: 'octagon-alert' },
  desativado: { nome: 'Desativado', classe: 'inativo', cor: 'desativado', icone: 'archive' },
};
export const CRITICIDADE = {
  A: 'A — crítico (para a produção)',
  B: 'B — importante',
  C: 'C — baixo impacto',
};
export const TIPO_DOC = {
  manual: 'Manual', desenho: 'Desenho', laudo: 'Laudo', foto: 'Foto', certificado: 'Certificado', outro: 'Outro',
};

// Campos que a tela pode gravar (status e horímetro ficam de fora: o banco cuida)
const CAMPOS = ['tag', 'name', 'plant_id', 'category_id', 'sector', 'location', 'manufacturer', 'model', 'serial_number',
  'manufacture_year', 'installed_at', 'criticality', 'has_hour_meter', 'hour_meter_stale_days', 'notes',
  'oee_enabled', 'production_unit', 'ideal_rate', 'power_kw'];
const so = (d) => Object.fromEntries(CAMPOS.filter((c) => c in d).map((c) => [c, d[c]]));

export const listarEquipamentos = async () =>
  ok(await sb.from('vw_equipment').select('*').order('tag'));

export const lerEquipamento = async (id) =>
  ok(await sb.from('vw_equipment').select('*').eq('id', id).maybeSingle());

export const criarEquipamento = async (dados) =>
  ok(await sb.from('equipment').insert(so(dados)).select('id').single());

export const salvarEquipamento = async (id, dados) =>
  ok(await sb.from('equipment').update(so(dados)).eq('id', id).select('id').single());

export const alterarStatus = async (id, status, motivo) =>
  ok(await sb.rpc('alterar_status_equipamento', { p_equipment: id, p_status: status, p_motivo: motivo }));

export const historicoStatus = async (id) =>
  ok(await sb.from('equipment_status_history')
    .select('*, autor:profiles!equipment_status_history_changed_by_fkey(full_name)')
    .eq('equipment_id', id).order('changed_at', { ascending: false }));

// ---------- Categorias ----------
export const listarCategorias = async () =>
  ok(await sb.from('equipment_categories').select('*').order('name'));

export const criarCategoria = async (name) =>
  ok(await sb.from('equipment_categories').insert({ name: name.trim() }).select().single());

export const salvarCategoria = async (id, dados) =>
  ok(await sb.from('equipment_categories').update(dados).eq('id', id).select().single());

// ---------- Documentos ----------
export const listarDocumentos = async (id) =>
  ok(await sb.from('equipment_documents')
    .select('*, autor:profiles!equipment_documents_created_by_fkey(full_name)')
    .eq('equipment_id', id).is('removed_at', null).order('created_at', { ascending: false }));

const limparNome = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);

export async function enviarDocumento(equipmentId, arquivo, { titulo, tipo }) {
  const caminho = `equipamentos/${equipmentId}/${crypto.randomUUID()}-${limparNome(arquivo.name)}`;
  ok(await sb.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false }));
  return ok(await sb.from('equipment_documents').insert({
    equipment_id: equipmentId, doc_type: tipo, title: titulo, storage_path: caminho,
    file_name: arquivo.name, mime_type: arquivo.type, size_bytes: arquivo.size,
  }).select().single());
}

export const removerDocumento = async (id) =>
  ok(await sb.from('equipment_documents').update({ removed_at: new Date().toISOString() }).eq('id', id));

export async function linkDocumento(caminho) {
  const r = ok(await sb.storage.from(BUCKET).createSignedUrl(caminho, 120));
  return r.signedUrl;
}

// ---------- Alterações (auditoria) do equipamento ----------
export const alteracoesEquipamento = async (id) =>
  ok(await sb.from('audit_logs').select('*')
    .in('table_name', ['equipment', 'equipment_documents', 'hour_meter_readings'])
    .or(`record_id.eq.${id},new_data->>equipment_id.eq.${id}`)
    .order('created_at', { ascending: false }).limit(200));
