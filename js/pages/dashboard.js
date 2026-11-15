// Dashboard — só dados reais. Layout (15/11/2026, modelo enviado pela Karen):
// 1) alertas, 2) indicadores do mês (ícone + valor + selo de variação),
// 3) equipamentos | ordens de serviço | top 5 intervenções,
// 4) disponibilidade 12 meses | horas paradas e 5) paradas em aberto.
import { store, pode } from '../store.js';
import { esc, icones, fmtNum, fmtPct, fmtMoeda, hojeISO, carregando, MESES } from '../ui.js';
import { porEquipamento as indicadoresEquip, somar as somarIndicadores, mensais as indicadoresMensais } from '../services/indicadores.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { daPlanta, temPlantas, variasPlantas, plantaEscolhida, escopoOEE } from '../plantas.js';
import { situacao as situacaoHorimetros } from '../services/horimetros.js';
import { listar as listarOS, ENCERRADAS } from '../services/ordens.js';
import { abertas as paradasAbertas, fmtDuracao } from '../services/paradas.js';
import { cartoesAbertas } from './paradas.js';
import { agendaAberta } from '../services/preventiva.js';
import { pontos as pontosPreditiva } from '../services/preditiva.js';
import { listar as listarPendencias, ABERTAS as PEND_ABERTAS } from '../services/pendencias.js';
import { COR, barras, linha, rosca, legenda, semDados } from '../graficos.js';
import { porEquipamento as oeeEquip, mensal as oeeMensal, planta as oeePlanta } from '../services/producao.js';

// Linha de referência no gráfico de disponibilidade
export const META_DISPONIBILIDADE = 95;

const COR_STATUS = { operando: COR.verde, em_manutencao: COR.ambar, parado: COR.vermelho };
const nomeMes = (iso) => MESES[Number(iso.slice(5, 7)) - 1];
const valor = (r) => (r.status === 'fulfilled' ? r.value : null);
// Planta mostrada na saudação: a escolhida no topo, "Todas as plantas" ou (antes das plantas) a unidade das configurações
const textoPlanta = () => (plantaEscolhida()?.name || (variasPlantas() ? 'Todas as plantas' : temPlantas() ? '' : store.empresa?.plant_name || ''));

