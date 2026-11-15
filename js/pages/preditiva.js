// =====================================================================
// Manutenção preditiva — situação dos pontos de medição (crítico, alerta,
// rota atrasada), inspeções registradas e cadastro dos pontos/limites.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, vazio, montarTabela, fmtData, fmtDataHora, hojeISO, addDias, carregando, erroCarga, numOuNulo } from '../ui.js';
import * as pd from '../services/preditiva.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { formularioModal } from './ordem-ficha.js';

export const badgeResultado = (s) => {
  const x = pd.RESULTADO[s] || { nome: s, classe: '' };
  return `<span class="badge ${x.classe}">${esc(x.nome)}</span>`;
};

const ORDEM_SIT = { critico: 0, alerta: 1, sem_medicao: 2, normal: 3, inativo: 4 };

function proxima(p) {
  if (!p.interval_days || !p.active) return '';
  if (!p.last_at) return '<div class="small perigo-txt">rota: medir agora</div>';
  const d = Math.round((new Date(`${p.next_due_date}T12:00:00`) - new Date(`${hojeISO()}T12:00:00`)) / 864e5);
  return `<div class="small ${p.overdue ? 'perigo-txt' : 'muted'}">${p.overdue ? `rota atrasada ${-d} dia${d === -1 ? '' : 's'}` : d === 0 ? 'medir hoje' : `próxima em ${d} dia${d === 1 ? '' : 's'}`}</div>`;
}

function tendencia(p) {
  if (p.last_value == null || p.previous_value == null) return '';
  const dif = Number(p.last_value) - Number(p.previous_value);
  if (!dif) return '<span class="small muted">= anterior</span>';
  const piorou = p.direction === 'abaixo' ? dif < 0 : dif > 0;
  return `<span class="small ${piorou ? 'perigo-txt' : 'sucesso-txt'}">${dif > 0 ? '▲' : '▼'} ${pd.fmtMedida(Math.abs(dif))} desde a anterior</span>`;
}

export function tabelaPontos(container, lista, { semEquipamento = false } = {}) {
  montarTabela(container, {
    linhas: lista, busca: false, porPagina: 50,
    aoClicar: (id) => { location.hash = `#/preditiva/pontos/${id}`; },
    vazioHtml: vazio({ icone: 'activity', titulo: 'Nenhum ponto de medição' }),
    colunas: [
      ...(semEquipamento ? [] : [{ titulo: 'Equipamento', valor: (p) => p.equipment_tag, primaria: true, render: (p) => `<div><b>${esc(p.equipment_tag)}</b><div class="small muted">${esc(p.equipment_name)}</div></div>` }]),
      { titulo: 'Ponto', valor: (p) => p.name, primaria: semEquipamento, render: (p) => `<div><b>${esc(p.name)}</b> ${p.active ? '' : '<span class="badge inativo">desativado</span>'}
        <div class="small muted">${esc(pd.TECNICA[p.technique].nome)} · ${esc(p.variable)}</div></div>` },
      { titulo: 'Última medição', valor: (p) => (p.last_value == null ? null : Number(p.last_value)), classe: 'num',
        render: (p) => (p.last_value == null ? '<span class="muted">—</span>'
          : `<div><b class="nowrap">${pd.fmtMedida(p.last_value)} ${esc(p.unit)}</b><div class="small muted">${fmtData(p.last_at)}</div>${tendencia(p)}</div>`) },
      { titulo: 'Situação', valor: (p) => ORDEM_SIT[p.situacao] ?? 9, render: (p) => `<div>${badgeResultado(p.situacao)}${proxima(p)}</div>` },
      { titulo: 'Limites', valor: (p) => Number(p.alert_limit ?? 0), render: (p) => `<span class="small">${esc(pd.textoLimites(p))}</span>` },
    ],
  });
}

