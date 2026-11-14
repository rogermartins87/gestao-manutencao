// =====================================================================
// Planejamento preventivo — agenda (o que vence e quando), planos e
// cumprimento no prazo. A agenda é feita pelo banco; aqui se gera a OS,
// pula ou reprograma um item.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, vazio, montarTabela, fmtData, fmtNum, hojeISO, addDias, carregando, erroCarga } from '../ui.js';
import * as pv from '../services/preventiva.js';
import { formularioModal } from './ordem-ficha.js';

export const badgeSituacao = (s) => {
  const x = pv.SITUACAO[s] || { nome: s, classe: '' };
  return `<span class="badge ${x.classe}">${esc(x.nome)}</span>`;
};

// "15/12/2026" e/ou "5.800 h", com a data estimada quando o vencimento é por horímetro
export function vencimento(s) {
  const partes = [];
  if (s.due_date) partes.push(`<b class="nowrap">${fmtData(s.due_date)}</b>`);
  if (s.due_hour_meter != null) partes.push(`<b class="nowrap">${fmtNum(s.due_hour_meter, 0)} h</b>`);
  let det = '';
  if (['prevista', 'os_gerada'].includes(s.status)) {
    if (s.due_hour_meter != null && s.current_hour_meter != null) {
      det = Number(s.remaining_hours) > 0 ? `faltam ${fmtNum(s.remaining_hours, 0)} h` : `passou ${fmtNum(-s.remaining_hours, 0)} h`;
      if (s.estimated_hour_meter_date && Number(s.remaining_hours) > 0) det += ` · ~${fmtData(s.estimated_hour_meter_date)}`;
    }
    if (s.due_date && s.remaining_days != null) {
      const d = Number(s.remaining_days);
      const t = d === 0 ? 'vence hoje' : d > 0 ? `em ${d} dia${d === 1 ? '' : 's'}` : `há ${-d} dia${d === -1 ? '' : 's'}`;
      det = det ? `${t} · ${det}` : t;
    }
  }
  return `<div>${partes.join(' ou ')}${det ? `<div class="small muted">${det}</div>` : ''}</div>`;
}

export function tabelaAgenda(container, lista, { semEquipamento = false, aoGerar } = {}) {
  const podeGerar = pode('work_order.manage');
  montarTabela(container, {
    linhas: lista, busca: false, porPagina: 50,
    aoClicar: (id) => { const s = lista.find((x) => x.id === id); location.hash = `#/preventiva/planos/${s.plan_id}`; },
    vazioHtml: vazio({ icone: 'calendar-check', titulo: 'Nada na agenda com esses filtros' }),
    colunas: [
      { titulo: 'Vencimento', valor: (s) => s.next_date || '9999', render: vencimento, classe: 'num', primaria: true },
      ...(semEquipamento ? [] : [{ titulo: 'Equipamento', valor: (s) => s.equipment_tag, render: (s) => `<div><b>${esc(s.equipment_tag)}</b><div class="small muted">${esc(s.equipment_name)}</div></div>` }]),
      { titulo: 'Plano', valor: (s) => s.plan_name, render: (s) => `<div>${esc(s.plan_name)}<div class="small muted">${esc(pv.intervalo(s))}</div></div>` },
      { titulo: 'Situação', valor: (s) => ['vencida', 'proxima', 'em_dia'].indexOf(s.situacao), render: (s) => badgeSituacao(s.situacao) },
      { titulo: 'OS', valor: (s) => s.work_order_number || '', render: (s) => (s.work_order_id
        ? `<div><a href="#/ordens/${s.work_order_id}"><b class="nowrap">${esc(s.work_order_number)}</b></a><div class="small muted">${esc(s.assigned_to_name || 'sem responsável')}</div></div>`
        : podeGerar && s.status === 'prevista' && s.plan_active ? `<button class="btn btn-sm" data-gerar="${s.id}"><i data-lucide="file-plus"></i> Gerar OS</button>` : '<span class="muted">—</span>') },
    ],
  });
  container.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-gerar]'); if (!b) return;
    b.disabled = true;
    try {
      const os = await pv.gerarOS(b.dataset.gerar);
      toast('OS gerada.');
      aoGerar ? aoGerar(os) : (location.hash = `#/ordens/${os}`);
    } catch (err) { toast(traduzirErro(err), 'erro'); b.disabled = false; }
  });
}

