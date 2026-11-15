// Dashboard — só dados reais. Layout aprovado em 15/11/2026:
// 1) alertas (o que precisa de atenção), 2) indicadores do mês com tendência,
// 3) gráficos (disponibilidade 12 meses, equipamentos, horas paradas, ranking,
// OS em andamento) e 4) paradas em aberto. Contagens sempre do maior para o menor.
import { store, pode } from '../store.js';
import { esc, icones, fmtNum, fmtPct, fmtMoeda, hojeISO, carregando, MESES } from '../ui.js';
import { porEquipamento as indicadoresEquip, somar as somarIndicadores, mensais as indicadoresMensais } from '../services/indicadores.js';
import { listarEquipamentos, STATUS } from '../services/equipamentos.js';
import { situacao as situacaoHorimetros } from '../services/horimetros.js';
import { listar as listarOS, STATUS_OS, ENCERRADAS } from '../services/ordens.js';
import { abertas as paradasAbertas, fmtDuracao } from '../services/paradas.js';
import { cartoesAbertas } from './paradas.js';
import { agendaAberta } from '../services/preventiva.js';
import { pontos as pontosPreditiva } from '../services/preditiva.js';
import { listar as listarPendencias, ABERTAS as PEND_ABERTAS } from '../services/pendencias.js';
import { COR, barras, linha, rosca, legenda, ranking, mini, semDados } from '../graficos.js';
import { porEquipamento as oeeEquip, mensal as oeeMensal, planta as oeePlanta } from '../services/producao.js';

// Linha de referência no gráfico de disponibilidade
export const META_DISPONIBILIDADE = 95;

const COR_STATUS = { operando: COR.verde, em_manutencao: COR.ambar, parado: COR.vermelho };
const COR_OS = { aberta: COR.claro, aprovada: COR.royal, planejada: COR.aco, em_execucao: COR.marinho2, aguardando_pecas: COR.ambar, aguardando_terceiros: COR.vermelho };
const nomeMes = (iso) => MESES[Number(iso.slice(5, 7)) - 1];
const valor = (r) => (r.status === 'fulfilled' ? r.value : null);

export async function render(el) {
  const agora = new Date();
  const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (store.perfil.full_name || '').split(' ')[0];
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  el.innerHTML = `
    <div class="boas-vindas">
      <div><h1>${saudacao}${primeiroNome ? `, ${esc(primeiroNome)}` : ''}!</h1>
        <p>${esc(store.empresa?.company_name || '')}${store.empresa?.plant_name ? ` · ${esc(store.empresa.plant_name)}` : ''}</p>
        <p>${esc(data.charAt(0).toUpperCase() + data.slice(1))}</p></div>
    </div>
    <div id="dash-corpo">${carregando('Montando o painel…')}</div>`;

  const hoje = hojeISO();
  const [rParadas, rOS, rPrev, rHm, rEq, rInd, rMes, rPend, rPred, rOEE, rOEEm] = await Promise.allSettled([
    paradasAbertas(), listarOS(), agendaAberta(), situacaoHorimetros(), listarEquipamentos(),
    indicadoresEquip(`${hoje.slice(0, 8)}01`, hoje), indicadoresMensais(12), listarPendencias(), pontosPreditiva(),
    oeeEquip(`${hoje.slice(0, 8)}01`, hoje), oeeMensal(6),
  ]);
  [rParadas, rOS, rPrev, rHm, rEq, rInd, rMes, rPend, rPred, rOEE, rOEEm].forEach((r) => r.status === 'rejected' && console.warn(r.reason));

  const corpo = el.querySelector('#dash-corpo');
  corpo.innerHTML = [
    htmlAlertas({ paradas: valor(rParadas), os: valor(rOS), prev: valor(rPrev), hm: valor(rHm), pend: valor(rPend), pred: valor(rPred) }),
    htmlIndicadores(valor(rInd), valor(rMes), valor(rOEE), valor(rOEEm)),
    `<div class="dash-grade dash-21">${htmlDisponibilidade(valor(rMes))}${htmlEquipamentos(valor(rEq), valor(rHm), valor(rPrev))}</div>`,
    `<div class="dash-grade dash-2">${htmlHorasParadas(valor(rMes))}${htmlRanking(valor(rInd))}</div>`,
    `<div class="dash-grade dash-2">${htmlOS(valor(rOS))}${htmlParadas(valor(rParadas))}</div>`,
  ].join('');
  icones();
}