export function tabelaInspecoes(container, lista, { semEquipamento = false } = {}) {
  montarTabela(container, {
    linhas: lista, busca: false, porPagina: 50,
    aoClicar: (id) => { location.hash = `#/preditiva/inspecoes/${id}`; },
    vazioHtml: vazio({ icone: 'clipboard-check', titulo: 'Nenhuma inspeção' }),
    colunas: [
      { titulo: 'Data', valor: (i) => i.performed_at, classe: 'num', primaria: true, render: (i) => `<span class="nowrap">${fmtDataHora(i.performed_at)}</span>` },
      ...(semEquipamento ? [] : [{ titulo: 'Equipamento', valor: (i) => i.equipment_tag, render: (i) => `<div><b>${esc(i.equipment_tag)}</b><div class="small muted">${esc(i.equipment_name)}</div></div>` }]),
      { titulo: 'Técnica', valor: (i) => i.type, render: (i) => `<div>${esc(pd.TECNICA[i.type].nome)}<div class="small muted">${esc(i.performed_by_name || '')}</div></div>` },
      { titulo: 'Resultado', valor: (i) => (i.voided_at ? 9 : ORDEM_SIT[i.result]),
        render: (i) => (i.voided_at ? '<span class="badge inativo">anulada</span>'
          : `<div>${badgeResultado(i.result)}<div class="small muted">${i.measurements_count ? `${i.measurements_count} ${i.measurements_count == 1 ? "medição" : "medições"}${Number(i.out_of_limit_count) ? ` · ${i.out_of_limit_count} fora do limite` : ''}` : 'visual'}</div></div>`) },
      { titulo: 'OS', valor: (i) => i.work_order_number || '', render: (i) => (i.work_order_id ? `<a href="#/ordens/${i.work_order_id}"><b class="nowrap">${esc(i.work_order_number)}</b></a>` : '<span class="muted">—</span>') },
    ],
  });
}

