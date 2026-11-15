// =====================================================================
// Relatórios: indicadores (disponibilidade, MTBF, MTTR, custos) com a
// conta de cada número, gráficos mensais, relatórios para baixar no
// Excel ou imprimir/PDF e o calendário de funcionamento.
// =====================================================================
import { pode } from '../store.js';
import {
  esc, icones, toast, traduzirErro, carregando, erroCarga, vazio, montarTabela, baixarCSV, confirmar,
  fmtData, fmtDataHora, fmtNum, fmtMoeda, fmtPct, hojeISO, addDias, rotuloMes, opcoes, idDaUrl,
} from '../ui.js';
import * as ind from '../services/indicadores.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { daPlanta, variasPlantas, plantaEscolhida } from '../plantas.js';
import { STATUS_OS, TIPO_OS } from '../services/ordens.js';
import { fmtDuracao, CATEGORIA, TIPO_PARADA } from '../services/paradas.js';
import { TECNICA, RESULTADO } from '../services/preditiva.js';
import { formularioModal } from './ordem-ficha.js';

const ABAS = { indicadores: 'Indicadores', relatorios: 'Relatórios', calendario: 'Calendário de funcionamento' };

// ---------- Período ----------
const PERIODOS = { mes: 'Este mês', mes_ant: 'Mês passado', d30: 'Últimos 30 dias', d90: 'Últimos 90 dias', ano: 'Este ano', ano_ant: 'Ano passado', pers: 'Escolher datas…' };
function datasDoPeriodo(k, pers = {}) {
  const h = hojeISO(); const [y, m] = h.split('-').map(Number);
  const pad = (x) => String(x).padStart(2, '0');
  if (k === 'mes') return [`${y}-${pad(m)}-01`, h];
  if (k === 'mes_ant') { const d = new Date(y, m - 2, 1); const f = new Date(y, m - 1, 0);
    return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`]; }
  if (k === 'd30') return [addDias(h, -29), h];
  if (k === 'd90') return [addDias(h, -89), h];
  if (k === 'ano') return [`${y}-01-01`, h];
  if (k === 'ano_ant') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  return [pers.ini || addDias(h, -29), pers.fim || h];
}
// limites em horário de Brasília (-03:00, sem horário de verão desde 2019)
const inicioTs = (d) => `${d}T00:00:00-03:00`;
const fimTs = (d) => `${addDias(d, 1)}T00:00:00-03:00`;

// filtro compartilhado entre as abas (fica enquanto a página está aberta)
const filtro = { per: 'mes', ini: null, fim: null, eq: '' };
let equipamentos = null;

function htmlFiltro(extra = '') {
  const [ini, fim] = datasDoPeriodo(filtro.per, filtro);
  return `<div class="card nao-imprimir"><div class="filtros filtros-rel">
    <div class="campo"><label for="f-per">Período</label><select id="f-per">
      ${Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${k === filtro.per ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="campo" ${filtro.per === 'pers' ? '' : 'hidden'}><label for="f-ini">De</label><input type="date" id="f-ini" value="${ini}" max="${hojeISO()}"></div>
    <div class="campo" ${filtro.per === 'pers' ? '' : 'hidden'}><label for="f-fim">Até</label><input type="date" id="f-fim" value="${fim}" max="${hojeISO()}"></div>
    <div class="campo"><label for="f-eq">Equipamento</label><select id="f-eq">
      ${opcoes(equipamentos, { rotulo: (e) => `${e.tag} — ${e.name}`, selecionado: filtro.eq, vazio: 'Todos os equipamentos' })}</select></div>
    ${extra}
  </div></div>`;
}
function ligarFiltro(raiz, aoMudar) {
  const per = raiz.querySelector('#f-per'); const fi = raiz.querySelector('#f-ini'); const ff = raiz.querySelector('#f-fim');
  per.onchange = () => {
    filtro.per = per.value;
    fi.parentElement.hidden = ff.parentElement.hidden = filtro.per !== 'pers';
    if (filtro.per === 'pers') { filtro.ini = fi.value; filtro.fim = ff.value; }
    aoMudar();
  };
  const datas = () => {
    if (!fi.value || !ff.value) return;
    if (ff.value < fi.value) { toast('A data final deve ser depois da inicial.', 'erro'); return; }
    filtro.ini = fi.value; filtro.fim = ff.value; aoMudar();
  };
  fi.onchange = datas; ff.onchange = datas;
  raiz.querySelector('#f-eq').onchange = (ev) => { filtro.eq = ev.target.value; aoMudar(); };
}
const textoPeriodo = () => { const [a, b] = datasDoPeriodo(filtro.per, filtro); return `${fmtData(a)} a ${fmtData(b)}`; };
const nomeEq = () => { const e = equipamentos.find((x) => x.id === filtro.eq); return e ? `${e.tag} — ${e.name}` : plantaEscolhida() ? `Todos os equipamentos da planta ${plantaEscolhida().name}` : variasPlantas() ? 'Todos os equipamentos (todas as plantas)' : 'Todos os equipamentos'; };
const arquivo = (base) => { const [a, b] = datasDoPeriodo(filtro.per, filtro); const e = equipamentos.find((x) => x.id === filtro.eq);
  const pl = plantaEscolhida(); const sufixo = e ? e.tag : pl ? (pl.code || pl.name) : '';
  return `${base}_${a}_a_${b}${sufixo ? `_${sufixo.replace(/[^A-Za-z0-9-]/g, '')}` : ''}.csv`; };

// ---------- Números ----------
const h1 = (v) => (v == null ? '—' : `${fmtNum(v, 1)} h`);
const h2 = (v) => (v == null ? '—' : `${fmtNum(v, Number(v) < 10 ? 2 : 1)} h`);
const selo = (s) => (ind.SELO[s] ? `<span class="selo-ind">${esc(ind.SELO[s])}</span>` : '');

// Imprime a tabela inteira (sem paginação) e volta ao normal
function imprimir(container, cfg) {
  const t = montarTabela(container, { ...cfg, porPagina: Math.max(cfg.linhas.length, 1), busca: false, semTotal: true });
  const voltar = () => { montarTabela(container, cfg); window.removeEventListener('afterprint', voltar); };
  window.addEventListener('afterprint', voltar);
  setTimeout(() => window.print(), 50);
  return t;
}

// ---------- Gráfico de barras por mês (SVG simples) ----------
function graficoMeses(meses, { series, fmt, max = null, titulo }) {
  const W = 640; const H = 220; const mg = { e: 58, d: 10, c: 12, b: 28 };
  const tot = meses.map((m) => series.reduce((s, x) => s + Number(m[x.chave] || 0), 0));
  const topo = max ?? Math.max(...tot, 0);
  if (!topo || meses.every((m) => series.every((x) => m[x.chave] == null))) return `<div class="muted small" style="padding:20px 0;text-align:center">Sem dados nos últimos meses.</div>`;
  const larg = (W - mg.e - mg.d) / meses.length; const bw = Math.min(34, larg * 0.62);
  const Y = (v) => H - mg.b - (v / topo) * (H - mg.c - mg.b);
  const marcas = [0, 0.5, 1].map((k) => k * topo);
  return `<svg class="grafico-hm grafico-meses" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}">
    ${marcas.map((v) => `<line x1="${mg.e}" x2="${W - mg.d}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grade-linha"/>
      <text x="${mg.e - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="eixo">${esc(fmt(v, true))}</text>`).join('')}
    ${meses.map((m, i) => {
      const x = mg.e + i * larg + (larg - bw) / 2; let acc = 0;
      const vazioMes = series.every((s) => m[s.chave] == null);
      return `<g>${series.map((s) => { const v = Number(m[s.chave] || 0); const y0 = Y(acc); acc += v; const y1 = Y(acc);
          return v ? `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, y0 - y1).toFixed(1)}" rx="2" class="${s.classe}"/>` : ''; }).join('')}
        <rect x="${(mg.e + i * larg).toFixed(1)}" y="${mg.c}" width="${larg.toFixed(1)}" height="${H - mg.c - mg.b}" fill="transparent">
          <title>${esc(rotuloMes(m.month.slice(0, 7)))}: ${vazioMes ? 'sem dados' : series.map((s) => `${s.nome} ${fmt(m[s.chave])}`).join(' · ')}</title></rect>
        <text x="${(x + bw / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle" class="eixo">${esc(rotuloMes(m.month.slice(0, 7)))}</text></g>`;
    }).join('')}
  </svg>
  ${series.length > 1 ? `<div class="legenda-graf">${series.map((s) => `<span><i class="${s.classe}"></i>${esc(s.nome)}</span>`).join('')}</div>` : ''}`;
}

// =====================================================================
// Aba: Indicadores
// =====================================================================
async function abaIndicadores(corpo) {
  const custos = pode('costs.read');
  corpo.innerHTML = `${htmlFiltro()}
    <div class="so-impressao"><h2>Indicadores de manutenção</h2><p>${esc(textoPeriodo())} · ${esc(nomeEq())}</p></div>
    <div id="res-ind" class="secao"></div>`;
  ligarFiltro(corpo, () => carregar());
  const res = corpo.querySelector('#res-ind');

  async function carregar() {
    res.innerHTML = carregando('Calculando indicadores…');
    corpo.querySelector('.so-impressao p').textContent = `${textoPeriodo()} · ${nomeEq()}`;
    const [ini, fim] = datasDoPeriodo(filtro.per, filtro);
    let linhas;
    try { linhas = await ind.porEquipamento(ini, fim, filtro.eq || null); } catch (err) { res.innerHTML = erroCarga(err); return; }
    const t = ind.somar(linhas);
    const um = !!filtro.eq; const l0 = linhas[0];
    const tile = (rot, icone, valor, det, extra = '', cl = '') => `<div class="card kpi ${cl}"><span class="rotulo"><i data-lucide="${icone}"></i> ${esc(rot)}</span>
      <span class="valor">${valor}</span><span class="detalhe">${det}</span>${extra}</div>`;

    const disp = t.disponibilidade == null
      ? tile('Disponibilidade', 'gauge', '—', t.semCalendario ? 'Cadastre o horário de funcionamento na aba “Calendário de funcionamento”.' : 'Sem horário programado no período.')
      : tile('Disponibilidade', 'gauge', fmtPct(t.disponibilidade), `(${h1(t.horasProgramadas)} programadas − ${h1(t.horasParadas)} paradas) ÷ ${h1(t.horasProgramadas)}`,
        !um && t.comCalendario < t.equipamentos ? `<span class="detalhe aviso-txt">${t.comCalendario} de ${t.equipamentos} equipamentos com horário no período</span>` : '', 'destaque');
    const mtbf = t.mtbf != null
      ? tile('MTBF', 'timer', h1(t.mtbf), `${h1(t.horasOperadas)} operadas (horímetro) ÷ ${fmtNum(t.falhas - t.falhasSemHorimetro)} falha${t.falhas - t.falhasSemHorimetro === 1 ? '' : 's'}`,
        `${t.mtbfParcial ? '<span class="detalhe aviso-txt">parcial: faltam leituras no início ou no fim do período</span>' : ''}${t.falhasSemHorimetro ? `<span class="detalhe">${t.falhasSemHorimetro} falha(s) em equipamento sem horímetro não entram</span>` : ''}`)
      : tile('MTBF', 'timer', '—', um && l0 ? esc(ind.SELO[l0.mtbf_seal] || '') : t.falhas ? 'Faltam leituras de horímetro nos equipamentos com falha.' : 'Sem falhas no período.');
    const mttr = t.mttr != null
      ? tile('MTTR', 'wrench', h2(t.mttr), `${h2(t.horasReparo)} de reparo ÷ ${t.reparos} reparo${t.reparos === 1 ? '' : 's'}`,
        t.mttrParcial ? '<span class="detalhe aviso-txt">parcial: há parada sem fases; contou o tempo todo da parada</span>' : '')
      : tile('MTTR', 'wrench', '—', 'Sem paradas por falha encerradas no período.');
    const falhas = tile('Falhas', 'octagon-alert', fmtNum(t.falhas), 'OS corretivas marcadas como falha (canceladas não contam)');
    const taxa = tile('Corretivas', 'clipboard-list', fmtPct(t.taxaCorretiva), t.osConcluidas ? `${t.corretivas} corretiva${t.corretivas === 1 ? '' : 's'} ÷ ${t.osConcluidas} OS concluída${t.osConcluidas === 1 ? '' : 's'}` : 'Nenhuma OS concluída no período.');
    const custo = t.custos ? `<a class="card kpi" href="#/relatorios?aba=relatorios&rel=custos"><span class="rotulo"><i data-lucide="wallet"></i> Custo de manutenção</span>
      <span class="valor">${fmtMoeda(t.custos.total)}</span>
      <span class="detalhe">mão de obra ${fmtMoeda(t.custos.maoDeObra)} · peças ${fmtMoeda(t.custos.pecas)} · serviços ${fmtMoeda(t.custos.servicos)}</span>
      ${t.custos.total ? `<span class="detalhe">${fmtPct((100 * t.custos.corretiva) / t.custos.total, 0)} em corretivas</span>` : ''}</a>` : '';

    res.innerHTML = `
      <div class="grade-ind">${disp}${mtbf}${mttr}${falhas}${taxa}${custo}</div>
      <details class="card secao como-calcula"><summary><i data-lucide="calculator"></i> Como cada número é calculado</summary><div class="card-corpo small">
        <p><b>Disponibilidade</b> = (horas programadas − horas paradas dentro do horário programado) ÷ horas programadas. As horas programadas vêm do calendário de funcionamento (com feriados e paradas programadas). Parada em aberto conta até agora.</p>
        <p><b>MTBF</b> (tempo médio entre falhas) = horas operadas ÷ número de falhas. As horas operadas são a diferença entre a primeira e a última leitura do horímetro dentro do período. Preventiva nunca conta como falha.</p>
        <p><b>MTTR</b> (tempo médio de reparo) = horas de reparo ÷ número de reparos, das paradas por falha encerradas no período. Usa só as fases “reparo” (espera por peça ou equipe fica de fora); se a parada não tem fases, conta o tempo todo e o número fica marcado como parcial.</p>
        <p><b>Corretivas</b> = OS corretivas concluídas ÷ todas as OS concluídas no período.</p>
        ${custos ? '<p><b>Custo</b> = mão de obra (pela data do lançamento) + peças (pela data da troca) + serviços externos (pela data do serviço). Itens removidos não contam.</p>' : ''}
      </div></details>
      <div class="grade grade-2 secao" id="graf-ind"><div class="card"><div class="card-corpo">${carregando('Montando gráficos…')}</div></div></div>
      ${um ? '' : `<div class="cabecalho-secao secao"><h3><i data-lucide="factory"></i> Por equipamento</h3>
        <div class="acoes nao-imprimir"><button class="btn btn-sm" id="b-csv"><i data-lucide="file-spreadsheet"></i> Baixar Excel</button>
        <button class="btn btn-sm" id="b-imp"><i data-lucide="printer"></i> Imprimir / PDF</button></div></div>
        <p class="muted small nao-imprimir">Do equipamento que mais ficou parado para o que menos ficou. Clique para abrir o equipamento.</p>
        <div class="card" id="tab-ind"></div>`}`;

    if (!um) {
      const ordenadas = [...linhas].sort((a, b) => Number(b.downtime_hours) - Number(a.downtime_hours) || Number(b.failures) - Number(a.failures) || a.tag.localeCompare(b.tag));
      const colunas = [
        { titulo: 'Equipamento', valor: (l) => l.tag, primaria: true, render: (l) => `<div><b>${esc(l.tag)}</b><div class="small muted">${esc(l.name)}</div></div>`, csv: (l) => `${l.tag} — ${l.name}` },
        { titulo: 'Disponibilidade', valor: (l) => (l.availability == null ? null : Number(l.availability)), classe: 'num',
          render: (l) => (l.availability == null ? `<span class="muted">—</span>${selo(l.availability_seal)}` : `<b>${fmtPct(Number(l.availability))}</b>`),
          csv: (l) => (l.availability == null ? ind.SELO[l.availability_seal] : fmtNum(l.availability, 1)) },
        { titulo: 'Horas paradas', valor: (l) => Number(l.downtime_hours), classe: 'num', render: (l) => h1(Number(l.downtime_hours)), csv: (l) => fmtNum(l.downtime_hours, 1) },
        { titulo: 'Falhas', valor: (l) => l.failures, classe: 'num', render: (l) => fmtNum(l.failures), csv: (l) => l.failures },
        { titulo: 'MTBF', valor: (l) => (l.mtbf == null ? null : Number(l.mtbf)), classe: 'num',
          render: (l) => (l.mtbf == null ? `<span class="muted">—</span>${selo(l.mtbf_seal)}` : `${h1(Number(l.mtbf))}${selo(l.mtbf_seal)}`),
          csv: (l) => (l.mtbf == null ? ind.SELO[l.mtbf_seal] : fmtNum(l.mtbf, 1) + (l.mtbf_seal === 'parcial' ? ' (parcial)' : '')) },
        { titulo: 'MTTR', valor: (l) => (l.mttr == null ? null : Number(l.mttr)), classe: 'num',
          render: (l) => (l.mttr == null ? '<span class="muted">—</span>' : `${h2(Number(l.mttr))}${selo(l.mttr_seal)}`),
          csv: (l) => (l.mttr == null ? '' : fmtNum(l.mttr, 2) + (l.mttr_seal === 'parcial' ? ' (parcial)' : '')) },
        { titulo: 'OS concluídas', valor: (l) => l.wo_finished, classe: 'num',
          render: (l) => `${fmtNum(l.wo_finished)}${l.wo_finished ? `<div class="small muted">${fmtPct(Number(l.corrective_rate), 0)} corretivas</div>` : ''}`,
          csv: (l) => l.wo_finished },
        ...(custos ? [{ titulo: 'Custo', valor: (l) => Number(l.cost_total), classe: 'num', render: (l) => fmtMoeda(l.cost_total), csv: (l) => fmtNum(l.cost_total, 2) }] : []),
      ];
      const cfg = { linhas: ordenadas, colunas, porPagina: 60, busca: true, aoClicar: (id) => { location.hash = `#/equipamentos/${id}`; },
        idLinha: (l) => l.equipment_id, vazioHtml: vazio({ icone: 'factory', titulo: 'Nenhum equipamento' }) };
      montarTabela(res.querySelector('#tab-ind'), cfg);
      const csvCols = [...colunas.slice(0, 2), { titulo: 'Horas programadas', csv: (l) => fmtNum(l.scheduled_hours, 1) }, ...colunas.slice(2, 4),
        { titulo: 'Horas operadas (horímetro)', csv: (l) => (l.operated_hours == null ? '' : fmtNum(l.operated_hours, 1)) }, ...colunas.slice(4, 6),
        { titulo: 'Reparos', csv: (l) => l.repairs }, colunas[6], { titulo: 'Corretivas concluídas', csv: (l) => l.wo_corrective_finished },
        { titulo: 'Preventivas concluídas', csv: (l) => l.wo_preventive_finished }, { titulo: 'OS abertas no período', csv: (l) => l.wo_opened },
        ...(custos ? [{ titulo: 'Mão de obra (R$)', csv: (l) => fmtNum(l.cost_labor, 2) }, { titulo: 'Peças (R$)', csv: (l) => fmtNum(l.cost_parts, 2) },
          { titulo: 'Serviços externos (R$)', csv: (l) => fmtNum(l.cost_external, 2) }, colunas[7]] : [])];
      res.querySelector('#b-csv').onclick = () => baixarCSV(arquivo('indicadores'), csvCols, ordenadas);
      res.querySelector('#b-imp').onclick = () => imprimir(res.querySelector('#tab-ind'), cfg);
    }
    icones();

    // Gráficos: últimos 12 meses (independem do período escolhido)
    const graf = res.querySelector('#graf-ind');
    try {
      const ms = await ind.mensais(12, filtro.eq || null);
      const pct = (v, eixo) => (v == null ? '—' : eixo ? `${fmtNum(v, 0)}%` : fmtPct(Number(v)));
      const horas = (v, eixo) => (v == null ? '—' : `${fmtNum(v, eixo ? 0 : 1)} h`);
      const brl = (v, eixo) => (v == null ? '—' : eixo ? `R$ ${fmtNum(v >= 1000 ? v / 1000 : v, 0)}${v >= 1000 ? ' mil' : ''}` : fmtMoeda(v));
      const card = (titulo, icone, html, nota = '') => `<div class="card"><div class="card-titulo"><h3><i data-lucide="${icone}"></i> ${esc(titulo)}</h3></div>
        <div class="card-corpo">${html}${nota ? `<p class="small muted" style="margin:6px 0 0">${nota}</p>` : ''}</div></div>`;
      graf.innerHTML = [
        card('Disponibilidade por mês', 'gauge', graficoMeses(ms, { series: [{ chave: 'availability', nome: 'Disponibilidade', classe: 'b-verde' }], fmt: pct, max: 100, titulo: 'Disponibilidade por mês' }),
          ms.some((m) => m.availability != null) ? '' : 'Aparece depois de cadastrar o horário de funcionamento.'),
        card('Horas paradas por mês', 'octagon-pause', graficoMeses(ms, { series: [{ chave: 'downtime_hours', nome: 'Paradas', classe: 'b-vermelho' }], fmt: horas, titulo: 'Horas paradas por mês' }),
          'Só as horas dentro do horário programado.'),
        card('Falhas por mês', 'octagon-alert', graficoMeses(ms, { series: [{ chave: 'failures', nome: 'Falhas', classe: 'b-laranja' }], fmt: (v) => fmtNum(v), titulo: 'Falhas por mês' })),
        custos ? card('Custo por mês', 'wallet', graficoMeses(ms, { series: [
          { chave: 'cost_labor', nome: 'Mão de obra', classe: 'b-azul' }, { chave: 'cost_parts', nome: 'Peças', classe: 'b-verde' },
          { chave: 'cost_external', nome: 'Serviços externos', classe: 'b-laranja' }], fmt: brl, titulo: 'Custo por mês' }))
          : card('MTTR por mês', 'wrench', graficoMeses(ms, { series: [{ chave: 'mttr', nome: 'MTTR', classe: 'b-azul' }], fmt: horas, titulo: 'MTTR por mês' })),
      ].join('');
    } catch (err) { graf.innerHTML = `<div class="card"><div class="card-corpo">${erroCarga(err)}</div></div>`; }
    icones();
  }
  await carregar();
}

// =====================================================================
// Aba: Relatórios (tabelas para baixar ou imprimir)
// =====================================================================
const eqCol = { titulo: 'Equipamento', valor: (l) => l.equipment_tag, render: (l) => `<div><b>${esc(l.equipment_tag)}</b><div class="small muted">${esc(l.equipment_name || '')}</div></div>`, csv: (l) => `${l.equipment_tag} — ${l.equipment_name || ''}` };
const dh = (campo, titulo) => ({ titulo, valor: (l) => l[campo] || '', classe: 'num', render: (l) => `<span class="nowrap">${fmtDataHora(l[campo])}</span>`, csv: (l) => (l[campo] ? fmtDataHora(l[campo]) : '') });

const RELATORIOS = {
  ordens: {
    nome: 'Ordens de serviço abertas no período', icone: 'clipboard-list',
    carregar: ind.ordensDoPeriodo, link: (l) => `#/ordens/${l.id}`,
    colunas: () => [
      { titulo: 'OS', valor: (l) => l.number, primaria: true, render: (l) => `<b class="nowrap">${esc(l.number)}</b>`, csv: (l) => l.number },
      dh('created_at', 'Aberta em'), eqCol,
      { titulo: 'Tipo', valor: (l) => l.type, render: (l) => esc(TIPO_OS[l.type] || l.type) + (l.is_failure ? '<div class="small muted">falha</div>' : ''), csv: (l) => `${TIPO_OS[l.type] || l.type}${l.is_failure ? ' (falha)' : ''}` },
      { titulo: 'Título', valor: (l) => l.title, render: (l) => esc(l.title), csv: (l) => l.title },
      { titulo: 'Situação', valor: (l) => l.status, render: (l) => `<span class="badge ${STATUS_OS[l.status]?.classe || ''}">${esc(STATUS_OS[l.status]?.nome || l.status)}</span>`, csv: (l) => STATUS_OS[l.status]?.nome || l.status },
      dh('finished_at', 'Concluída em'),
      { titulo: 'Responsável', valor: (l) => l.assigned_to_name || '', render: (l) => esc(l.assigned_to_name || '—'), csv: (l) => l.assigned_to_name || '' },
      { titulo: 'Horas de MO', valor: (l) => Number(l.labor_hours), classe: 'num', render: (l) => h1(Number(l.labor_hours)), csv: (l) => fmtNum(l.labor_hours, 2) },
    ],
  },
  paradas: {
    nome: 'Paradas no período', icone: 'octagon-pause',
    carregar: ind.paradasDoPeriodo, link: (l) => `#/paradas/${l.id}`,
    colunas: () => [
      dh('started_at', 'Início'), eqCol,
      { titulo: 'Fim', valor: (l) => l.ended_at || '9', classe: 'num', render: (l) => (l.ended_at ? `<span class="nowrap">${fmtDataHora(l.ended_at)}</span>` : '<span class="badge perigo">em aberto</span>'), csv: (l) => (l.ended_at ? fmtDataHora(l.ended_at) : 'em aberto') },
      { titulo: 'Duração', valor: (l) => Number(l.duration_hours), classe: 'num', render: (l) => fmtDuracao(Number(l.duration_hours)), csv: (l) => fmtNum(l.duration_hours, 2) },
      { titulo: 'Motivo', valor: (l) => l.reason_name, render: (l) => `${esc(l.reason_name)}<div class="small muted">${esc(CATEGORIA[l.reason_category] || '')} · ${esc(TIPO_PARADA[l.type] || '')}</div>`, csv: (l) => l.reason_name },
      { titulo: 'Categoria', valor: (l) => l.reason_category, render: (l) => esc(CATEGORIA[l.reason_category] || ''), csv: (l) => CATEGORIA[l.reason_category] || '' },
      { titulo: 'Reparo', valor: (l) => Number(l.repair_hours), classe: 'num', render: (l) => (l.phases_count ? fmtDuracao(Number(l.repair_hours)) : '<span class="muted">sem fases</span>'), csv: (l) => (l.phases_count ? fmtNum(l.repair_hours, 2) : '') },
      { titulo: 'Espera', valor: (l) => Number(l.waiting_hours), classe: 'num', render: (l) => (l.phases_count ? fmtDuracao(Number(l.waiting_hours)) : '—'), csv: (l) => (l.phases_count ? fmtNum(l.waiting_hours, 2) : '') },
      { titulo: 'OS', valor: (l) => l.work_order_number || '', render: (l) => esc(l.work_order_number || '—'), csv: (l) => l.work_order_number || '' },
    ],
  },
  pecas: {
    nome: 'Peças trocadas no período', icone: 'cog',
    carregar: ind.pecasTrocadas, link: (l) => `#/ordens/${l.work_order_id}?aba=pecas`,
    colunas: (custos) => [
      dh('replaced_at', 'Trocada em'), eqCol,
      { titulo: 'Peça', valor: (l) => l.part_name, primaria: true, render: (l) => `<b>${esc(l.part_name)}</b>`, csv: (l) => l.part_name },
      { titulo: 'Código', valor: (l) => l.part_code || '', render: (l) => esc(l.part_code || '—'), csv: (l) => l.part_code || '' },
      { titulo: 'Quantidade', valor: (l) => Number(l.quantity), classe: 'num', render: (l) => `${fmtNum(l.quantity, Number(l.quantity) % 1 ? 2 : 0)} ${esc(l.unit)}`, csv: (l) => `${fmtNum(l.quantity, Number(l.quantity) % 1 ? 3 : 0)} ${l.unit}` },
      { titulo: 'Motivo', valor: (l) => l.reason || '', render: (l) => esc(l.reason || '—'), csv: (l) => l.reason || '' },
      { titulo: 'OS', valor: (l) => l.work_order_number, render: (l) => `<span class="nowrap">${esc(l.work_order_number)}</span>`, csv: (l) => l.work_order_number },
      ...(custos ? [{ titulo: 'Custo', valor: (l) => Number(l.total_cost ?? -1), classe: 'num', render: (l) => (l.total_cost == null ? '<span class="muted">sem custo</span>' : fmtMoeda(l.total_cost)), csv: (l) => (l.total_cost == null ? '' : fmtNum(l.total_cost, 2)) }] : []),
    ],
  },
  custos: {
    nome: 'Custos por equipamento', icone: 'wallet', perm: 'costs.read',
    carregar: null, link: (l) => `#/equipamentos/${l.equipment_id}`,
    colunas: () => [
      { titulo: 'Equipamento', valor: (l) => l.tag, primaria: true, render: (l) => `<div><b>${esc(l.tag)}</b><div class="small muted">${esc(l.name)}</div></div>`, csv: (l) => `${l.tag} — ${l.name}` },
      { titulo: 'Mão de obra', valor: (l) => Number(l.cost_labor), classe: 'num', render: (l) => fmtMoeda(l.cost_labor), csv: (l) => fmtNum(l.cost_labor, 2) },
      { titulo: 'Peças', valor: (l) => Number(l.cost_parts), classe: 'num', render: (l) => fmtMoeda(l.cost_parts), csv: (l) => fmtNum(l.cost_parts, 2) },
      { titulo: 'Serviços externos', valor: (l) => Number(l.cost_external), classe: 'num', render: (l) => fmtMoeda(l.cost_external), csv: (l) => fmtNum(l.cost_external, 2) },
      { titulo: 'Total', valor: (l) => Number(l.cost_total), classe: 'num', render: (l) => `<b>${fmtMoeda(l.cost_total)}</b>`, csv: (l) => fmtNum(l.cost_total, 2) },
      { titulo: 'Em corretivas', valor: (l) => Number(l.cost_corrective), classe: 'num', render: (l) => fmtMoeda(l.cost_corrective), csv: (l) => fmtNum(l.cost_corrective, 2) },
    ],
  },
  preventivas: {
    nome: 'Preventivas executadas no período', icone: 'calendar-check',
    carregar: ind.preventivasDoPeriodo, link: (l) => `#/preventiva/planos/${l.plan_id}`,
    colunas: () => [
      dh('executed_at', 'Executada em'), eqCol,
      { titulo: 'Plano', valor: (l) => l.plan_name, primaria: true, render: (l) => esc(l.plan_name), csv: (l) => l.plan_name },
      { titulo: 'Previsto para', valor: (l) => l.due_date || '', classe: 'num', render: (l) => (l.due_date ? fmtData(l.due_date) : l.due_hour_meter ? `${fmtNum(l.due_hour_meter)} h` : '—'), csv: (l) => (l.due_date ? fmtData(l.due_date) : l.due_hour_meter ? `${fmtNum(l.due_hour_meter)} h` : '') },
      { titulo: 'Prazo', valor: (l) => (l.on_time ? 1 : 0), render: (l) => (l.on_time ? '<span class="badge ativo">No prazo</span>' : '<span class="badge perigo">Fora do prazo</span>'), csv: (l) => (l.on_time ? 'No prazo' : 'Fora do prazo') },
      { titulo: 'OS', valor: (l) => l.work_order_number || '', render: (l) => esc(l.work_order_number || '—'), csv: (l) => l.work_order_number || '' },
    ],
  },
  inspecoes: {
    nome: 'Inspeções preditivas no período', icone: 'activity',
    carregar: ind.inspecoesDoPeriodo, link: (l) => `#/preditiva/inspecoes/${l.id}`,
    colunas: () => [
      dh('performed_at', 'Data'), eqCol,
      { titulo: 'Técnica', valor: (l) => l.type, render: (l) => esc(TECNICA[l.type]?.nome || l.type), csv: (l) => TECNICA[l.type]?.nome || l.type },
      { titulo: 'Resultado', valor: (l) => (l.voided_at ? 'anulada' : l.result), render: (l) => (l.voided_at ? '<span class="badge inativo">anulada</span>' : `<span class="badge ${RESULTADO[l.result]?.classe || ''}">${esc(RESULTADO[l.result]?.nome || l.result)}</span>`), csv: (l) => (l.voided_at ? 'Anulada' : RESULTADO[l.result]?.nome || l.result) },
      { titulo: 'Fora do limite', valor: (l) => Number(l.out_of_limit_count), classe: 'num', render: (l) => `${fmtNum(l.out_of_limit_count)} de ${fmtNum(l.measurements_count)}`, csv: (l) => `${l.out_of_limit_count} de ${l.measurements_count}` },
      { titulo: 'Quem fez', valor: (l) => l.performed_by_name || '', render: (l) => esc(l.performed_by_name || '—'), csv: (l) => l.performed_by_name || '' },
      { titulo: 'OS', valor: (l) => l.work_order_number || '', render: (l) => esc(l.work_order_number || '—'), csv: (l) => l.work_order_number || '' },
    ],
  },
};

async function abaRelatorios(corpo) {
  const custos = pode('costs.read');
  const disp = Object.entries(RELATORIOS).filter(([, r]) => !r.perm || pode(r.perm));
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let rel = disp.some(([k]) => k === params.get('rel')) ? params.get('rel') : 'ordens';
  corpo.innerHTML = `${htmlFiltro(`<div class="campo"><label for="f-rel">Relatório</label><select id="f-rel">
      ${disp.map(([k, r]) => `<option value="${k}" ${k === rel ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></div>`)}
    <div class="so-impressao"><h2></h2><p></p></div>
    <div class="cabecalho-secao secao nao-imprimir"><h3 id="rel-tit"></h3>
      <div class="acoes"><button class="btn btn-sm" id="b-csv"><i data-lucide="file-spreadsheet"></i> Baixar Excel</button>
      <button class="btn btn-sm" id="b-imp"><i data-lucide="printer"></i> Imprimir / PDF</button></div></div>
    <div class="card" id="tab-rel"></div>`;
  const tab = corpo.querySelector('#tab-rel');
  let cfg = null; let linhas = [];

  async function carregar() {
    const r = RELATORIOS[rel];
    history.replaceState(null, '', `${location.pathname}${location.search}#/relatorios?aba=relatorios&rel=${rel}`);
    corpo.querySelector('#rel-tit').innerHTML = `<i data-lucide="${r.icone}"></i> ${esc(r.nome)}`;
    corpo.querySelector('.so-impressao h2').textContent = r.nome;
    corpo.querySelector('.so-impressao p').textContent = `${textoPeriodo()} · ${nomeEq()}`;
    tab.innerHTML = carregando(); icones();
    const [ini, fim] = datasDoPeriodo(filtro.per, filtro);
    try {
      if (rel === 'custos') {
        linhas = (await ind.porEquipamento(ini, fim, filtro.eq || null)).filter((l) => Number(l.cost_total) > 0)
          .sort((a, b) => Number(b.cost_total) - Number(a.cost_total));
      } else {
        linhas = (await r.carregar(inicioTs(ini), fimTs(fim))).filter((l) => !filtro.eq || l.equipment_id === filtro.eq);
      }
    } catch (err) { tab.innerHTML = erroCarga(err); return; }
    const colunas = r.colunas(custos);
    cfg = { linhas, colunas, porPagina: 50, busca: true, idLinha: (l) => l.id || l.equipment_id,
      aoClicar: (id) => { const l = linhas.find((x) => (x.id || x.equipment_id) === id); if (l) location.hash = r.link(l); },
      vazioHtml: vazio({ icone: r.icone, titulo: 'Nada neste período', texto: 'Escolha outro período ou equipamento.' }) };
    montarTabela(tab, cfg);
    corpo.querySelector('#b-csv').onclick = () => (linhas.length ? baixarCSV(arquivo(rel), colunas, linhas) : toast('Não há linhas para baixar.', 'erro'));
    corpo.querySelector('#b-imp').onclick = () => imprimir(tab, cfg);
    icones();
  }
  ligarFiltro(corpo, carregar);
  corpo.querySelector('#f-rel').onchange = (ev) => { rel = ev.target.value; carregar(); };
  await carregar();
}

// =====================================================================
// Aba: Calendário de funcionamento
// =====================================================================
async function abaCalendario(corpo) {
  const edita = pode('equipment.write');
  const desde = addDias(hojeISO(), -60);
  const [hs, exs] = await Promise.all([ind.horarios(), ind.excecoes(desde)]);
  const eqMap = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
  const recarregar = () => abaCalendario(corpo).then(icones).catch((err) => { corpo.innerHTML = erroCarga(err); });
  const hoje = hojeISO();
  const vigente = (h) => !h.valid_to || h.valid_to >= hoje;

  // Agrupa: usina (padrão) e cada equipamento com horário próprio
  const grupos = new Map([['', hs.filter((h) => !h.equipment_id)]]);
  hs.filter((h) => h.equipment_id).forEach((h) => { if (!grupos.has(h.equipment_id)) grupos.set(h.equipment_id, []); grupos.get(h.equipment_id).push(h); });
  const semana = (lista) => {
    const total = ind.DIAS_SEMANA.reduce((s, _, d) => s + lista.filter((h) => h.weekday === d && vigente(h)).reduce((a, h) => a + ind.horasFaixa(h.start_time, h.end_time), 0), 0);
    return `<div class="semana-cal">${ind.DIAS_SEMANA.map((nome, d) => {
      const doDia = lista.filter((h) => h.weekday === d);
      return `<div class="dia-cal"><b>${nome}</b>${doDia.length ? doDia.map((h) => `<span class="faixa-cal ${vigente(h) ? '' : 'antiga'}">${esc(ind.faixa(h.start_time, h.end_time))}
          ${h.valid_from > '2000-01-01' || h.valid_to ? `<small class="muted">${h.valid_from > '2000-01-01' ? `desde ${fmtData(h.valid_from)}` : ''}${h.valid_to ? ` até ${fmtData(h.valid_to)}` : ''}</small>` : ''}
          ${edita ? `<button class="btn btn-icone btn-texto btn-xs" data-apagar-h="${h.id}" title="Apagar este horário" aria-label="Apagar este horário"><i data-lucide="x"></i></button>` : ''}</span>`).join('')
        : '<span class="muted small">sem operação</span>'}</div>`;
    }).join('')}</div><p class="small muted" style="margin:8px 0 0">Total na semana: <b>${fmtNum(total, 1)} h</b> programadas.</p>`;
  };
  const padrao = grupos.get('');
  const proprios = [...grupos.entries()].filter(([k]) => k);

  corpo.innerHTML = `
    <div class="alerta info"><i data-lucide="info"></i><div>
      O calendário diz <b>quando cada equipamento deveria estar funcionando</b>. É a base da disponibilidade: parada fora desse horário não conta.
      Os equipamentos usam o horário da usina, a não ser que tenham um horário próprio. Feriados, paradas programadas e turnos especiais entram em “Exceções”.</div></div>
    ${edita ? `<div class="acoes secao">
      <button class="btn btn-primario" id="b-novo-h"><i data-lucide="plus"></i> Adicionar horário</button>
      <button class="btn" id="b-nova-ex"><i data-lucide="calendar-x"></i> Adicionar exceção</button>
      ${padrao.length ? '' : '<button class="btn" id="b-24h"><i data-lucide="clock"></i> Usina funciona 24 h, todos os dias</button>'}</div>` : ''}
    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="factory"></i> Horário da usina (padrão)</h3></div>
      <div class="card-corpo">${padrao.length ? semana(padrao) : vazio({ icone: 'clock', titulo: 'Horário da usina ainda não cadastrado',
        texto: 'Enquanto não houver horário, a disponibilidade aparece como “sem calendário”.' })}</div></div>
    ${proprios.map(([eqId, lista]) => `<div class="card secao"><div class="card-titulo"><h3><i data-lucide="cog"></i>
        ${eqMap[eqId] ? `<a href="#/equipamentos/${eqId}">${esc(eqMap[eqId].tag)}</a> — ${esc(eqMap[eqId].name)}` : 'Equipamento'}</h3>
        <span class="small muted">horário próprio (não usa o da usina)</span></div><div class="card-corpo">${semana(lista)}</div></div>`).join('')}
    <h3 class="secao"><i data-lucide="calendar-x" style="width:18px;height:18px;vertical-align:-3px"></i> Exceções (a partir de ${fmtData(desde)})</h3>
    <div class="card" id="tab-ex"></div>`;

  montarTabela(corpo.querySelector('#tab-ex'), {
    linhas: exs, busca: false, porPagina: 50,
    vazioHtml: vazio({ icone: 'calendar-x', titulo: 'Nenhuma exceção', texto: 'Cadastre feriados, paradas programadas da usina e turnos especiais.' }),
    colunas: [
      { titulo: 'Data', valor: (x) => x.date, classe: 'num', primaria: true, render: (x) => `<b class="nowrap">${fmtData(x.date)}</b><div class="small muted">${ind.DIAS_SEMANA[new Date(`${x.date}T12:00:00`).getDay()]}</div>` },
      { titulo: 'Vale para', valor: (x) => (x.equipment_id ? eqMap[x.equipment_id]?.tag || '' : ''), render: (x) => (x.equipment_id ? `<b>${esc(eqMap[x.equipment_id]?.tag || '—')}</b>` : 'Usina toda') },
      { titulo: 'Horário', valor: (x) => x.start_time || '', render: (x) => (x.start_time ? esc(ind.faixa(x.start_time, x.end_time)) : '<span class="badge inativo">sem operação</span>') },
      { titulo: 'Motivo', valor: (x) => x.reason, render: (x) => esc(x.reason) },
      ...(edita ? [{ titulo: '', valor: () => '', render: (x) => `<button class="btn btn-sm btn-texto" data-apagar-ex="${x.id}"><i data-lucide="trash-2"></i> Apagar</button>` }] : []),
    ],
  });

  if (!edita) return;
  const ativos = equipamentos.filter((e) => e.status !== 'desativado');
  const selEq = (nome) => `<select id="m-eq" name="${nome}"><option value="">Usina toda (padrão)</option>${opcoes(ativos, { rotulo: (e) => `${e.tag} — ${e.name}`, vazio: null })}</select>`;

  corpo.querySelector('#b-24h')?.addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Usina 24 h', mensagem: 'Cadastrar o horário da usina como <b>24 horas, de domingo a sábado</b>? Depois você pode lançar feriados e paradas programadas como exceções.', botao: 'Cadastrar' })) return;
    try { await ind.criarHorarios([0, 1, 2, 3, 4, 5, 6].map((d) => ({ equipment_id: null, weekday: d, start_time: '00:00', end_time: '00:00' }))); toast('Horário da usina cadastrado.'); recarregar(); }
    catch (err) { toast(traduzirErro(err), 'erro'); }
  });

  corpo.querySelector('#b-novo-h').addEventListener('click', () => formularioModal({
    titulo: 'Adicionar horário de funcionamento',
    campos: `
      <div class="campo"><label for="m-eq">Vale para</label>${selEq('eq')}
        <span class="ajuda">Escolha um equipamento só se ele funciona num horário diferente do resto da usina.</span></div>
      <fieldset class="campo"><legend>Dias da semana *</legend><div class="chips">
        ${ind.DIAS_SEMANA.map((n, d) => `<label class="chip"><input type="checkbox" name="dia" value="${d}" checked> ${n}</label>`).join('')}</div></fieldset>
      <div class="grade grade-2" style="gap:12px">
        <div class="campo"><label for="m-ini">Início *</label><input id="m-ini" name="ini" type="time" required value="06:00"></div>
        <div class="campo"><label for="m-fim">Fim *</label><input id="m-fim" name="fim" type="time" required value="22:00"></div></div>
      <span class="ajuda">Turno que vira o dia: use fim menor que o início (ex.: 22:00 às 06:00). Para 24 horas, use 00:00 às 00:00. Vários turnos no mesmo dia: adicione um de cada vez.</span>
      <div class="campo"><label for="m-desde">Vale a partir de</label><input id="m-desde" name="desde" type="date">
        <span class="ajuda">Deixe em branco para valer para todo o histórico.</span></div>`,
    botao: 'Adicionar',
    enviar: async (f) => {
      const dias = [...f.querySelectorAll('[name=dia]:checked')].map((x) => Number(x.value));
      if (!dias.length) throw new Error('Marque pelo menos um dia da semana.');
      await ind.criarHorarios(dias.map((d) => ({ equipment_id: f.eq.value || null, weekday: d, start_time: f.ini.value, end_time: f.fim.value, ...(f.desde.value ? { valid_from: f.desde.value } : {}) })));
    },
    sucesso: 'Horário adicionado.', depois: recarregar,
  }));

  corpo.querySelector('#b-nova-ex').addEventListener('click', () => {
    const { el } = formularioModal({
      titulo: 'Adicionar exceção',
      campos: `
        <div class="campo"><label for="m-data">Data *</label><input id="m-data" name="data" type="date" required value="${hoje}"></div>
        <div class="campo"><label for="m-eq">Vale para</label>${selEq('eq')}</div>
        <fieldset class="campo"><legend>Nesse dia *</legend>
          <label class="opcao"><input type="radio" name="tipo" value="fechado" checked> Não funciona (feriado, parada programada)</label>
          <label class="opcao"><input type="radio" name="tipo" value="especial"> Funciona em horário especial</label></fieldset>
        <div class="grade grade-2" style="gap:12px" id="m-horas" hidden>
          <div class="campo"><label for="m-ini">Início</label><input id="m-ini" name="ini" type="time" value="06:00"></div>
          <div class="campo"><label for="m-fim">Fim</label><input id="m-fim" name="fim" type="time" value="14:00"></div></div>
        <div class="campo"><label for="m-mot">Motivo *</label><input id="m-mot" name="motivo" required minlength="3" maxlength="160" placeholder="Ex.: Feriado de Natal, parada geral anual"></div>
        <span class="ajuda">A exceção substitui o horário normal só nesse dia. A exceção de um equipamento vale mais que a da usina.</span>`,
      botao: 'Adicionar',
      enviar: async (f) => {
        const esp = f.tipo.value === 'especial';
        await ind.criarExcecao({ date: f.data.value, equipment_id: f.eq.value || null, reason: f.motivo.value.trim(),
          start_time: esp ? f.ini.value : null, end_time: esp ? f.fim.value : null });
      },
      sucesso: 'Exceção adicionada.', depois: recarregar,
    });
    el.querySelectorAll('[name=tipo]').forEach((r) => r.addEventListener('change', () => { el.querySelector('#m-horas').hidden = el.querySelector('[name=tipo]:checked').value !== 'especial'; }));
  });

  corpo.onclick = async (ev) => {
    const bh = ev.target.closest('[data-apagar-h]'); const bx = ev.target.closest('[data-apagar-ex]');
    if (!bh && !bx) return;
    if (!await confirmar({ titulo: 'Apagar', mensagem: bh ? 'Apagar este horário? A disponibilidade passa a ser calculada sem ele (inclusive nos meses anteriores).' : 'Apagar esta exceção?', botao: 'Apagar', perigo: true })) return;
    try { if (bh) await ind.apagarHorarios([bh.dataset.apagarH]); else await ind.apagarExcecao(bx.dataset.apagarEx); toast('Apagado.'); recarregar(); }
    catch (err) { toast(traduzirErro(err), 'erro'); }
  };
}

