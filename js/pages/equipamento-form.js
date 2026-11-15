// =====================================================================
// Cadastro / edição de equipamento.
// Status e horímetro NÃO são editados aqui (status: botão "Alterar status";
// horímetro: leituras da Etapa 4).
// =====================================================================
import { esc, icones, toast, traduzirErro, opcoes, textoOuNulo } from '../ui.js';
import * as svc from '../services/equipamentos.js';
import { abrirCategorias } from './equipamentos.js';
import { dadosOEE } from '../services/producao.js';
import { store } from '../store.js';
import { temPlantas, plantasAtivas } from '../plantas.js';

export async function render(el, [id]) {
  const [e, categorias] = await Promise.all([id ? svc.lerEquipamento(id) : null, svc.listarCategorias()]);
  if (id && !e) { el.innerHTML = '<div class="alerta aviso">Equipamento não encontrado.</div>'; return; }
  const v = e || { criticality: 'B', has_hour_meter: true };
  if (id) Object.assign(v, (await dadosOEE(id).catch(() => null)) || {});
  const cats = categorias.filter((c) => c.active || c.id === v.category_id);
  // Planta: na edição, a atual; no cadastro, a escolhida no topo (ou a primeira ativa)
  v.plant_id = id ? store.equipPlanta.get(id) : (store.planta || plantasAtivas()[0]?.id);
  const plantas = store.plantas.filter((p) => p.active || p.id === v.plant_id);
  const campo = (nome, rotulo, extra = '', tipo = 'text') => `<div class="campo"><label for="c-${nome}">${rotulo}</label>
    <input id="c-${nome}" name="${nome}" type="${tipo}" value="${esc(v[nome] ?? '')}" ${extra}></div>`;

  el.innerHTML = `
    <a class="voltar" href="${id ? `#/equipamentos/${id}` : '#/equipamentos'}"><i data-lucide="arrow-left"></i> Voltar</a>
    <div class="cabecalho-pagina"><div><h1>${id ? `Editar ${esc(e.tag)}` : 'Novo equipamento'}</h1>
      <p>${id ? 'O status é alterado pelo botão "Alterar status" na ficha, com motivo.' : 'O equipamento começa como "Operando". O horímetro é registrado depois, pelas leituras.'}</p></div></div>
    <form id="f-equip" class="card"><div class="card-corpo grade" style="gap:18px">
      <h3>Identificação</h3>
      <div class="grade grade-form">
        ${campo('tag', 'TAG (código único) *', 'required maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9._\\/ \\-]{0,39}" placeholder="Ex.: LAS-01" style="text-transform:uppercase"')}
        ${campo('name', 'Nome do equipamento *', 'required minlength="2" maxlength="120" placeholder="Ex.: Máquina de corte a laser 01"')}
        ${temPlantas() ? `<div class="campo"><label for="c-plant_id">Planta *</label><select id="c-plant_id" name="plant_id" required>
          ${plantas.map((p) => `<option value="${p.id}" ${p.id === v.plant_id ? 'selected' : ''}>${esc(p.name)}${p.active ? '' : ' (desativada)'}</option>`).join('')}</select></div>` : ''}
        <div class="campo"><label for="c-category_id">Categoria</label>
          <div class="linha-form"><select id="c-category_id" name="category_id">${opcoes(cats, { valor: 'id', rotulo: 'name', selecionado: v.category_id, vazio: 'Sem categoria' })}</select>
          <button type="button" class="btn btn-icone" id="btn-cat" title="Gerenciar categorias"><i data-lucide="tags"></i></button></div></div>
        ${campo('sector', 'Setor', 'maxlength="80" placeholder="Ex.: Laminação a frio" list="lista-setores"')}
        ${campo('location', 'Localização', 'maxlength="120" placeholder="Ex.: Galpão 2, linha 3"')}
        <div class="campo"><label for="c-criticality">Criticidade *</label><select id="c-criticality" name="criticality" required>
          ${Object.entries(svc.CRITICIDADE).map(([k, t]) => `<option value="${k}" ${v.criticality === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      </div>
      <h3>Dados técnicos</h3>
      <div class="grade grade-form">
        ${campo('manufacturer', 'Fabricante', 'maxlength="80"')}
        ${campo('model', 'Modelo', 'maxlength="80"')}
        ${campo('serial_number', 'Nº de série', 'maxlength="80"')}
        ${campo('manufacture_year', 'Ano de fabricação', 'min="1900" max="2100" step="1"', 'number')}
        ${campo('installed_at', 'Data de instalação', '', 'date')}
        <div class="campo"><label for="c-potencia">Potência</label>
          <div class="campo-unidade"><input id="c-potencia" name="potencia" type="number" min="0" max="100000" step="0.01" value="${v.power_kw ?? ''}" placeholder="Ex.: 75">
            <select name="potencia_un" aria-label="Unidade da potência"><option value="kW">kW</option><option value="CV">CV</option><option value="HP">HP</option></select></div>
          <span class="muted small" id="c-potencia-kw"></span></div>
      </div>
      <h3>Horímetro</h3>
      <div class="grade grade-form">
        <label class="check-linha"><input type="checkbox" name="has_hour_meter" ${v.has_hour_meter ? 'checked' : ''}> Este equipamento possui horímetro</label>
        ${campo('hour_meter_stale_days', 'Alertar após quantos dias sem leitura', 'min="1" max="365" step="1" placeholder="Padrão da empresa"', 'number')}
      </div>
      <h3>Produção (OEE)</h3>
      <div class="grade grade-form">
        <label class="check-linha"><input type="checkbox" name="oee_enabled" id="c-oee" ${v.oee_enabled ? 'checked' : ''}> Esta máquina produz e mede OEE (a produção é lançada por turno)</label>
        <div class="campo campo-oee"><label for="c-production_unit">Unidade de produção *</label>
          <input id="c-production_unit" name="production_unit" maxlength="20" value="${esc(v.production_unit ?? '')}" placeholder="Ex.: t, peças, barras, m" list="lista-unidades"></div>
        <div class="campo campo-oee"><label for="c-ideal_rate">Velocidade ideal (por hora) *</label>
          <input id="c-ideal_rate" name="ideal_rate" type="number" min="0.001" step="any" value="${esc(v.ideal_rate ?? '')}" placeholder="Ex.: 45"></div>
        <p class="small muted campo-oee" style="margin:0;grid-column:1/-1">Velocidade ideal = quanto a máquina produz em 1 hora rodando na velocidade de projeto (ou a melhor velocidade sustentada). Mudar este valor não muda o OEE de turnos já lançados.</p>
      </div>
      <div class="campo"><label for="c-notes">Observações</label><textarea id="c-notes" name="notes" rows="3" maxlength="2000">${esc(v.notes || '')}</textarea></div>
      <div id="msg-equip"></div>
      <div class="acoes"><button class="btn btn-primario" type="submit"><i data-lucide="save"></i> ${id ? 'Salvar alterações' : 'Cadastrar equipamento'}</button>
        <a class="btn" href="${id ? `#/equipamentos/${id}` : '#/equipamentos'}">Cancelar</a></div>
    </div></form>
    <datalist id="lista-setores"></datalist>
    <datalist id="lista-unidades"><option value="t"><option value="peças"><option value="barras"><option value="m"><option value="kg"><option value="cortes"><option value="bobinas"></datalist>`;

  const oee = el.querySelector('#c-oee');
  const mostrarOEE = () => el.querySelectorAll('.campo-oee').forEach((x) => {
    x.hidden = !oee.checked; x.querySelectorAll('input').forEach((i) => { i.required = oee.checked; });
  });
  oee.addEventListener('change', mostrarOEE); mostrarOEE();

  svc.listarEquipamentos().then((lista) => {
    const setores = [...new Set(lista.map((x) => x.sector).filter(Boolean))].sort();
    el.querySelector('#lista-setores').innerHTML = setores.map((s) => `<option value="${esc(s)}">`).join('');
  }).catch(() => {});

  el.querySelector('#btn-cat').addEventListener('click', () => abrirCategorias(async () => {
    const atual = el.querySelector('#c-category_id').value;
    const lista = (await svc.listarCategorias()).filter((c) => c.active || c.id === atual);
    el.querySelector('#c-category_id').innerHTML = opcoes(lista, { valor: 'id', rotulo: 'name', selecionado: atual, vazio: 'Sem categoria' });
  }));

  // mostra quanto dá em kW quando a potência é digitada em CV ou HP
  const fpot = el.querySelector('form');
  const mostrarKW = () => {
    const un = fpot.potencia_un.value, val = fpot.potencia.value;
    el.querySelector('#c-potencia-kw').textContent = un !== 'kW' && val !== '' ? `= ${potenciaKW(val, un).toLocaleString('pt-BR')} kW` : '';
  };
  fpot.potencia.addEventListener('input', mostrarKW); fpot.potencia_un.addEventListener('change', mostrarKW);

  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    const num = (x) => (x === '' ? null : Number(x));
    const dados = {
      tag: f.tag.value.trim().toUpperCase(),
      name: f.name.value.trim(),
      category_id: f.category_id.value || null,
      sector: textoOuNulo(f.sector.value),
      location: textoOuNulo(f.location.value),
      criticality: f.criticality.value,
      manufacturer: textoOuNulo(f.manufacturer.value),
      model: textoOuNulo(f.model.value),
      serial_number: textoOuNulo(f.serial_number.value),
      manufacture_year: num(f.manufacture_year.value),
      installed_at: f.installed_at.value || null,
      has_hour_meter: f.has_hour_meter.checked,
      hour_meter_stale_days: num(f.hour_meter_stale_days.value),
      notes: textoOuNulo(f.notes.value),
      oee_enabled: f.oee_enabled.checked,
      production_unit: textoOuNulo(f.production_unit.value),
      ideal_rate: num(f.ideal_rate.value),
      power_kw: potenciaKW(f.potencia.value, f.potencia_un.value),
    };
    if (f.plant_id) dados.plant_id = f.plant_id.value;
    try {
      const r = id ? await svc.salvarEquipamento(id, dados) : await svc.criarEquipamento(dados);
      toast(id ? 'Equipamento atualizado.' : 'Equipamento cadastrado.');
      location.hash = `#/equipamentos/${r.id}`;
    } catch (err) {
      const msg = /equipment_tag_idx|duplicate/i.test(`${err.message}`) ? `Já existe um equipamento com a TAG ${dados.tag}.`
        : /equipamento_oee_completo/.test(`${err.message}`) ? 'Para medir OEE, informe a unidade de produção e a velocidade ideal.' : traduzirErro(err);
      el.querySelector('#msg-equip').innerHTML = `<div class="alerta perigo">${esc(msg)}</div>`;
      btn.disabled = false;
    }
  });
  icones();
}

// Potência sempre gravada em kW (1 CV = 0,7355 kW; 1 HP = 0,7457 kW)
const FATOR_KW = { kW: 1, CV: 0.7355, HP: 0.7457 };
function potenciaKW(valor, un) {
  if (valor === '' || valor == null) return null;
  return Math.round(Number(valor) * (FATOR_KW[un] || 1) * 100) / 100;
}