// ---------- 1) Alertas ----------
function alerta({ n, titulo, det, href, cor, icone }) {
  return `<a class="alerta-dash al-${n ? cor : 'ok'}" href="${href}"><i data-lucide="${n ? icone : 'circle-check'}"></i>
    <span class="n">${fmtNum(n)}</span><span class="t">${esc(titulo)}</span><span class="d">${esc(det)}</span></a>`;
}

function htmlAlertas({ paradas, os, prev, hm, pend, pred }) {
  const itens = [];
  if (paradas) {
    const longa = [...paradas].sort((a, b) => Number(b.duration_hours) - Number(a.duration_hours))[0];
    itens.push(alerta({ n: paradas.length, titulo: 'Paradas em aberto', icone: 'circle-pause', cor: 'vermelho', href: '#/paradas',
      det: longa ? `a mais longa: ${longa.equipment_tag}, ${fmtDuracao(longa.duration_hours)}` : 'nenhum equipamento parado agora' }));
  }
  if (os) {
    const ands = os.filter((o) => !ENCERRADAS.includes(o.status));
    const minhas = ands.filter((o) => o.assigned_to === store.perfil?.id).length;
    itens.push(alerta({ n: ands.filter((o) => o.overdue).length, titulo: 'OS atrasadas', icone: 'clock-alert', cor: 'ambar', href: '#/ordens?situacao=atrasadas',
      det: `${fmtNum(minhas)} com você · ${fmtNum(ands.length)} em andamento` }));
  }
  if (prev) {
    const proximas = prev.filter((s) => s.situacao === 'proxima').length;
    itens.push(alerta({ n: prev.filter((s) => s.situacao === 'vencida').length, titulo: 'Preventivas atrasadas', icone: 'calendar-x', cor: 'ambar', href: '#/preventiva',
      det: proximas ? `${fmtNum(proximas)} vencem em breve` : 'nenhuma vence em breve' }));
  }
  if (hm && hm.length) {
    const atr = hm.filter((e) => e.situacao === 'atrasada').length; const sem = hm.filter((e) => e.situacao === 'sem_leitura').length;
    itens.push(alerta({ n: atr + sem, titulo: 'Horímetros sem leitura em dia', icone: 'gauge', cor: 'marinho', href: '#/horimetros',
      det: `${fmtNum(atr)} atrasado${atr === 1 ? '' : 's'} · ${fmtNum(sem)} sem leitura` }));
  }
  // Só aparecem quando há algo a resolver
  const pendAtr = (pend || []).filter((p) => PEND_ABERTAS.includes(p.status) && p.overdue).length;
  if (pendAtr) itens.push(alerta({ n: pendAtr, titulo: 'Pendências atrasadas', icone: 'list-todo', cor: 'ambar', href: '#/pendencias?aba=lista', det: 'abra a lista de pendências' }));
  const predCrit = (pred || []).filter((p) => p.active && (p.situacao === 'critico' || p.situacao === 'alerta'));
  if (predCrit.length) {
    const crit = predCrit.filter((p) => p.situacao === 'critico').length;
    itens.push(alerta({ n: predCrit.length, titulo: 'Pontos da preditiva fora do limite', icone: 'activity', cor: 'vermelho', href: '#/preditiva',
      det: `${fmtNum(crit)} crítico${crit === 1 ? '' : 's'} · ${fmtNum(predCrit.length - crit)} em alerta` }));
  }
  return itens.length ? `<div class="alertas-dash" style="--n:${itens.length}">${itens.join('')}</div>` : '';
}