const ABAS = { agenda: 'Agenda', planos: 'Planos', cumprimento: 'Cumprimento' };

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let aba = ABAS[params.get('aba')] ? params.get('aba') : 'agenda';
  const podeGerar = pode('work_order.manage');
  const podePlanejar = pode('planning.write');
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Planejamento preventivo</h1>
      <p>Planos por calendário ou horímetro. Ao concluir a OS, a próxima data é agendada a partir da execução real.</p></div>
      <div class="acoes">
        ${podeGerar ? '<button class="btn" id="btn-lote"><i data-lucide="files"></i> Gerar OS da semana</button>' : ''}
        ${podePlanejar ? '<a class="btn btn-primario" href="#/preventiva/planos/novo"><i data-lucide="plus"></i> Novo plano</a>' : ''}
      </div></div>
    <div class="abas" role="tablist">${Object.entries(ABAS).map(([k, v]) => `<button class="aba" data-aba="${k}">${v}</button>`).join('')}</div>
    <div id="aba-prev"></div>`;
  const corpo = el.querySelector('#aba-prev');
  const abrir = async (k) => {
    aba = k;
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    history.replaceState(null, '', `${location.pathname}${location.search}#/preventiva?aba=${k}`);
    corpo.innerHTML = carregando();
    try { await ({ agenda: abaAgenda, planos: abaPlanos, cumprimento: abaCumprimento })[k](corpo); } catch (err) { console.error(err); corpo.innerHTML = erroCarga(err); }
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) abrir(b.dataset.aba); });
  el.querySelector('#btn-lote')?.addEventListener('click', () => formularioModal({
    titulo: 'Gerar OS preventivas',
    campos: `<p style="margin:0">Gera a OS de cada item <b>vencido</b> ou que vence nos próximos dias (pela data ou pela média de uso do horímetro).
      As OS já nascem aprovadas, com as tarefas do plano e o responsável padrão.</p>
      <div class="campo"><label for="m-dias">Vencendo nos próximos (dias) *</label><input id="m-dias" name="dias" type="number" min="0" max="90" value="7" required></div>`,
    botao: 'Gerar OS',
    enviar: async (f) => { const n = await pv.gerarEmLote(Number(f.dias.value)); toast(n ? `${n} OS gerada${n === 1 ? '' : 's'}.` : 'Nenhum item a gerar nesse período.'); },
    sucesso: null, depois: () => abrir(aba),
  }));
  await abrir(aba);
}

async function abaAgenda(corpo) {
  const lista = await pv.agendaAberta();
  const f = { sit: '', equip: '', busca: '' };
  const contar = (k) => lista.filter((s) => (k === 'os_gerada' ? s.status === 'os_gerada' : s.situacao === k)).length;
  const quadros = [['vencida', 'st-parado'], ['proxima', 'st-manutencao'], ['em_dia', 'st-operando'], ['os_gerada', '']]
    .map(([k, cl]) => ({ k, cl, n: contar(k) })).filter((x) => x.n).sort((a, b) => b.n - a.n);   // do maior para o menor
  const eqs = [...new Map(lista.map((s) => [s.equipment_id, s.equipment_tag])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }));
  corpo.innerHTML = `
    <div class="faixa-status" id="faixa-prev"></div>
    <div class="card card-filtros"><div class="card-corpo filtros-equip filtros-pecas">
      <div class="campo busca-campo"><label for="pv-busca">Buscar</label><input id="pv-busca" type="search" placeholder="TAG, equipamento, plano, OS…"></div>
      <div class="campo"><label for="pv-eq">Equipamento</label><select id="pv-eq"><option value="">Todos</option>
        ${eqs.map(([id, t]) => `<option value="${id}">${esc(t)}</option>`).join('')}</select></div>
    </div></div>
    <div id="res-agenda"></div>`;
  const desenhar = () => {
    corpo.querySelector('#faixa-prev').innerHTML = `
      <button class="quadro-status total ${!f.sit ? 'sel' : ''}" data-sit=""><span class="n">${lista.length}</span><span>Na agenda</span></button>
      ${quadros.map(({ k, cl, n }) => `<button class="quadro-status ${cl} ${f.sit === k ? 'sel' : ''}" data-sit="${k}"><span class="n">${n}</span>
        <span>${k === 'os_gerada' ? '<i data-lucide="file-check"></i> Com OS gerada' : `<i data-lucide="${pv.SITUACAO[k].icone}"></i> ${pv.SITUACAO[k].nome}`}</span></button>`).join('')}`;
    const t = f.busca.trim().toLowerCase();
    const r = lista.filter((s) => (!f.sit || (f.sit === 'os_gerada' ? s.status === 'os_gerada' : s.situacao === f.sit))
      && (!f.equip || s.equipment_id === f.equip)
      && (!t || [s.equipment_tag, s.equipment_name, s.plan_name, s.work_order_number].some((v) => String(v || '').toLowerCase().includes(t))));
    const res = corpo.querySelector('#res-agenda');
    if (!lista.length) {
      res.innerHTML = `<div class="card">${vazio({ icone: 'calendar-check', titulo: 'Nenhum plano preventivo ainda',
        texto: pode('planning.write') ? 'Crie o primeiro plano: por exemplo, lubrificação a cada 30 dias ou troca de óleo a cada 500 h.' : 'Os itens aparecem aqui quando os planos forem criados.',
        acao: pode('planning.write') ? '<a class="btn btn-primario" href="#/preventiva/planos/novo"><i data-lucide="plus"></i> Novo plano</a>' : '' })}</div>`;
    } else {
      res.innerHTML = '<div class="card" id="tab-agenda"></div>';
      tabelaAgenda(res.querySelector('#tab-agenda'), r, { aoGerar: () => abaAgenda(corpo).then(icones) });
    }
    icones();
  };
  corpo.querySelector('#faixa-prev').onclick = (ev) => { const b = ev.target.closest('[data-sit]'); if (b) { f.sit = b.dataset.sit; desenhar(); } };
  corpo.querySelector('#pv-busca').oninput = (ev) => { f.busca = ev.target.value; desenhar(); };
  corpo.querySelector('#pv-eq').onchange = (ev) => { f.equip = ev.target.value; desenhar(); };
  desenhar();
}

