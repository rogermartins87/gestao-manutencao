// =====================================================================
// Pendências — quadro (A fazer / Em andamento / Concluídas), lista e
// alertas do sistema (o que está atrasado nos outros módulos).
// =====================================================================
import { pode, store } from '../store.js';
import { esc, icones, toast, traduzirErro, vazio, montarTabela, fmtData, hojeISO, addDias, carregando, erroCarga } from '../ui.js';
import * as pe from '../services/pendencias.js';
import { PRIORIDADE, listar as listarOS } from '../services/ordens.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { agendaAberta } from '../services/preventiva.js';
import { pontos as pontosPred } from '../services/preditiva.js';
import { situacao as situacaoHm } from '../services/horimetros.js';
import { formularioModal } from './ordem-ficha.js';

export const podeAlterar = (p) => pode('pending.write')
  && (p.created_by === store.perfil?.id || p.assigned_to === store.perfil?.id || pode('work_order.approve'));

export const badgePend = (s) => `<span class="badge ${pe.STATUS_PEND[s].classe}">${esc(pe.STATUS_PEND[s].nome)}</span>`;
const badgePri = (k) => `<span class="badge ${PRIORIDADE[k].classe}">${esc(PRIORIDADE[k].nome)}</span>`;

export function prazo(p) {
  if (!p.due_date) return '<span class="muted small">sem prazo</span>';
  if (!pe.ABERTAS.includes(p.status)) return `<span class="small muted">prazo ${fmtData(p.due_date)}</span>`;
  const d = Math.round((new Date(`${p.due_date}T12:00:00`) - new Date(`${hojeISO()}T12:00:00`)) / 864e5);
  const t = d === 0 ? 'vence hoje' : d > 0 ? `em ${d} dia${d === 1 ? '' : 's'}` : `atrasada ${-d} dia${d === -1 ? '' : 's'}`;
  return `<span class="small ${d < 0 ? 'perigo-txt' : d <= 2 ? 'aviso-txt' : 'muted'} nowrap">${fmtData(p.due_date)} · ${t}</span>`;
}