// ---------- 2) Indicadores do mês ----------
function htmlIndicadores(linhas, meses, oee, oeeMeses) {
  if (!linhas) return '';
  const t = somarIndicadores(linhas);
  const ult = (meses || []).slice(-6); const ant = (meses || []).at(-2);
  const nomeAnt = ant ? nomeMes(ant.month) : '';
  const serie = (k) => ult.map((m) => (m[k] == null ? null : Number(m[k])));
  const h = (v, c = 1) => (v == null ? '—' : `${fmtNum(v, c)} h`);
  // Comparação justa só para taxas (disponibilidade, MTBF, MTTR); contagens e custo mostram o mês anterior inteiro
  const delta = (atual, anterior, { maiorMelhor, casas = 1, un = '' }) => {
    if (atual == null || anterior == null) return '';
    const d = atual - Number(anterior); if (Math.abs(d) < 10 ** -casas / 2) return `<span class="tend">= ${esc(nomeAnt)}</span>`;
    const bom = maiorMelhor ? d > 0 : d < 0;
    return `<span class="tend ${bom ? 'bom' : 'ruim'}">${d > 0 ? '▲' : '▼'} ${fmtNum(Math.abs(d), casas)}${un} vs. ${esc(nomeAnt)}</span>`;
  };
  const cartao = (rot, icone, v, tend, det, s, cl = '') => `<a class="card kpi kpi-dash ${cl}" href="#/relatorios"><span class="rotulo"><i data-lucide="${icone}"></i> ${esc(rot)}</span>
    <span class="valor">${v}</span>${tend}<span class="detalhe">${det}</span>${s}</a>`;
  const custo = t.custos && pode('costs.read');
  // OEE da planta: só aparece quando há máquinas marcadas para medir OEE
  let cardOEE = '';
  if (oee && oee.length) {
    const p = oeePlanta(oee); const antO = (oeeMeses || []).at(-2);
    cardOEE = `<a class="card kpi kpi-dash" href="#/producao"><span class="rotulo"><i data-lucide="chart-pie"></i> OEE da planta</span>
      <span class="valor">${fmtPct(p.oee)}</span>${delta(p.oee, antO?.oee, { maiorMelhor: true, un: ' p.p.' })}
      <span class="detalhe">${p.oee == null ? (p.semCalendario ? 'cadastre o horário de funcionamento' : 'sem turnos lançados no mês') : `D ${fmtPct(p.disponibilidade, 0)} · P ${fmtPct(p.performance, 0)} · Q ${fmtPct(p.qualidade, 0)}`}</span>
      ${mini((oeeMeses || []).map((m) => (m.oee == null ? null : Number(m.oee))))}</a>`;
  }
  const n = 4 + (custo ? 1 : 0) + (cardOEE ? 1 : 0);
  return `<div class="grade-kpi-dash" style="--k:${n}">
    ${cardOEE}
    ${cartao('Disponibilidade', 'gauge', fmtPct(t.disponibilidade), delta(t.disponibilidade, ant?.availability, { maiorMelhor: true, un: ' p.p.' }),
      t.disponibilidade == null ? (t.semCalendario ? 'cadastre o horário de funcionamento' : 'sem horário programado') : `${h(t.horasParadas)} paradas de ${h(t.horasProgramadas, 0)}`,
      mini(serie('availability'), COR.claro), 'destaque')}
    ${cartao('MTBF', 'timer', h(t.mtbf), delta(t.mtbf, ant?.mtbf, { maiorMelhor: true, un: ' h' }),
      t.mtbf == null ? (t.falhas ? 'faltam leituras de horímetro' : 'sem falhas no mês') : `${fmtNum(t.falhas - t.falhasSemHorimetro)} falha(s)${t.mtbfParcial ? ' · parcial' : ''}`, mini(serie('mtbf')))}
    ${cartao('MTTR', 'wrench', h(t.mttr, 2), delta(t.mttr, ant?.mttr, { maiorMelhor: false, casas: 2, un: ' h' }),
      t.mttr == null ? 'sem reparos no mês' : `${t.reparos} reparo${t.reparos === 1 ? '' : 's'}${t.mttrParcial ? ' · parcial' : ''}`, mini(serie('mttr')))}
    ${cartao('Falhas', 'circle-alert', fmtNum(t.falhas), ant ? `<span class="tend">${esc(nomeAnt)}: ${fmtNum(ant.failures || 0)}</span>` : '',
      'OS corretivas com falha', mini(serie('failures'), COR.vermelho))}
    ${custo ? cartao('Custo do mês', 'wallet', fmtMoeda(t.custos.total), ant && ant.cost_total != null ? `<span class="tend">${esc(nomeAnt)}: ${fmtMoeda(ant.cost_total)}</span>` : '',
      'mão de obra, peças e serviços', mini(serie('cost_total'))) : ''}
  </div>`;
}

