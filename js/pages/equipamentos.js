// =====================================================================
// Equipamentos — visão geral (grade com status por cor ou lista), filtros
// e cadastro de categorias.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, vazio, montarTabela, fmtNum, fmtDataHora } from '../ui.js';
import * as svc from '../services/equipamentos.js';

const lerPref = (k, p) => { try { return localStorage.getItem(k) || p; } catch { return p; } };
const gravarPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

export const badgeStatus = (s) => {
  const st = svc.STATUS[s] || { nome: s, classe: '' };
  return `<span class="badge ${st.classe}">${esc(st.nome)}</span>`;
};
export const fmtHorimetro = (e) => (!e.has_hour_meter ? 'Sem horímetro'
  : e.current_hour_meter == null ? 'Sem leitura' : `${fmtNum(e.current_hour_meter, 1)} h`);

export async function render(el) {
  const [equipamentos, categorias] = await Promise.all([svc.listarEquipamentos(), svc.listarCategorias()]);
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const f = {
    busca: params.get('busca') || '',
    status: params.get('status') || '',
    categoria: params.get('categoria') || '',
    setor: '',
    criticidade: '',
  };
  let modo = lerPref('equip.modo', 'grade');
  const setores = [...new Set(equipamentos.map((e) => e.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const podeCadastrar = pode('equipment.write');

  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Equipamentos</h1>
      <p>Visão geral do parque de máquinas e status de cada equipamento.</p></div>
      <div class="acoes">
        ${podeCadastrar ? '<button class="btn" id="btn-categorias"><i data-lucide="tags"></i> Categorias</button>' : ''}
        ${podeCadastrar ? '<a class="btn btn-primario" href="#/equipamentos/novo"><i data-lucide="plus"></i> Novo equipamento</a>' : ''}
      </div></div>
    <div class="faixa-status" id="faixa-status"></div>
    <div class="card card-filtros"><div class="card-corpo filtros-equip">
      <div class="campo busca-campo"><label for="f-busca">Buscar</label>
        <input id="f-busca" type="search" placeholder="TAG, nome, fabricante, modelo…" value="${esc(f.busca)}"></div>
      <div class="campo"><label for="f-status">Status</label><select id="f-status"><option value="">Todos</option>
        ${Object.entries(svc.STATUS).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="f-categoria">Categoria</label><select id="f-categoria"><option value="">Todas</option>
        ${categorias.map((c) => `<option value="${c.id}" ${f.categoria === c.id ? 'selected' : ''}>${esc(c.name)}${c.active ? '' : ' (inativa)'}</option>`).join('')}
        <option value="-" ${f.categoria === '-' ? 'selected' : ''}>Sem categoria</option></select></div>
      <div class="campo"><label for="f-setor">Setor</label><select id="f-setor"><option value="">Todos</option>
        ${setores.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
      <div class="campo"><label for="f-crit">Criticidade</label><select id="f-crit"><option value="">Todas</option>
        ${Object.keys(svc.CRITICIDADE).map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>
      <div class="modo-vis" role="group" aria-label="Forma de exibição">
        <button class="btn btn-icone" data-modo="grade" title="Ver em quadros"><i data-lucide="layout-grid"></i></button>
        <button class="btn btn-icone" data-modo="lista" title="Ver em lista"><i data-lucide="list"></i></button>
      </div>
    </div></div>
    <div id="resultado"></div>`;

  const filtrar = () => {
    const t = f.busca.trim().toLowerCase();
    return equipamentos.filter((e) => (!f.status || e.status === f.status)
      && (!f.categoria || (f.categoria === '-' ? !e.category_id : e.category_id === f.categoria))
      && (!f.setor || e.sector === f.setor)
      && (!f.criticidade || e.criticality === f.criticidade)
      && (!t || [e.tag, e.name, e.manufacturer, e.model, e.serial_number, e.sector, e.category_name]
        .some((v) => String(v || '').toLowerCase().includes(t))));
  };

  const desenharFaixa = () => {
    // Desativados não contam no parque ativo; quadros do maior para o menor
    const ativos = equipamentos.filter((e) => e.status !== 'desativado');
    const cont = Object.keys(svc.STATUS).map((k) => ({ k, n: equipamentos.filter((e) => e.status === k).length }))
      .filter((x) => x.k !== 'desativado' || x.n)
      .sort((a, b) => b.n - a.n);
    el.querySelector('#faixa-status').innerHTML = `
      <button class="quadro-status total ${!f.status ? 'sel' : ''}" data-st=""><span class="n">${ativos.length}</span><span>Equipamentos ativos</span></button>
      ${cont.map(({ k, n }) => `<button class="quadro-status st-${svc.STATUS[k].cor} ${f.status === k ? 'sel' : ''}" data-st="${k}">
        <span class="n">${n}</span><span><i data-lucide="${svc.STATUS[k].icone}"></i> ${esc(svc.STATUS[k].nome)}</span></button>`).join('')}`;
  };

  const desenhar = () => {
    desenharFaixa();
    el.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('ativo', b.dataset.modo === modo));
    const r = filtrar();
    const res = el.querySelector('#resultado');
    if (!equipamentos.length) {
      res.innerHTML = `<div class="card">${vazio({ icone: 'factory', titulo: 'Nenhum equipamento cadastrado',
        texto: podeCadastrar ? 'Cadastre os equipamentos um a um ou envie a planilha preenchida para importação.' : 'Os equipamentos aparecem aqui assim que forem cadastrados.',
        acao: podeCadastrar ? '<a class="btn btn-primario" href="#/equipamentos/novo"><i data-lucide="plus"></i> Novo equipamento</a>' : '' })}</div>`;
    } else if (modo === 'grade') {
      res.innerHTML = `<div class="contagem-equip">${r.length} de ${equipamentos.length} equipamento${equipamentos.length === 1 ? '' : 's'}</div>
        ${r.length ? `<div class="grade-equip">${r.map((e) => `
        <a class="card equip-card st-${svc.STATUS[e.status]?.cor}" href="#/equipamentos/${e.id}">
          <div class="equip-topo"><span class="equip-tag">${esc(e.tag)}</span>
            <span class="crit crit-${e.criticality}" title="Criticidade ${e.criticality}">${e.criticality}</span></div>
          <div class="equip-nome">${esc(e.name)}</div>
          <div class="equip-meta">${esc([e.category_name, e.sector].filter(Boolean).join(' · ') || 'Sem categoria')}</div>
          <div class="equip-rodape">${badgeStatus(e.status)}<span class="small muted"><i data-lucide="gauge"></i> ${esc(fmtHorimetro(e))}</span></div>
        </a>`).join('')}</div>` : `<div class="card">${vazio({ icone: 'search-x', titulo: 'Nenhum equipamento com esses filtros' })}</div>`}`;
    } else {
      res.innerHTML = '<div class="card" id="tab-equip"></div>';
      montarTabela(res.querySelector('#tab-equip'), {
        linhas: r, busca: false, porPagina: 60,
        aoClicar: (id) => { location.hash = `#/equipamentos/${id}`; },
        colunas: [
          { titulo: 'TAG', chave: 'tag', primaria: true, render: (e) => `<b>${esc(e.tag)}</b>` },
          { titulo: 'Equipamento', chave: 'name' },
          { titulo: 'Categoria', valor: (e) => e.category_name || '', render: (e) => esc(e.category_name || '—') },
          { titulo: 'Setor', valor: (e) => e.sector || '', render: (e) => esc(e.sector || '—') },
          { titulo: 'Crit.', chave: 'criticality', render: (e) => `<span class="crit crit-${e.criticality}">${e.criticality}</span>` },
          { titulo: 'Status', valor: (e) => svc.STATUS[e.status]?.nome, render: (e) => badgeStatus(e.status) },
          { titulo: 'Horímetro', valor: (e) => e.current_hour_meter ?? -1, render: (e) => esc(fmtHorimetro(e)) },
          { titulo: 'Desde', valor: (e) => e.status_changed_at, render: (e) => `<span class="small">${fmtDataHora(e.status_changed_at)}</span>` },
        ],
      });
    }
    icones();
  };

  el.querySelector('#f-busca').addEventListener('input', (e) => { f.busca = e.target.value; desenhar(); });
  el.querySelector('#f-status').addEventListener('change', (e) => { f.status = e.target.value; desenhar(); });
  el.querySelector('#f-categoria').addEventListener('change', (e) => { f.categoria = e.target.value; desenhar(); });
  el.querySelector('#f-setor').addEventListener('change', (e) => { f.setor = e.target.value; desenhar(); });
  el.querySelector('#f-crit').addEventListener('change', (e) => { f.criticidade = e.target.value; desenhar(); });
  el.querySelector('#faixa-status').addEventListener('click', (e) => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    f.status = f.status === b.dataset.st ? '' : b.dataset.st;
    el.querySelector('#f-status').value = f.status;
    desenhar();
  });
  el.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.modo; gravarPref('equip.modo', modo); desenhar(); }));
  el.querySelector('#btn-categorias')?.addEventListener('click', () => abrirCategorias(() => render(el).then(icones)));
  desenhar();
}

