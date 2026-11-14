// =====================================================================
// Ordens de serviço — lista com quadros por status, filtros e "minhas OS".
// =====================================================================
import { store, pode } from '../store.js';
import { esc, icones, vazio, montarTabela, fmtData } from '../ui.js';
import * as os from '../services/ordens.js';

export const badgeOS = (s) => {
  const x = os.STATUS_OS[s] || { nome: s, classe: '' };
  return `<span class="badge ${x.classe}">${esc(x.nome)}</span>`;
};
export const badgePrioridade = (p) => {
  const x = os.PRIORIDADE[p] || { nome: p, classe: '' };
  return `<span class="badge ${x.classe}">${esc(x.nome)}</span>`;
};
export const podeAbrirOS = () => pode('work_order.manage') || pode('work_order.request');

export function tabelaOS(container, lista, { semEquipamento = false } = {}) {
  montarTabela(container, {
    linhas: lista, busca: false, porPagina: 50,
    aoClicar: (id) => { location.hash = `#/ordens/${id}`; },
    vazioHtml: vazio({ icone: 'clipboard-list', titulo: 'Nenhuma ordem de serviço' }),
    colunas: [
      { titulo: 'Nº', chave: 'number', primaria: true, render: (o) => `<b class="nowrap">${esc(o.number)}</b>` },
      ...(semEquipamento ? [] : [{ titulo: 'Equipamento', valor: (o) => o.equipment_tag, render: (o) => `<div><b>${esc(o.equipment_tag)}</b><div class="small muted">${esc(o.equipment_name)}</div></div>` }]),
      { titulo: 'Título', chave: 'title', render: (o) => `<div>${esc(o.title)}<div class="small muted">${esc(os.TIPO_OS[o.type])}${o.type === 'corretiva' && o.is_failure ? ' · falha' : ''}</div></div>` },
      { titulo: 'Prioridade', valor: (o) => ['urgente', 'alta', 'media', 'baixa'].indexOf(o.priority), render: (o) => badgePrioridade(o.priority) },
      { titulo: 'Status', valor: (o) => Object.keys(os.STATUS_OS).indexOf(o.status), render: (o) => `<div>${badgeOS(o.status)}${o.overdue ? ' <span class="badge perigo">Atrasada</span>' : ''}</div>` },
      { titulo: 'Responsável', valor: (o) => o.assigned_to_name || '', render: (o) => esc(o.assigned_to_name || '—') },
      { titulo: 'Prazo', valor: (o) => o.due_date || '', render: (o) => (o.due_date ? fmtData(o.due_date) : '—'), classe: 'num' },
    ],
  });
}