// ---------- Cadastro / edição de ponto (modal) ----------
export async function abrirPonto({ ponto = null, equipamentoId = null, depois } = {}) {
  const eqs = ponto ? [] : (await listarEquipamentos()).filter((e) => e.status !== 'desativado');
  const v = ponto || { technique: 'vibracao', direction: 'acima', equipment_id: equipamentoId };
  const num = (x) => (x == null ? '' : String(Number(x)).replace('.', ','));
  formularioModal({
    titulo: ponto ? `Editar ponto — ${ponto.name}` : 'Novo ponto de medição',
    campos: `
      ${ponto ? '' : `<div class="campo"><label for="pt-eq">Equipamento *</label><select id="pt-eq" name="equip" required><option value="">Selecione…</option>
        ${eqs.map((e) => `<option value="${e.id}" ${e.id === v.equipment_id ? 'selected' : ''}>${esc(e.tag)} — ${esc(e.name)}</option>`).join('')}</select></div>`}
      <div class="grade grade-form">
        <div class="campo"><label for="pt-nome">Ponto *</label><input id="pt-nome" name="nome" required minlength="2" maxlength="120" value="${esc(v.name || '')}" placeholder="Ex.: Mancal LA do motor"></div>
        <div class="campo"><label for="pt-tec">Técnica *</label><select id="pt-tec" name="tec">
          ${Object.entries(pd.TECNICA).map(([k, t]) => `<option value="${k}" ${v.technique === k ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="pt-var">O que é medido *</label><input id="pt-var" name="var" required minlength="2" maxlength="80" value="${esc(v.variable || '')}" placeholder="Ex.: Velocidade RMS, Temperatura"></div>
        <div class="campo"><label for="pt-un">Unidade *</label><input id="pt-un" name="un" required maxlength="20" value="${esc(v.unit || '')}" placeholder="Ex.: mm/s, °C, ppm"></div>
      </div>
      <fieldset class="campo"><legend>Sentido do limite</legend>
        ${Object.entries(pd.SENTIDO).map(([k, t]) => `<label class="check-linha"><input type="radio" name="sentido" value="${k}" ${v.direction === k ? 'checked' : ''}> ${esc(t)}</label>`).join('')}
      </fieldset>
      <div class="grade grade-form">
        <div class="campo"><label for="pt-al">Limite de alerta</label><input id="pt-al" name="alerta" inputmode="decimal" value="${num(v.alert_limit)}"></div>
        <div class="campo"><label for="pt-cr">Limite crítico</label><input id="pt-cr" name="critico" inputmode="decimal" value="${num(v.critical_limit)}"></div>
        <div class="campo"><label for="pt-int">Medir a cada (dias)</label><input id="pt-int" name="intervalo" type="number" min="1" max="365" value="${v.interval_days ?? ''}" placeholder="Sem rota">
          <span class="ajuda">Se preencher, o sistema avisa quando a medição atrasar.</span></div>
      </div>
      <span class="ajuda">Mudar os limites não altera as medições já feitas (cada medição guarda o limite da época).</span>
      <div class="campo"><label for="pt-obs">Observações</label><textarea id="pt-obs" name="obs" rows="2" maxlength="1000" placeholder="Opcional. Ex.: posição do sensor, norma usada.">${esc(v.notes || '')}</textarea></div>`,
    botao: ponto ? 'Salvar' : 'Cadastrar ponto',
    enviar: async (f) => {
      const alerta = numOuNulo(f.alerta.value); const critico = numOuNulo(f.critico.value);
      const sentido = f.sentido.value;
      if (alerta != null && critico != null && (sentido === 'acima' ? critico <= alerta : critico >= alerta)) {
        throw new Error(`O limite crítico precisa ser ${sentido === 'acima' ? 'maior' : 'menor'} que o de alerta.`);
      }
      const dados = { name: f.nome.value.trim(), technique: f.tec.value, variable: f.var.value.trim(), unit: f.un.value.trim(), direction: sentido,
        alert_limit: alerta, critical_limit: critico, interval_days: f.intervalo.value ? Number(f.intervalo.value) : null, notes: f.obs.value.trim() || null };
      if (ponto) await pd.salvarPonto(ponto.id, dados);
      else await pd.criarPonto({ ...dados, equipment_id: f.equip.value });
    },
    sucesso: ponto ? 'Ponto alterado.' : 'Ponto cadastrado.', depois,
  });
}

const ABAS = { situacao: 'Situação dos pontos', inspecoes: 'Inspeções' };

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let aba = ABAS[params.get('aba')] ? params.get('aba') : 'situacao';
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Manutenção preditiva</h1>
      <p>Pontos de medição com limites de alerta e crítico. O sistema classifica cada medição e mostra o que precisa de atenção.</p></div>
      <div class="acoes">
        ${pode('planning.write') ? '<button class="btn" id="btn-ponto"><i data-lucide="plus"></i> Novo ponto</button>' : ''}
        ${pode('inspection.write') ? '<a class="btn btn-primario" href="#/preditiva/inspecoes/nova"><i data-lucide="clipboard-plus"></i> Registrar inspeção</a>' : ''}
      </div></div>
    <div class="abas" role="tablist">${Object.entries(ABAS).map(([k, v]) => `<button class="aba" data-aba="${k}">${v}</button>`).join('')}</div>
    <div id="aba-pred"></div>`;
  const corpo = el.querySelector('#aba-pred');
  const abrir = async (k) => {
    aba = k;
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    history.replaceState(null, '', `${location.pathname}${location.search}#/preditiva?aba=${k}`);
    corpo.innerHTML = carregando();
    try { await ({ situacao: abaSituacao, inspecoes: abaInspecoes })[k](corpo); } catch (err) { console.error(err); corpo.innerHTML = erroCarga(err); }
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) abrir(b.dataset.aba); });
  el.querySelector('#btn-ponto')?.addEventListener('click', () => abrirPonto({ depois: () => abrir('situacao') }));
  await abrir(aba);
}

async function abaSituacao(corpo) {
  const todos = await pd.pontos();
  const f = { sit: '', equip: '', tec: '', busca: '', inativos: false };
  const ativos = todos.filter((p) => p.active);
  const quadros = [['critico', 'st-parado'], ['alerta', 'st-manutencao'], ['atrasada', 'st-parado'], ['sem_medicao', ''], ['normal', 'st-operando']]
    .map(([k, cl]) => ({ k, cl, n: ativos.filter((p) => (k === 'atrasada' ? p.overdue : p.situacao === k)).length }))
    .filter((x) => x.n).sort((a, b) => b.n - a.n);   // do maior para o menor
  const eqs = [...new Map(todos.map((p) => [p.equipment_id, p.equipment_tag])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }));
  corpo.innerHTML = `
    <div class="faixa-status" id="faixa-pred"></div>
    <div class="card card-filtros"><div class="card-corpo filtros-equip filtros-pecas">
      <div class="campo busca-campo"><label for="pd-busca">Buscar</label><input id="pd-busca" type="search" placeholder="TAG, equipamento, ponto…"></div>
      <div class="campo"><label for="pd-eq">Equipamento</label><select id="pd-eq"><option value="">Todos</option>
        ${eqs.map(([id, t]) => `<option value="${id}">${esc(t)}</option>`).join('')}</select></div>
      <div class="campo"><label for="pd-tec">Técnica</label><select id="pd-tec"><option value="">Todas</option>
        ${Object.entries(pd.TECNICA).map(([k, t]) => `<option value="${k}">${esc(t.nome)}</option>`).join('')}</select></div>
    </div></div>
    <div class="acoes" style="margin:0 0 12px;justify-content:space-between"><span class="muted" id="cont-pontos"></span>
      <label class="check-linha"><input type="checkbox" id="pd-inat"> Mostrar desativados</label></div>
    <div id="res-pontos"></div>`;
  const desenhar = () => {
    corpo.querySelector('#faixa-pred').innerHTML = ativos.length ? `
      <button class="quadro-status total ${!f.sit ? 'sel' : ''}" data-sit=""><span class="n">${ativos.length}</span><span>Pontos ativos</span></button>
      ${quadros.map(({ k, cl, n }) => `<button class="quadro-status ${cl} ${f.sit === k ? 'sel' : ''}" data-sit="${k}"><span class="n">${n}</span>
        <span>${k === 'atrasada' ? '<i data-lucide="calendar-x"></i> Rota atrasada' : `<i data-lucide="${pd.RESULTADO[k].icone}"></i> ${pd.RESULTADO[k].nome}`}</span></button>`).join('')}` : '';
    const t = f.busca.trim().toLowerCase();
    const r = todos.filter((p) => (f.inativos || p.active)
      && (!f.sit || (f.sit === 'atrasada' ? p.overdue : p.situacao === f.sit))
      && (!f.equip || p.equipment_id === f.equip) && (!f.tec || p.technique === f.tec)
      && (!t || [p.equipment_tag, p.equipment_name, p.name, p.variable].some((v) => String(v || '').toLowerCase().includes(t))))
      .sort((a, b) => (ORDEM_SIT[a.situacao] - ORDEM_SIT[b.situacao]) || (b.overdue - a.overdue) || a.equipment_tag.localeCompare(b.equipment_tag, 'pt-BR', { numeric: true }));
    corpo.querySelector('#cont-pontos').textContent = `${r.length} ponto${r.length === 1 ? '' : 's'}`;
    const res = corpo.querySelector('#res-pontos');
    if (!todos.length) {
      res.innerHTML = `<div class="card">${vazio({ icone: 'activity', titulo: 'Nenhum ponto de medição ainda',
        texto: pode('planning.write') ? 'Cadastre os pontos que serão medidos, por exemplo: "Mancal LA — vibração em mm/s, alerta 4,5 e crítico 7,1".' : 'Os pontos aparecem aqui quando forem cadastrados.',
        acao: pode('planning.write') ? '<button class="btn btn-primario" data-novo-ponto><i data-lucide="plus"></i> Novo ponto</button>' : '' })}</div>`;
      res.querySelector('[data-novo-ponto]')?.addEventListener('click', () => abrirPonto({ depois: () => abaSituacao(corpo).then(icones) }));
    } else {
      res.innerHTML = '<div class="card" id="tab-pontos"></div>';
      tabelaPontos(res.querySelector('#tab-pontos'), r);
    }
    icones();
  };
  corpo.querySelector('#faixa-pred').onclick = (ev) => { const b = ev.target.closest('[data-sit]'); if (b) { f.sit = b.dataset.sit; desenhar(); } };
  corpo.querySelector('#pd-busca').oninput = (ev) => { f.busca = ev.target.value; desenhar(); };
  corpo.querySelector('#pd-eq').onchange = (ev) => { f.equip = ev.target.value; desenhar(); };
  corpo.querySelector('#pd-tec').onchange = (ev) => { f.tec = ev.target.value; desenhar(); };
  corpo.querySelector('#pd-inat').onchange = (ev) => { f.inativos = ev.target.checked; desenhar(); };
  desenhar();
}