// ---------------------------------------------------------------------
// Categorias (incluir, renomear, desativar — nunca apagar)
// ---------------------------------------------------------------------
export async function abrirCategorias(aoFechar) {
  let categorias = await svc.listarCategorias();
  let mudou = false;
  const { el } = abrirModal({
    titulo: 'Categorias de equipamentos',
    html: `<form id="f-cat" class="linha-form"><input name="nome" placeholder="Nova categoria (ex.: Pontes rolantes)" required minlength="2" maxlength="80">
        <button class="btn btn-primario" type="submit"><i data-lucide="plus"></i> Incluir</button></form>
      <div id="lista-cat" style="margin-top:14px"></div>`,
    rodape: '<button class="btn" data-fechar>Fechar</button>',
  });
  const obs = new MutationObserver(() => { if (!document.body.contains(el)) { obs.disconnect(); if (mudou) aoFechar?.(); } });
  obs.observe(document.body, { childList: true });

  const desenhar = () => {
    el.querySelector('#lista-cat').innerHTML = categorias.length ? `<ul class="lista-simples">${categorias.map((c) => `
      <li><span class="${c.active ? '' : 'muted'}">${esc(c.name)}${c.active ? '' : ' <span class="badge inativo">Inativa</span>'}</span>
        <span class="acoes"><button class="btn btn-sm btn-texto" data-ren="${c.id}" title="Renomear"><i data-lucide="pencil"></i></button>
        <button class="btn btn-sm btn-texto" data-at="${c.id}">${c.active ? 'Desativar' : 'Reativar'}</button></span></li>`).join('')}</ul>`
      : '<p class="muted small">Nenhuma categoria cadastrada ainda.</p>';
    icones();
  };
  desenhar();

  el.querySelector('#f-cat').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const c = await svc.criarCategoria(e.target.nome.value);
      categorias = [...categorias, c].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      e.target.reset(); mudou = true; desenhar();
    } catch (err) { toast(/duplicate|23505/i.test(`${err.code} ${err.message}`) ? 'Já existe uma categoria com esse nome.' : traduzirErro(err), 'erro'); }
  });
  el.querySelector('#lista-cat').addEventListener('click', async (e) => {
    const ren = e.target.closest('[data-ren]'); const at = e.target.closest('[data-at]');
    const id = (ren || at)?.dataset.ren || (ren || at)?.dataset.at;
    if (!id) return;
    const c = categorias.find((x) => x.id === id);
    try {
      let novo;
      if (ren) {
        const nome = prompt('Novo nome da categoria:', c.name);
        if (!nome || nome.trim() === c.name) return;
        novo = await svc.salvarCategoria(id, { name: nome.trim() });
      } else {
        novo = await svc.salvarCategoria(id, { active: !c.active });
      }
      categorias = categorias.map((x) => (x.id === id ? novo : x));
      mudou = true; desenhar();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
}