export async function render(el) {
  const agora = new Date();
  const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (store.perfil.full_name || '').split(' ')[0];
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  el.innerHTML = `
    <div class="boas-vindas">
      <div><h1>${saudacao}${primeiroNome ? `, ${esc(primeiroNome)}` : ''}!</h1>
        <p>${esc(store.empresa?.company_name || '')}${textoPlanta() ? ` · ${esc(textoPlanta())}` : ''}</p>
        <p>${esc(data.charAt(0).toUpperCase() + data.slice(1))}</p></div>
    </div>
    <div id="dash-corpo">${carregando('Montando o painel…')}</div>`;

  const hoje = hojeISO();
  const [rParadas, rOS, rPrev, rHm, rEq, rInd, rMes, rPend, rPred, rOEE, rOEEm] = await Promise.allSettled([
    paradasAbertas(), listarOS(), agendaAberta(), situacaoHorimetros(), listarEquipamentos().then((l) => daPlanta(l, 'id')),
    indicadoresEquip(`${hoje.slice(0, 8)}01`, hoje), indicadoresMensais(12), listarPendencias(), pontosPreditiva(),
    oeeEquip(`${hoje.slice(0, 8)}01`, hoje), oeeMensal(6),
  ]);
  [rParadas, rOS, rPrev, rHm, rEq, rInd, rMes, rPend, rPred, rOEE, rOEEm].forEach((r) => r.status === 'rejected' && console.warn(r.reason));

  const corpo = el.querySelector('#dash-corpo');
  corpo.innerHTML = [
    htmlAlertas({ paradas: valor(rParadas), os: valor(rOS), prev: valor(rPrev), hm: valor(rHm), pend: valor(rPend), pred: valor(rPred) }),
    htmlIndicadores(valor(rInd), valor(rMes), valor(rOEE), valor(rOEEm)),
    `<div class="dash-grade dash-3">${htmlEquipamentos(valor(rEq))}${htmlOSResumo(valor(rOS))}${htmlTop5(valor(rOS))}</div>`,
    `<div class="dash-grade dash-2">${htmlDisponibilidade(valor(rMes))}${htmlHorasParadas(valor(rMes))}</div>`,
    `<div class="dash-grade">${htmlParadas(valor(rParadas))}</div>`,
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

// ---------- 2) Indicadores do mês (modelo aprovado em 15/11/2026: ícone redondo + valor + selo de variação) ----------
function htmlIndicadores(linhas, meses, oee, oeeMeses) {
  if (!linhas) return '';
  const t = somarIndicadores(linhas);
  const ant = (meses || []).at(-2); const nomeAnt = ant ? nomeMes(ant.month) : 'mês anterior';
  const h = (v, c = 1) => (v == null ? '—' : `${fmtNum(v, c)} h`);
  // selo verde = melhorou, vermelho = piorou; a seta mostra se o número subiu ou desceu
  const selo = (d, txt, maiorMelhor) => {
    if (d == null || !Number.isFinite(d)) return '';
    if (Math.abs(d) < 0.05) return `<span class="selo-var neutro" title="igual a ${esc(nomeAnt)}">= ${esc(nomeAnt)}</span>`;
    const bom = maiorMelhor ? d > 0 : d < 0;
    return `<span class="selo-var ${bom ? 'bom' : 'ruim'}" title="comparado com ${esc(nomeAnt)}">${d > 0 ? '↑' : '↓'} ${txt}</span>`;
  };
  const pp = (atual, anterior, maiorMelhor = true) => (atual == null || anterior == null ? '' : selo(atual - Number(anterior), `${atual - Number(anterior) > 0 ? '+' : '−'}${fmtNum(Math.abs(atual - Number(anterior)), 1)} p.p.`, maiorMelhor));
  const pct = (atual, anterior, maiorMelhor) => {
    if (atual == null || anterior == null || !Number(anterior)) return '';
    const d = ((atual - Number(anterior)) / Number(anterior)) * 100;
    return selo(d, `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d), 0)}%`, maiorMelhor);
  };
  const qtd = (atual, anterior) => (anterior == null ? '' : selo(atual - Number(anterior), `${atual - Number(anterior) > 0 ? '+' : '−'}${fmtNum(Math.abs(atual - Number(anterior)))}`, false));
  const cartao = ({ rot, icone, cor, v, var: vr = '', nota = '', dica = '', href = '#/relatorios' }) => `<a class="card kpi2 c-${cor}" href="${href}" title="${esc(dica)}">
    <span class="kpi2-ic"><i data-lucide="${icone}"></i></span>
    <span class="kpi2-txt"><span class="kpi2-rot">${esc(rot)}</span><span class="kpi2-linha"><span class="kpi2-v">${v}</span>${vr}</span>${nota ? `<span class="kpi2-nota">${esc(nota)}</span>` : ''}</span></a>`;
  const cards = [];
  // OEE da planta: só aparece quando há máquinas marcadas para medir OEE
  if (oee && oee.length) {
    const p = oeePlanta(oee); const antO = (oeeMeses || []).at(-2);
    cards.push(cartao({ rot: `OEE ${escopoOEE()}`, icone: 'chart-pie', cor: 'royal', v: fmtPct(p.oee), var: pp(p.oee, antO?.oee), href: '#/producao',
      nota: p.oee == null ? (p.semCalendario ? 'cadastre o horário de funcionamento' : 'sem turnos lançados no mês') : '',
      dica: p.oee == null ? '' : `Disponibilidade ${fmtPct(p.disponibilidade, 0)} · Performance ${fmtPct(p.performance, 0)} · Qualidade ${fmtPct(p.qualidade, 0)}` }));
  }
  cards.push(cartao({ rot: 'Disponibilidade', icone: 'gauge', cor: 'azul', v: fmtPct(t.disponibilidade), var: pp(t.disponibilidade, ant?.availability),
    nota: t.disponibilidade == null ? (t.semCalendario ? 'cadastre o horário de funcionamento' : 'sem horário programado') : '',
    dica: t.disponibilidade == null ? '' : `${h(t.horasParadas)} paradas de ${h(t.horasProgramadas, 0)} programadas` }));
  cards.push(cartao({ rot: 'MTBF', icone: 'activity', cor: 'azul', v: h(t.mtbf, 0), var: pct(t.mtbf, ant?.mtbf, true),
    nota: t.mtbf == null ? (t.falhas ? 'faltam leituras de horímetro' : 'sem falhas no mês') : '',
    dica: 'Tempo médio entre falhas (quanto maior, melhor)' }));
  cards.push(cartao({ rot: 'MTTR', icone: 'timer', cor: 'azul', v: h(t.mttr), var: pct(t.mttr, ant?.mttr, false),
    nota: t.mttr == null ? 'sem reparos no mês' : '', dica: 'Tempo médio para reparar (quanto menor, melhor)' }));
  cards.push(cartao({ rot: 'Falhas', icone: 'circle-alert', cor: 'vermelho', v: fmtNum(t.falhas), var: ant ? qtd(t.falhas, ant.failures || 0) : '',
    dica: 'OS corretivas com falha no mês', href: '#/ordens?situacao=todas' }));
  if (t.custos && pode('costs.read')) cards.push(cartao({ rot: 'Custo do mês', icone: 'coins', cor: 'ambar', v: fmtMoeda(t.custos.total), dica: 'Mão de obra, peças e serviços' }));
  return `<div class="grade-kpi2 k${cards.length}" style="--k:${cards.length}">${cards.join('')}</div>`;
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

function htmlEquipamentos(eqs) {
  if (!eqs) return '';
  const cores = { ...COR_STATUS, desativado: '#c3c8d1' };
  const nomes = { operando: 'Operando', em_manutencao: 'Em manutenção', parado: 'Parado', desativado: 'Inativo' };
  const tot = eqs.length;
  const itens = Object.keys(nomes).map((k) => ({ k, nome: nomes[k], n: eqs.filter((e) => e.status === k).length, cor: cores[k] }))
    .sort((a, b) => b.n - a.n);
  const pctTxt = (n) => `${fmtNum(n)} (${tot ? fmtNum((n / tot) * 100, 0) : 0}%)`;
  return caixa('factory', 'Equipamentos', tot
    ? `<div class="rosca-dash">${rosca(itens, { sub: 'Total', tam: 128 })}${legenda(itens.map((x) => ({ nome: x.nome, n: pctTxt(x.n), cor: x.cor, href: `#/equipamentos?status=${x.k}` })))}</div>`
    : semDados('Nenhum equipamento cadastrado.'), lnk('#/equipamentos', 'Ver todos'));
}

function htmlOSResumo(os) {
  if (!os) return '';
  const ands = os.filter((o) => !ENCERRADAS.includes(o.status));
  const eu = store.perfil?.id;
  const bloco = (cl, icone, n, rot, href) => `<a class="os-bloco ${cl}" href="${href}"><i data-lucide="${icone}"></i><b>${fmtNum(n)}</b><span>${esc(rot)}</span></a>`;
  return caixa('clipboard-list', 'Ordens de Serviço', `<div class="os-blocos">
      ${bloco('azul', 'play', ands.length, 'Em andamento', '#/ordens')}
      ${bloco('ambar', 'user', ands.filter((o) => o.assigned_to === eu).length, 'Comigo', '#/ordens?minhas=1')}
      ${bloco('verde', 'circle-check', ands.filter((o) => o.status === 'aprovada').length, 'Aprovada', '#/ordens?situacao=aprovada')}
    </div>`, lnk('#/ordens', 'Ver todas'));
}

// Equipamentos com mais ordens de serviço abertas nos últimos 90 dias (canceladas não contam)
function htmlTop5(os) {
  if (!os) return '';
  const desde = new Date(Date.now() - 90 * 864e5).toISOString();
  const cont = new Map();
  os.filter((o) => o.status !== 'cancelada' && (o.created_at || '') >= desde).forEach((o) => {
    const c = cont.get(o.equipment_id) || { nome: o.equipment_name || o.equipment_tag, tag: o.equipment_tag, n: 0 };
    c.n += 1; cont.set(o.equipment_id, c);
  });
  const top = [...cont.entries()].map(([id, c]) => ({ id, ...c })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)).slice(0, 5);
  const max = top[0]?.n || 1;
  return caixa('list-ordered', 'Top 5 – Equipamentos com mais intervenções', top.length
    ? `<ol class="top5">${top.map((x, k) => `<li><a href="#/equipamentos/${x.id}"><span class="top5-n">${k + 1}</span><span class="top5-nome" title="${esc(x.tag)}">${esc(x.nome)}</span>
        <span class="top5-barra"><span style="width:${((x.n / max) * 100).toFixed(0)}%;opacity:${(1 - k * 0.12).toFixed(2)}"></span></span><b>${fmtNum(x.n)}</b></a></li>`).join('')}</ol>
       <p class="muted small top5-rodape">Ordens de serviço abertas nos últimos 90 dias</p>`
    : semDados('Nenhuma ordem de serviço nos últimos 90 dias.'));
}

function htmlHorasParadas(meses) {
  if (!meses) return '';
  const ult = meses.slice(-6);
  return caixa('chart-column', 'Horas paradas por mês', barras(ult.map((m) => nomeMes(m.month)), ult.map((m) => (m.downtime_hours == null ? null : Number(m.downtime_hours))),
    { sufixo: ' h', titulo: 'Horas paradas por mês' }), lnk('#/paradas', 'Ver paradas'));
}

function htmlParadas(ab) {
  if (!ab) return '';
  return caixa('circle-pause', `Paradas em aberto${ab.length ? ` (${ab.length})` : ''}`,
    ab.length ? cartoesAbertas([...ab].sort((a, b) => Number(b.duration_hours) - Number(a.duration_hours))) : semDados('Nenhum equipamento parado agora.'), lnk('#/paradas', 'Ver paradas'));
}