const PERIODOS = { 30: 'Últimos 30 dias', 90: 'Últimos 90 dias', 365: 'Últimos 12 meses' };

async function abaInspecoes(corpo) {
  let dias = 90;
  const f = { res: '', tec: '' };
  corpo.innerHTML = `<div class="card card-filtros"><div class="card-corpo filtros-equip filtros-pecas">
      <div class="campo"><label for="pi-per">Período</label><select id="pi-per">
        ${Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${Number(k) === dias ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="pi-res">Resultado</label><select id="pi-res"><option value="">Todos</option>
        ${['critico', 'alerta', 'normal'].map((k) => `<option value="${k}">${pd.RESULTADO[k].nome}</option>`).join('')}<option value="anulada">Anuladas</option></select></div>
      <div class="campo"><label for="pi-tec">Técnica</label><select id="pi-tec"><option value="">Todas</option>
        ${Object.entries(pd.TECNICA).map(([k, t]) => `<option value="${k}">${esc(t.nome)}</option>`).join('')}</select></div>
    </div></div>
    <div class="card" id="tab-insp"></div>`;
  let lista = [];
  const desenhar = () => tabelaInspecoes(corpo.querySelector('#tab-insp'), lista.filter((i) => (!f.tec || i.type === f.tec)
    && (!f.res || (f.res === 'anulada' ? i.voided_at : !i.voided_at && i.result === f.res))));
  const carregar = async () => {
    corpo.querySelector('#tab-insp').innerHTML = carregando();
    lista = await pd.inspecoes(`${addDias(hojeISO(), -dias)}T00:00:00`);
    desenhar();
  };
  corpo.querySelector('#pi-per').onchange = (ev) => { dias = Number(ev.target.value); carregar(); };
  corpo.querySelector('#pi-res').onchange = (ev) => { f.res = ev.target.value; desenhar(); };
  corpo.querySelector('#pi-tec').onchange = (ev) => { f.tec = ev.target.value; desenhar(); };
  await carregar();
}