// ---------- Nova / editar pendência (modal) ----------
export async function abrirPendencia({ pend = null, equipamentoId = null, osId = null, depois } = {}) {
  const [pessoas, eqs, oss] = await Promise.all([pe.pessoasAtivas(), listarEquipamentos(), listarOS().catch(() => [])]);
  const v = pend || { priority: 'media', equipment_id: equipamentoId, work_order_id: osId, assigned_to: null };
  if (osId && !v.equipment_id) v.equipment_id = oss.find((o) => o.id === osId)?.equipment_id || null;
  const abertasOS = oss.filter((o) => !['concluida', 'cancelada'].includes(o.status) || o.id === v.work_order_id);
  const opOS = (eq) => abertasOS.filter((o) => !eq || o.equipment_id === eq)
    .map((o) => `<option value="${o.id}" ${o.id === v.work_order_id ? 'selected' : ''}>${esc(o.number)} — ${esc(o.title)}</option>`).join('');
  const { el } = formularioModal({
    titulo: pend ? 'Editar pendência' : 'Nova pendência',
    campos: `
      <div class="campo"><label for="pp-tit">O que precisa ser feito *</label><input id="pp-tit" name="tit" required minlength="3" maxlength="160" value="${esc(v.title || '')}" placeholder="Ex.: Comprar rolamento 6205 para a LAM-01"></div>
      <div class="grade grade-form">
        <div class="campo"><label for="pp-resp">Responsável</label><select id="pp-resp" name="resp"><option value="">Sem responsável</option>
          ${pessoas.map((x) => `<option value="${x.id}" ${x.id === v.assigned_to ? 'selected' : ''}>${esc(x.full_name)}${x.id === store.perfil?.id ? ' (eu)' : ''}</option>`).join('')}</select></div>
        <div class="campo"><label for="pp-prazo">Prazo</label><input id="pp-prazo" name="prazo" type="date" value="${v.due_date || ''}"></div>
        <div class="campo"><label for="pp-pri">Prioridade</label><select id="pp-pri" name="pri">
          ${Object.entries(PRIORIDADE).map(([k, x]) => `<option value="${k}" ${v.priority === k ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
      </div>
      <div class="grade grade-form">
        <div class="campo"><label for="pp-eq">Equipamento</label><select id="pp-eq" name="eq"><option value="">Nenhum</option>
          ${eqs.map((e) => `<option value="${e.id}" ${e.id === v.equipment_id ? 'selected' : ''}>${esc(e.tag)} — ${esc(e.name)}</option>`).join('')}</select></div>
        <div class="campo"><label for="pp-os">Ordem de serviço</label><select id="pp-os" name="os"><option value="">Nenhuma</option>${opOS(v.equipment_id)}</select></div>
      </div>
      <div class="campo"><label for="pp-desc">Detalhes</label><textarea id="pp-desc" name="desc" rows="3" maxlength="4000" placeholder="Opcional">${esc(v.description || '')}</textarea></div>
      ${v.assigned_to || !pend ? '<span class="ajuda">O responsável recebe um aviso no sininho.</span>' : ''}`,
    botao: pend ? 'Salvar' : 'Criar pendência',
    enviar: async (f) => {
      const d = { title: f.tit.value.trim(), description: f.desc.value.trim() || null, assigned_to: f.resp.value || null,
        due_date: f.prazo.value || null, priority: f.pri.value, equipment_id: f.eq.value || null, work_order_id: f.os.value || null };
      if (pend) await pe.salvar(pend.id, d); else await pe.criar(d);
    },
    sucesso: pend ? 'Pendência alterada.' : 'Pendência criada.', depois,
  });
  const f = el.querySelector('form');
  f.eq.addEventListener('change', () => { f.os.innerHTML = `<option value="">Nenhuma</option>${opOS(f.eq.value)}`; });
  f.os.addEventListener('change', () => { const o = oss.find((x) => x.id === f.os.value); if (o) f.eq.value = o.equipment_id; });
}

// Concluir / cancelar / iniciar / reabrir
export function mudarStatus(p, novo, depois) {
  if (novo === 'concluida') {
    return formularioModal({
      titulo: 'Concluir pendência',
      campos: `<p style="margin:0"><b>${esc(p.title)}</b></p>
        <div class="campo"><label for="m-nota">Como foi resolvido</label><textarea id="m-nota" name="nota" rows="3" maxlength="2000" placeholder="Opcional. Quem criou a pendência recebe esta nota no aviso."></textarea></div>`,
      botao: 'Concluir', classe: 'btn-sucesso',
      enviar: (f) => pe.salvar(p.id, { status: 'concluida', done_note: f.nota.value.trim() || null }),
      sucesso: 'Pendência concluída.', depois,
    });
  }
  if (novo === 'cancelada') {
    return formularioModal({
      titulo: 'Cancelar pendência',
      campos: `<p style="margin:0"><b>${esc(p.title)}</b></p>
        <div class="campo"><label for="m-mot">Motivo *</label><input id="m-mot" name="mot" required minlength="5" maxlength="500" placeholder="Ex.: não é mais necessária"></div>`,
      botao: 'Cancelar pendência', classe: 'btn-perigo',
      enviar: (f) => pe.salvar(p.id, { status: 'cancelada', cancel_reason: f.mot.value.trim() }),
      sucesso: 'Pendência cancelada.', depois,
    });
  }
  return pe.salvar(p.id, { status: novo })
    .then(() => { toast(novo === 'em_andamento' ? 'Pendência em andamento.' : 'Pendência reaberta.'); depois?.(); })
    .catch((err) => toast(traduzirErro(err), 'erro'));
}

function cartao(p) {
  const pode_ = podeAlterar(p);
  return `<div class="cartao-pend ${p.overdue ? 'atrasada' : ''}" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc(p.title)}">
    <div class="cartao-pend-cab">${badgePri(p.priority)}${prazo(p)}</div>
    <b class="cartao-pend-tit">${esc(p.title)}</b>
    ${p.equipment_tag || p.work_order_number ? `<div class="small muted">${[p.equipment_tag, p.work_order_number].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
    <div class="cartao-pend-rod"><span class="small"><i data-lucide="user" style="width:14px;height:14px;vertical-align:-2px"></i> ${esc(p.assigned_to_name || 'sem responsável')}</span>
      ${pode_ && p.status === 'aberta' ? `<button class="btn btn-sm" data-st="em_andamento" data-p="${p.id}">Iniciar</button>` : ''}
      ${pode_ && pe.ABERTAS.includes(p.status) ? `<button class="btn btn-sm btn-sucesso" data-st="concluida" data-p="${p.id}"><i data-lucide="check"></i> Concluir</button>` : ''}
    </div></div>`;
}

export async function alertasSistema() {
  const [oss, ag, pts, hms] = await Promise.all([listarOS().catch(() => []), agendaAberta().catch(() => []),
    pontosPred().catch(() => []), situacaoHm().catch(() => [])]);
  return [
    { n: oss.filter((o) => o.overdue).length, t: 'OS atrasadas', i: 'clipboard-list', h: '#/ordens?situacao=atrasadas', cl: 'st-parado' },
    { n: oss.filter((o) => o.status === 'aberta').length, t: 'OS aguardando aprovação', i: 'stamp', h: '#/ordens?situacao=aberta', cl: 'st-manutencao' },
    { n: ag.filter((s) => s.situacao === 'vencida').length, t: 'Preventivas vencidas', i: 'calendar-x', h: '#/preventiva', cl: 'st-parado' },
    { n: pts.filter((p) => p.active && p.situacao === 'critico').length, t: 'Pontos em crítico', i: 'octagon-alert', h: '#/preditiva', cl: 'st-parado' },
    { n: pts.filter((p) => p.active && p.overdue).length, t: 'Rotas preditivas atrasadas', i: 'activity', h: '#/preditiva', cl: 'st-manutencao' },
    { n: hms.filter((h) => h.situacao !== 'em_dia').length, t: 'Horímetros sem leitura recente', i: 'gauge', h: '#/horimetros', cl: 'st-manutencao' },
  ].filter((x) => x.n).sort((a, b) => b.n - a.n);   // do maior para o menor
}

const ABAS = { quadro: 'Quadro', lista: 'Lista' };

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let aba = ABAS[params.get('aba')] ? params.get('aba') : 'quadro';
  const f = { minhas: params.get('minhas') === '1', resp: '', busca: '', status: '' };
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Pendências</h1>
      <p>Tarefas avulsas com responsável e prazo, e o que está atrasado no sistema.</p></div>
      <div class="acoes">${pode('pending.write') ? '<button class="btn btn-primario" id="btn-nova-pend"><i data-lucide="plus"></i> Nova pendência</button>' : ''}</div></div>
    <div id="alertas-sis"></div>
    <div class="card card-filtros"><div class="card-corpo filtros-equip filtros-pecas">
      <div class="campo busca-campo"><label for="pe-busca">Buscar</label><input id="pe-busca" type="search" placeholder="Título, TAG, OS…"></div>
      <div class="campo"><label for="pe-resp">Responsável</label><select id="pe-resp"><option value="">Todos</option><option value="-">Sem responsável</option></select></div>
      <label class="check-linha" style="align-self:end;padding-bottom:10px"><input type="checkbox" id="pe-minhas"> Só as minhas</label>
    </div></div>
    <div class="abas" role="tablist">${Object.entries(ABAS).map(([k, v]) => `<button class="aba" data-aba="${k}">${v}</button>`).join('')}</div>
    <div id="aba-pend">${carregando()}</div>`;
  el.querySelector('#pe-minhas').checked = f.minhas;
  const corpo = el.querySelector('#aba-pend');
  let lista = [];

  alertasSistema().then((al) => {
    el.querySelector('#alertas-sis').innerHTML = al.length ? `<h2 class="secao-titulo"><i data-lucide="bell-ring"></i> Atenção no sistema</h2>
      <div class="faixa-status">${al.map((x) => `<a class="quadro-status ${x.cl}" href="${x.h}"><span class="n">${x.n}</span><span><i data-lucide="${x.i}"></i> ${esc(x.t)}</span></a>`).join('')}</div>` : '';
    icones();
  });

  const filtrar = () => {
    const t = f.busca.trim().toLowerCase(); const eu = store.perfil?.id;
    return lista.filter((p) => (!f.minhas || p.assigned_to === eu || (!p.assigned_to && p.created_by === eu))
      && (!f.resp || (f.resp === '-' ? !p.assigned_to : p.assigned_to === f.resp))
      && (!t || [p.title, p.equipment_tag, p.equipment_name, p.work_order_number, p.description].some((v) => String(v || '').toLowerCase().includes(t))));
  };
  const ordemPri = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  const desenhar = () => {
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === aba));
    history.replaceState(null, '', `${location.pathname}${location.search}#/pendencias?aba=${aba}${f.minhas ? '&minhas=1' : ''}`);
    const r = filtrar();
    if (!lista.length) {
      corpo.innerHTML = `<div class="card">${vazio({ icone: 'list-todo', titulo: 'Nenhuma pendência ainda',
        texto: 'Use para tarefas que não são uma OS: comprar uma peça, pedir um orçamento, conferir um desenho.',
        acao: pode('pending.write') ? '<button class="btn btn-primario" data-nova><i data-lucide="plus"></i> Nova pendência</button>' : '' })}</div>`;
      corpo.querySelector('[data-nova]')?.addEventListener('click', nova);
    } else if (aba === 'quadro') {
      const limite = addDias(hojeISO(), -30);
      const col = (st) => r.filter((p) => p.status === st && (st !== 'concluida' || String(p.done_at).slice(0, 10) >= limite))
        .sort((a, b) => (st === 'concluida' ? String(b.done_at).localeCompare(String(a.done_at))
          : (b.overdue - a.overdue) || (ordemPri[a.priority] - ordemPri[b.priority]) || String(a.due_date || '9').localeCompare(String(b.due_date || '9'))));
      corpo.innerHTML = `<div class="kanban">${['aberta', 'em_andamento', 'concluida'].map((st) => {
        const cs = col(st);
        return `<section class="kanban-col"><h3><i data-lucide="${pe.STATUS_PEND[st].icone}"></i> ${pe.STATUS_PEND[st].nome}${st === 'concluida' ? ' <span class="small muted">(30 dias)</span>' : ''} <span class="contador">${cs.length}</span></h3>
          ${cs.length ? cs.map(cartao).join('') : '<p class="muted small" style="margin:8px 4px">Nada aqui.</p>'}</section>`;
      }).join('')}</div>`;
    } else {
      corpo.innerHTML = `<div class="acoes" style="margin:0 0 12px"><select id="pe-st" aria-label="Situação"><option value="">Todas as situações</option>
          ${Object.entries(pe.STATUS_PEND).map(([k, x]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${x.nome}</option>`).join('')}</select></div>
        <div class="card" id="tab-pend"></div>`;
      corpo.querySelector('#pe-st').onchange = (ev) => { f.status = ev.target.value; desenhar(); };
      montarTabela(corpo.querySelector('#tab-pend'), {
        linhas: r.filter((p) => !f.status || p.status === f.status), busca: false, porPagina: 50,
        aoClicar: (id) => { location.hash = `#/pendencias/${id}`; },
        colunas: [
          { titulo: 'Pendência', valor: (p) => p.title, primaria: true, render: (p) => `<div><b>${esc(p.title)}</b>${p.equipment_tag || p.work_order_number ? `<div class="small muted">${[p.equipment_tag, p.work_order_number].filter(Boolean).map(esc).join(' · ')}</div>` : ''}</div>` },
          { titulo: 'Situação', valor: (p) => Object.keys(pe.STATUS_PEND).indexOf(p.status), render: (p) => badgePend(p.status) },
          { titulo: 'Prioridade', valor: (p) => ordemPri[p.priority], render: (p) => badgePri(p.priority) },
          { titulo: 'Prazo', valor: (p) => p.due_date || '9999', classe: 'num', render: prazo },
          { titulo: 'Responsável', valor: (p) => p.assigned_to_name || '', render: (p) => esc(p.assigned_to_name || '—') },
        ],
      });
    }
    icones();
  };
  const carregar = async () => {
    try { lista = await pe.listar(); } catch (err) { corpo.innerHTML = erroCarga(err); return; }
    const sel = el.querySelector('#pe-resp');
    const nomes = [...new Map(lista.filter((p) => p.assigned_to).map((p) => [p.assigned_to, p.assigned_to_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    sel.innerHTML = `<option value="">Todos</option><option value="-">Sem responsável</option>${nomes.map(([id, n]) => `<option value="${id}" ${f.resp === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}`;
    desenhar();
  };
  const nova = () => abrirPendencia({ depois: carregar });

  el.querySelector('#btn-nova-pend')?.addEventListener('click', nova);
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) { aba = b.dataset.aba; desenhar(); } });
  el.querySelector('#pe-busca').oninput = (ev) => { f.busca = ev.target.value; desenhar(); };
  el.querySelector('#pe-resp').onchange = (ev) => { f.resp = ev.target.value; desenhar(); };
  el.querySelector('#pe-minhas').onchange = (ev) => { f.minhas = ev.target.checked; desenhar(); };
  corpo.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-st]');
    if (b) { ev.stopPropagation(); mudarStatus(lista.find((p) => p.id === b.dataset.p), b.dataset.st, carregar); return; }
    const c = ev.target.closest('.cartao-pend');
    if (c) location.hash = `#/pendencias/${c.dataset.id}`;
  });
  corpo.addEventListener('keydown', (ev) => { const c = ev.target.closest('.cartao-pend'); if (c && ev.key === 'Enter') location.hash = `#/pendencias/${c.dataset.id}`; });
  await carregar();
}