export async function render(el) {
  const lista = await os.listar();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const f = {
    situacao: params.get('situacao') || 'andamento',   // andamento | atrasadas | <status> | todas
    tipo: '', prioridade: '', busca: '', minhas: params.get('minhas') === '1',
  };
  const eu = store.perfil?.id;

  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Ordens de serviço</h1>
      <p>Solicitações, programação e execução da manutenção.</p></div>
      <div class="acoes">${podeAbrirOS() ? '<a class="btn btn-primario" href="#/ordens/nova"><i data-lucide="plus"></i> Nova OS</a>' : ''}</div></div>
    <div class="faixa-status" id="faixa-os"></div>
    <div class="card card-filtros"><div class="card-corpo filtros-equip">
      <div class="campo busca-campo"><label for="o-busca">Buscar</label><input id="o-busca" type="search" placeholder="Nº, TAG, título, responsável…"></div>
      <div class="campo"><label for="o-sit">Situação</label><select id="o-sit">
        <option value="andamento">Em andamento</option><option value="atrasadas">Atrasadas</option>
        ${Object.entries(os.STATUS_OS).map(([k, v]) => `<option value="${k}">${esc(v.nome)}</option>`).join('')}
        <option value="todas">Todas</option></select></div>
      <div class="campo"><label for="o-tipo">Tipo</label><select id="o-tipo"><option value="">Todos</option>
        ${Object.entries(os.TIPO_OS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      <div class="campo"><label for="o-pri">Prioridade</label><select id="o-pri"><option value="">Todas</option>
        ${Object.entries(os.PRIORIDADE).map(([k, v]) => `<option value="${k}">${esc(v.nome)}</option>`).join('')}</select></div>
      <label class="check-linha"><input type="checkbox" id="o-minhas"> Só as minhas</label>
    </div></div>
    <div id="res-os"></div>`;

  const sel = el.querySelector('#o-sit');
  sel.value = f.situacao;
  el.querySelector('#o-minhas').checked = f.minhas;

  const faixa = () => {
    const andamento = lista.filter((o) => !os.ENCERRADAS.includes(o.status));
    const atrasadas = andamento.filter((o) => o.overdue).length;
    const cont = Object.keys(os.STATUS_OS).filter((k) => !os.ENCERRADAS.includes(k))
      .map((k) => ({ k, n: andamento.filter((o) => o.status === k).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
    el.querySelector('#faixa-os').innerHTML = `
      <button class="quadro-status total ${f.situacao === 'andamento' ? 'sel' : ''}" data-sit="andamento"><span class="n">${andamento.length}</span><span>Em andamento</span></button>
      ${atrasadas ? `<button class="quadro-status st-parado ${f.situacao === 'atrasadas' ? 'sel' : ''}" data-sit="atrasadas"><span class="n">${atrasadas}</span><span><i data-lucide="calendar-x"></i> Atrasadas</span></button>` : ''}
      ${cont.map(({ k, n }) => `<button class="quadro-status ${f.situacao === k ? 'sel' : ''}" data-sit="${k}"><span class="n">${n}</span>
        <span><i data-lucide="${os.STATUS_OS[k].icone}"></i> ${esc(os.STATUS_OS[k].nome)}</span></button>`).join('')}`;
  };

  const desenhar = () => {
    faixa();
    const t = f.busca.trim().toLowerCase();
    const r = lista.filter((o) => (f.situacao === 'todas' ? true
      : f.situacao === 'andamento' ? !os.ENCERRADAS.includes(o.status)
        : f.situacao === 'atrasadas' ? o.overdue : o.status === f.situacao)
      && (!f.tipo || o.type === f.tipo) && (!f.prioridade || o.priority === f.prioridade)
      && (!f.minhas || o.assigned_to === eu || o.requested_by === eu)
      && (!t || [o.number, o.equipment_tag, o.equipment_name, o.title, o.assigned_to_name, o.requested_by_name]
        .some((v) => String(v || '').toLowerCase().includes(t))));
    const res = el.querySelector('#res-os');
    if (!lista.length) {
      res.innerHTML = `<div class="card">${vazio({ icone: 'clipboard-list', titulo: 'Nenhuma ordem de serviço ainda',
        texto: podeAbrirOS() ? 'Abra a primeira OS para um equipamento.' : 'As ordens aparecem aqui assim que forem abertas.',
        acao: podeAbrirOS() ? '<a class="btn btn-primario" href="#/ordens/nova"><i data-lucide="plus"></i> Nova OS</a>' : '' })}</div>`;
    } else {
      res.innerHTML = `<div class="contagem-equip">${r.length} de ${lista.length} ordem${lista.length === 1 ? '' : 's'}</div><div class="card" id="tab-os"></div>`;
      tabelaOS(res.querySelector('#tab-os'), r);
    }
    icones();
  };

  el.querySelector('#faixa-os').onclick = (ev) => {
    const b = ev.target.closest('[data-sit]'); if (!b) return;
    f.situacao = b.dataset.sit; sel.value = f.situacao; desenhar();
  };
  sel.onchange = () => { f.situacao = sel.value; desenhar(); };
  el.querySelector('#o-busca').oninput = (ev) => { f.busca = ev.target.value; desenhar(); };
  el.querySelector('#o-tipo').onchange = (ev) => { f.tipo = ev.target.value; desenhar(); };
  el.querySelector('#o-pri').onchange = (ev) => { f.prioridade = ev.target.value; desenhar(); };
  el.querySelector('#o-minhas').onchange = (ev) => { f.minhas = ev.target.checked; desenhar(); };
  desenhar();
}