// ---------- 3) Gráficos ----------
const caixa = (icone, titulo, conteudo, link = '') => `<section class="card caixa-dash"><h3><i data-lucide="${icone}"></i>${esc(titulo)}${link}</h3>${conteudo}</section>`;
const lnk = (href, txt) => `<a class="lnk" href="${href}">${esc(txt)} →</a>`;

function htmlDisponibilidade(meses) {
  if (!meses) return caixa('trending-up', 'Disponibilidade — últimos 12 meses', semDados());
  const vals = meses.map((m) => (m.availability == null ? null : Number(m.availability)));
  return caixa('trending-up', 'Disponibilidade — últimos 12 meses',
    linha(meses.map((m) => nomeMes(m.month)), vals, { meta: META_DISPONIBILIDADE, titulo: 'Disponibilidade por mês' }), lnk('#/relatorios', 'Ver relatório'));
}

function htmlEquipamentos(eqs, hm, prev) {
  if (!eqs) return '';
  const ativos = eqs.filter((e) => e.status !== 'desativado');
  const itens = Object.keys(COR_STATUS).map((k) => ({ nome: STATUS[k].nome, n: ativos.filter((e) => e.status === k).length, cor: COR_STATUS[k], href: `#/equipamentos?status=${k}` }))
    .sort((a, b) => b.n - a.n);
  const extra = [];
  if (hm && hm.length) extra.push({ nome: 'Horímetros em dia', n: `${fmtNum(hm.filter((e) => e.situacao === 'em_dia').length)} de ${fmtNum(hm.length)}`, cor: COR.verde, href: '#/horimetros' });
  if (prev && prev.length) extra.push({ nome: 'Preventivas em dia', n: `${fmtNum(prev.filter((s) => s.situacao !== 'vencida').length)} de ${fmtNum(prev.length)}`, cor: COR.royal, href: '#/preventiva' });
  return caixa('factory', 'Equipamentos', ativos.length
    ? `<div class="rosca-dash">${rosca(itens, { sub: 'ativos' })}${legenda(itens)}</div>${extra.length ? `<div class="rodape-caixa">${legenda(extra)}</div>` : ''}`
    : semDados('Nenhum equipamento cadastrado.'), lnk('#/equipamentos', 'Ver todos'));
}

function htmlHorasParadas(meses) {
  if (!meses) return '';
  const ult = meses.slice(-6);
  return caixa('chart-column', 'Horas paradas por mês', barras(ult.map((m) => nomeMes(m.month)), ult.map((m) => (m.downtime_hours == null ? null : Number(m.downtime_hours))),
    { sufixo: ' h', titulo: 'Horas paradas por mês' }), lnk('#/paradas', 'Ver paradas'));
}

function htmlRanking(linhas) {
  if (!linhas) return '';
  const top = linhas.filter((l) => Number(l.downtime_hours) > 0)
    .sort((a, b) => Number(b.downtime_hours) - Number(a.downtime_hours) || a.tag.localeCompare(b.tag)).slice(0, 5)
    .map((l) => ({ nome: l.name, det: l.tag, v: Number(l.downtime_hours), href: `#/equipamentos/${l.equipment_id}` }));
  return caixa('list-ordered', 'Mais horas paradas no mês', top.length ? ranking(top) : semDados('Nenhuma hora parada neste mês.'));
}

function htmlOS(os) {
  if (!os) return '';
  const ands = os.filter((o) => !ENCERRADAS.includes(o.status));
  const itens = Object.keys(COR_OS).map((k) => ({ nome: STATUS_OS[k].nome, n: ands.filter((o) => o.status === k).length, cor: COR_OS[k], href: `#/ordens?situacao=${k}` }))
    .filter((x) => x.n).sort((a, b) => b.n - a.n);
  return caixa('clipboard-list', 'Ordens de serviço em andamento', ands.length
    ? `<div class="rosca-dash">${rosca(itens, { sub: 'em andamento' })}${legenda(itens)}</div>`
    : semDados('Nenhuma ordem de serviço em andamento.'), lnk('#/ordens', 'Ver ordens'));
}

function htmlParadas(ab) {
  if (!ab) return '';
  return caixa('circle-pause', `Paradas em aberto${ab.length ? ` (${ab.length})` : ''}`,
    ab.length ? cartoesAbertas([...ab].sort((a, b) => Number(b.duration_hours) - Number(a.duration_hours))) : semDados('Nenhum equipamento parado agora.'), lnk('#/paradas', 'Ver paradas'));
}
