// =====================================================================
// PAIM — lista dos checklists (um por tipo de máquina) e as próximas
// máquinas a fazer.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, vazio, montarTabela, fmtData, hojeISO, addDias, diasEntre } from '../ui.js';
import * as pm from '../services/paim.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { daPlanta } from '../plantas.js';

// Situação de uma máquina no PAIM
export function situacao(m) {
  if (m.open_check_id) return `<a class="badge info" href="#/ordens/${m.open_work_order_id}?aba=checklist">Em andamento · ${esc(m.open_work_order_number)}</a>`;
  if (!m.next_due_date) return '<span class="badge inativo">Sem data</span>';
  const d = diasEntre(hojeISO(), m.next_due_date);
  if (d < 0) return `<span class="badge perigo">Atrasada ${-d} dia${d === -1 ? '' : 's'}</span>`;
  if (d <= 7) return `<span class="badge aviso">${d === 0 ? 'Hoje' : `Em ${d} dia${d === 1 ? '' : 's'}`}</span>`;
  return '<span class="badge ativo">Em dia</span>';
}

export async function render(el) {
  const [paims, maquinas, equips] = await Promise.all([pm.listar(), pm.todasMaquinas(), listarEquipamentos().then(daPlanta).catch(() => [])]);
  const comPaim = new Set(maquinas.filter((m) => m.paim_active).map((m) => m.equipment_id));
  const semPaim = equips.filter((e) => e.status !== 'desativado' && !comPaim.has(e.id));
  const planejar = pode('planning.write');
  const ativos = paims.filter((p) => p.active);
  const atrasadas = maquinas.filter((m) => m.paim_active && m.overdue);
  const andamento = maquinas.filter((m) => m.open_check_id);
  const limite = addDias(hojeISO(), 30);
  const proximas = maquinas.filter((m) => m.paim_active && (m.open_check_id || (m.next_due_date && m.next_due_date <= limite)));
  const semFreq = ativos.filter((p) => p.interval_days == null).length;

  const tile = (rot, v, ic, cl = '', alvo = '') => `<div class="card kpi ${cl}"${alvo ? ` role="button" tabindex="0" data-rolar="${alvo}" style="cursor:pointer"` : ''}><span class="rotulo"><i data-lucide="${ic}"></i>${esc(rot)}</span><span class="valor">${v}</span></div>`;
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>PAIM</h1>
      <p>Plano Anual de Inspeção e Manutenção: o checklist de cada tipo de máquina e quando cada uma deve ser feita.</p></div>
      ${planejar ? '<div class="acoes"><a class="btn btn-primario" href="#/paim/novo"><i data-lucide="plus"></i> Novo PAIM</a></div>' : ''}</div>
    <div class="grade grade-kpi">
      ${tile('Máquinas atrasadas', atrasadas.length, 'calendar-x', atrasadas.length ? 'kpi-perigo' : '')}
      ${tile('Em andamento (OS aberta)', andamento.length, 'clipboard-check')}
      ${tile('Máquinas no PAIM', maquinas.filter((m) => m.paim_active).length, 'factory')}
      ${tile('PAIMs ativos', ativos.length, 'clipboard-list')}
      ${tile('Máquinas sem PAIM', semPaim.length, 'circle-off', semPaim.length ? 'kpi-aviso' : '', 'card-sem-paim')}
    </div>
    ${semFreq ? `<div class="alerta aviso secao"><i data-lucide="calendar-x"></i><div><b>${semFreq} PAIM${semFreq === 1 ? '' : 's'} sem frequência.</b>
      Abra o PAIM, toque em <b>Editar</b> e escolha de quanto em quanto tempo ele é feito. Depois, coloque a próxima data de cada máquina.</div></div>` : ''}
    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="calendar-clock"></i> Atrasadas, em andamento e próximos 30 dias</h3></div>
      <div id="tab-prox"></div></div>
    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="clipboard-list"></i> Checklists do PAIM</h3></div>
      <div id="tab-paims"></div></div>
    <div class="card secao" id="card-sem-paim"><div class="card-titulo"><h3><i data-lucide="circle-off"></i> Máquinas sem PAIM (${semPaim.length})</h3></div>
      ${semPaim.length && planejar ? '<p class="small muted" style="margin:12px 18px 0">Para colocar uma máquina num PAIM, abra o PAIM do tipo dela, toque em <b>Editar</b> e marque a máquina na lista. Se não existir um PAIM para esse tipo, toque em <b>Novo PAIM</b>.</p>' : ''}
      <div id="tab-sem-paim"></div></div>`;

  el.querySelectorAll('[data-rolar]').forEach((t) => t.addEventListener('click', () => document.getElementById(t.dataset.rolar)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  montarTabela(el.querySelector('#tab-sem-paim'), {
    linhas: semPaim, busca: semPaim.length > 10, porPagina: 50, aoClicar: (id) => { location.hash = `#/equipamentos/${id}?aba=paim`; },
    vazioHtml: vazio({ icone: 'check-circle', titulo: 'Todas as máquinas estão em algum PAIM' }),
    colunas: [
      { titulo: 'Máquina', valor: (e) => e.tag, render: (e) => `<b>${esc(e.tag)}</b> <span class="muted small">${esc(e.name)}</span>`, primaria: true },
      { titulo: 'Setor', valor: (e) => e.sector || '', render: (e) => esc(e.sector || '—') },
      { titulo: 'Categoria', valor: (e) => e.category_name || '', render: (e) => esc(e.category_name || '—') },
    ],
  });

  montarTabela(el.querySelector('#tab-prox'), {
    linhas: proximas, busca: false, porPagina: 15, aoClicar: (id) => { location.hash = `#/paim/${proximas.find((m) => m.id === id).paim_id}`; },
    vazioHtml: vazio({ icone: 'calendar-check', titulo: 'Nada para os próximos 30 dias', texto: 'As máquinas aparecem aqui quando a próxima data se aproxima.' }),
    colunas: [
      { titulo: 'Máquina', valor: (m) => m.equipment_tag, render: (m) => `<b>${esc(m.equipment_tag)}</b> <span class="muted small">${esc(m.equipment_name)}</span>`, primaria: true },
      { titulo: 'PAIM', chave: 'paim_name' },
      { titulo: 'Próxima data', valor: (m) => m.next_due_date || '', render: (m) => (m.next_due_date ? fmtData(m.next_due_date) : '—'), classe: 'num' },
      { titulo: 'Situação', valor: (m) => (m.open_check_id ? 1 : m.overdue ? 0 : 2), render: situacao },
    ],
    ordem: 2,
  });

  montarTabela(el.querySelector('#tab-paims'), {
    linhas: paims, porPagina: 50, aoClicar: (id) => { location.hash = `#/paim/${id}`; },
    vazioHtml: vazio({ icone: 'clipboard-list', titulo: 'Nenhum PAIM cadastrado', texto: planejar ? 'Toque em "Novo PAIM" para criar o primeiro checklist.' : '' }),
    colunas: [
      { titulo: 'PAIM', chave: 'name', render: (p) => `<b>${esc(p.name)}</b>${p.active ? '' : ' <span class="badge inativo">desativado</span>'}<div class="small muted">revisão ${pm.revisao(p.revision)}</div>`, primaria: true },
      { titulo: 'Frequência', valor: (p) => p.interval_days ?? 99999, render: (p) => (p.interval_days == null ? '<span class="badge aviso">A definir</span>' : esc(pm.frequencia(p.interval_days))) },
      { titulo: 'Itens', valor: (p) => Number(p.items_count), render: (p) => `<b>${p.items_count}</b> <span class="small muted">${[['M', p.items_mecanica], ['E', p.items_eletrica], ['O', p.items_operacional]].filter(([, n]) => Number(n)).map(([l, n]) => `${l} ${n}`).join(' · ')}</span>`, classe: 'num' },
      { titulo: 'Máquinas', valor: (p) => p.equipment_tags || '', render: (p) => (Number(p.equipment_count) ? `<b>${p.equipment_count}</b> <span class="small muted">${esc(p.equipment_tags)}</span>` : '<span class="muted">nenhuma</span>') },
      { titulo: 'Situação', valor: (p) => Number(p.overdue_count) * 1000 + Number(p.open_count),
        render: (p) => [Number(p.overdue_count) ? `<span class="badge perigo">${p.overdue_count} atrasada${p.overdue_count == 1 ? '' : 's'}</span>` : '',
          Number(p.open_count) ? `<span class="badge info">${p.open_count} em andamento</span>` : '',
          p.next_due_date ? `<span class="small muted">próxima ${fmtData(p.next_due_date)}</span>` : ''].filter(Boolean).join(' ') || '—' },
    ],
  });
  icones();
}