// =====================================================================
export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let aba = ABAS[params.get('aba')] ? params.get('aba') : 'indicadores';
  if (idDaUrl(params.get('equipamento'))) filtro.eq = idDaUrl(params.get('equipamento'));
  equipamentos = daPlanta(await listarEquipamentos(), 'id').sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR', { numeric: true }));
  if (filtro.eq && !equipamentos.some((e) => e.id === filtro.eq)) filtro.eq = '';   // trocou de planta
  el.innerHTML = `
    <div class="cabecalho-pagina nao-imprimir"><div><h1>Relatórios</h1>
      <p>${plantaEscolhida() ? `Planta <b>${esc(plantaEscolhida().name)}</b> · ` : variasPlantas() ? '<b>Todas as plantas</b> · ' : ''}Disponibilidade, MTBF, MTTR e custos calculados a partir das paradas, horímetros e ordens de serviço. Baixe em Excel ou imprima em PDF.</p></div></div>
    <div class="abas nao-imprimir" role="tablist">${Object.entries(ABAS).map(([k, v]) => `<button class="aba" data-aba="${k}">${v}</button>`).join('')}</div>
    <div id="aba-rel"></div>`;
  let corpo = el.querySelector('#aba-rel');
  const abrir = async (k) => {
    aba = k;
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    if (k !== 'relatorios') history.replaceState(null, '', `${location.pathname}${location.search}#/relatorios?aba=${k}`);
    // cada aba começa num elemento novo (os ouvintes da aba anterior não ficam pendurados)
    const novo = corpo.cloneNode(false); corpo.replaceWith(novo); corpo = novo;
    novo.innerHTML = carregando();
    try { await ({ indicadores: abaIndicadores, relatorios: abaRelatorios, calendario: abaCalendario })[k](novo); } catch (err) { console.error(err); novo.innerHTML = erroCarga(err); }
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b && b.dataset.aba !== aba) abrir(b.dataset.aba); });
  await abrir(aba);
}