export function tabelaPlanos(container, lista, { semEquipamento = false } = {}) {
  montarTabela(container, {
    linhas: lista, busca: false, porPagina: 50,
    aoClicar: (id) => { location.hash = `#/preventiva/planos/${id}`; },
    vazioHtml: vazio({ icone: 'calendar-check', titulo: 'Nenhum plano' }),
    colunas: [
      ...(semEquipamento ? [] : [{ titulo: 'Equipamento', valor: (p) => p.equipment_tag, primaria: true, render: (p) => `<div><b>${esc(p.equipment_tag)}</b><div class="small muted">${esc(p.equipment_name)}</div></div>` }]),
      { titulo: 'Plano', chave: 'name', primaria: semEquipamento, render: (p) => `<div>${esc(p.name)} ${p.active ? '' : '<span class="badge inativo">desativado</span>'}
        <div class="small muted">${esc(pv.GATILHO[p.trigger].curto)} · ${esc(pv.intervalo(p))}${p.tasks_count ? ` · ${p.tasks_count} tarefa${p.tasks_count == 1 ? '' : 's'}` : ''}</div></div>` },
      { titulo: 'Próximo vencimento', valor: (p) => p.next_date || p.next_due_date || '9999', classe: 'num',
        render: (p) => (p.next_schedule_id ? `<div>${vencimento({ ...p, status: 'x', due_date: p.next_due_date, due_hour_meter: p.next_due_hour_meter })}${badgeSituacao(p.next_situacao)}</div>` : '<span class="muted">—</span>') },
      { titulo: 'Execuções no prazo', valor: (p) => Number(p.executed_count), classe: 'num',
        render: (p) => (Number(p.executed_count) ? `<div><b>${p.on_time_count} de ${p.executed_count}</b><div class="small muted">última ${fmtData(p.last_executed_at)}</div></div>` : '<span class="muted small">nenhuma ainda</span>') },
      { titulo: 'Responsável padrão', valor: (p) => p.default_assignee_name || '', render: (p) => esc(p.default_assignee_name || '—') },
    ],
  });
}

async function abaPlanos(corpo) {
  const lista = await pv.planos();
  let inativos = false;
  corpo.innerHTML = `<div class="acoes" style="margin:0 0 12px;justify-content:space-between">
      <span class="muted" id="cont-planos"></span><label class="check-linha"><input type="checkbox" id="pv-inat"> Mostrar desativados</label></div>
    <div class="card" id="tab-planos"></div>`;
  const desenhar = () => {
    const r = lista.filter((p) => inativos || p.active);
    corpo.querySelector('#cont-planos').textContent = `${r.length} plano${r.length === 1 ? '' : 's'}`;
    tabelaPlanos(corpo.querySelector('#tab-planos'), r);
  };
  corpo.querySelector('#pv-inat').onchange = (ev) => { inativos = ev.target.checked; desenhar(); };
  desenhar();
}

const PERIODOS = { 30: 'Últimos 30 dias', 90: 'Últimos 90 dias', 365: 'Últimos 12 meses' };

async function abaCumprimento(corpo) {
  let dias = 90;
  corpo.innerHTML = `<div class="card card-filtros"><div class="card-corpo filtros-equip filtros-pecas">
      <div class="campo"><label for="pv-per">Período</label><select id="pv-per">
        ${Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${Number(k) === dias ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div></div>
    <div id="res-cump"></div>`;
  const carregar = async () => {
    const res = corpo.querySelector('#res-cump');
    res.innerHTML = carregando();
    const ini = addDias(hojeISO(), -dias);
    const [c, feitas] = await Promise.all([pv.cumprimento(ini, hojeISO()), pv.executadas(`${ini}T00:00:00`)]);
    const tile = (rot, v, det, cl = '') => `<div class="card kpi ${cl}"><span class="rotulo">${esc(rot)}</span><span class="valor">${v}</span>${det ? `<span class="detalhe">${det}</span>` : ''}</div>`;
    res.innerHTML = `
      ${!c || c.selo === 'sem_dados'
        ? '<div class="alerta info secao"><i data-lucide="info"></i><div>Sem preventivas previstas com prazo vencido neste período. O cumprimento aparece quando houver itens cujo prazo (data + tolerância) já passou.</div></div>'
        : `<div class="grade-custos secao">
            ${tile('Cumprimento no prazo', `${fmtNum(c.percentual, 1)}%`, `${c.no_prazo} no prazo ÷ ${c.previstas} previstas`, 'destaque')}
            ${tile('Executadas no prazo', c.no_prazo, '')}
            ${tile('Executadas fora do prazo', c.fora_do_prazo, '')}
            ${tile('Não executadas', c.nao_executadas, 'prazo já passou')}
          </div>`}
      <p class="muted small secao">Contam as preventivas que venciam no período e cujo prazo (data prevista + tolerância, ou horímetro previsto + tolerância) já passou. Itens pulados com motivo não contam.</p>
      <h3 class="secao"><i data-lucide="circle-check" style="width:18px;height:18px;vertical-align:-3px"></i> Executadas no período</h3>
      <div class="card" id="tab-feitas"></div>`;
    montarTabela(res.querySelector('#tab-feitas'), {
      linhas: feitas, busca: false, porPagina: 50,
      aoClicar: (id) => { const s = feitas.find((x) => x.id === id); location.hash = `#/preventiva/planos/${s.plan_id}`; },
      vazioHtml: vazio({ icone: 'calendar-check', titulo: 'Nenhuma preventiva executada no período' }),
      colunas: [
        { titulo: 'Executada em', valor: (s) => s.executed_at, render: (s) => `<span class="nowrap">${fmtData(s.executed_at)}</span>`, classe: 'num', primaria: true },
        { titulo: 'Equipamento', valor: (s) => s.equipment_tag, render: (s) => `<div><b>${esc(s.equipment_tag)}</b><div class="small muted">${esc(s.equipment_name)}</div></div>` },
        { titulo: 'Plano', valor: (s) => s.plan_name, render: (s) => esc(s.plan_name) },
        { titulo: 'Previsto', valor: (s) => s.due_date || '', render: vencimento, classe: 'num' },
        { titulo: 'Prazo', valor: (s) => (s.on_time ? 1 : 0), render: (s) => (s.on_time ? '<span class="badge ativo">No prazo</span>' : '<span class="badge perigo">Fora do prazo</span>') },
        { titulo: 'OS', valor: (s) => s.work_order_number || '', render: (s) => (s.work_order_id ? `<a href="#/ordens/${s.work_order_id}">${esc(s.work_order_number)}</a>` : '—') },
      ],
    });
    icones();
  };
  corpo.querySelector('#pv-per').onchange = (ev) => { dias = Number(ev.target.value); carregar(); };
  await carregar();
}
