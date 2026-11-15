// Dashboard — na Etapa 1 mostra só dados reais da conta.
// Os indicadores (disponibilidade, MTBF, MTTR, custos) entram na Etapa 11.
import { store } from '../store.js';
import { esc, icones } from '../ui.js';
import { MENU } from '../app.js';
import { listarEquipamentos, STATUS } from '../services/equipamentos.js';
import { situacao as situacaoHorimetros, SITUACAO } from '../services/horimetros.js';
import { listar as listarOS, STATUS_OS, ENCERRADAS } from '../services/ordens.js';
import { abertas as paradasAbertas } from '../services/paradas.js';
import { cartoesAbertas } from './paradas.js';
import { agendaAberta, SITUACAO as SIT_PREV } from '../services/preventiva.js';
import { pontos as pontosPreditiva, RESULTADO as RES_PRED } from '../services/preditiva.js';
import { listar as listarPendencias, ABERTAS as PEND_ABERTAS } from '../services/pendencias.js';

export async function render(el) {
  const agora = new Date();
  const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (store.perfil.full_name || '').split(' ')[0];
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const modulos = MENU.filter((m) => m.etapa).sort((a, b) => a.etapa - b.etapa);
  el.innerHTML = `
    <div class="boas-vindas">
      <div><h1>${saudacao}${primeiroNome ? `, ${esc(primeiroNome)}` : ''}!</h1>
        <p>${esc(store.empresa?.company_name || '')}${store.empresa?.plant_name ? ` · ${esc(store.empresa.plant_name)}` : ''}</p>
        <p>${esc(data.charAt(0).toUpperCase() + data.slice(1))}</p></div>
    </div>
    <div class="secao" id="dash-paradas"></div>
    <div class="secao" id="dash-pend"></div>
    <div class="secao" id="dash-os"></div>
    <div class="secao" id="dash-prev"></div>
    <div class="secao" id="dash-pred"></div>
    <div class="secao" id="dash-equip"></div>
    <div class="secao" id="dash-hm"></div>
    <div class="alerta info secao"><i data-lucide="info"></i><div>
      Os indicadores (disponibilidade, MTBF, MTTR e custos) entram na Etapa 11; o cumprimento preventivo já aparece em Planejamento preventivo → Cumprimento, calculados a partir das paradas, horímetros e ordens de serviço registrados.</div></div>
    <div class="grade grade-2 secao">
      <div class="card"><div class="card-titulo"><h3><i data-lucide="user"></i> Sua conta</h3>
        <a class="btn btn-sm" href="#/minha-conta">Abrir</a></div>
        <div class="card-corpo"><dl class="dados-conta">
          <dt>Nome</dt><dd>${esc(store.perfil.full_name)}</dd>
          <dt>E-mail</dt><dd>${esc(store.perfil.email)}</dd>
          <dt>Perfil</dt><dd>${esc(store.perfil.role?.name || '—')}</dd>
        </dl></div></div>
      <div class="card"><div class="card-titulo"><h3><i data-lucide="list-checks"></i> Implantação do sistema</h3></div>
        <div class="card-corpo"><ul class="linha-tempo" style="margin:0">
          <li><b>Etapa 1 — Fundação e login</b> <span class="badge ativo">Pronta</span></li>
          ${modulos.map((m) => `<li>${m.pronta ? '<b>' : ''}Etapa ${m.etapa} — ${esc(m.titulo)}${m.pronta ? '</b>' : ''} ${m.pronta ? '<span class="badge ativo">Pronta</span>' : '<span class="badge inativo">A fazer</span>'}</li>`).join('')}
        </ul></div></div>
    </div>`;

  // Equipamentos por status (dados reais; do maior para o menor)
  try {
    const eqs = await listarEquipamentos();
    const ativos = eqs.filter((e) => e.status !== 'desativado');
    const cont = Object.keys(STATUS).filter((k) => k !== 'desativado')
      .map((k) => ({ k, n: ativos.filter((e) => e.status === k).length })).sort((a, b) => b.n - a.n);
    el.querySelector('#dash-equip').innerHTML = `<h2><i data-lucide="factory"></i> Equipamentos</h2>
      <div class="faixa-status">
        <a class="quadro-status total" href="#/equipamentos"><span class="n">${ativos.length}</span><span>Equipamentos ativos</span></a>
        ${cont.map(({ k, n }) => `<a class="quadro-status st-${STATUS[k].cor}" href="#/equipamentos?status=${k}"><span class="n">${n}</span>
          <span><i data-lucide="${STATUS[k].icone}"></i> ${esc(STATUS[k].nome)}</span></a>`).join('')}
      </div>`;
  } catch (e) { console.warn(e); }

  // Horímetros: situação das leituras (do maior para o menor)
  try {
    const hms = await situacaoHorimetros();
    if (hms.length) {
      const cont = Object.keys(SITUACAO).map((k) => ({ k, n: hms.filter((e) => e.situacao === k).length })).sort((a, b) => b.n - a.n);
      el.querySelector('#dash-hm').innerHTML = `<h2><i data-lucide="gauge"></i> Horímetros</h2>
        <div class="faixa-status">
          <a class="quadro-status total" href="#/horimetros"><span class="n">${hms.length}</span><span>Com horímetro</span></a>
          ${cont.map(({ k, n }) => `<a class="quadro-status st-${SITUACAO[k].cor}" href="#/horimetros?situacao=${k}"><span class="n">${n}</span>
            <span><i data-lucide="${SITUACAO[k].icone}"></i> ${esc(SITUACAO[k].nome)}</span></a>`).join('')}
        </div>`;
    }
  } catch (e) { console.warn(e); }

  // Ordens de serviço em andamento (do maior para o menor)
  try {
    const todas = await listarOS();
    const ands = todas.filter((o) => !ENCERRADAS.includes(o.status));
    const eu = store.perfil?.id;
    const minhas = ands.filter((o) => o.assigned_to === eu).length;
    const atrasadas = ands.filter((o) => o.overdue).length;
    const cont = Object.keys(STATUS_OS).filter((k) => !ENCERRADAS.includes(k))
      .map((k) => ({ k, n: ands.filter((o) => o.status === k).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
    if (todas.length) {
      el.querySelector('#dash-os').innerHTML = `<h2><i data-lucide="clipboard-list"></i> Ordens de serviço</h2>
        <div class="faixa-status">
          <a class="quadro-status total" href="#/ordens"><span class="n">${ands.length}</span><span>Em andamento</span></a>
          ${minhas ? `<a class="quadro-status st-manutencao" href="#/ordens?minhas=1"><span class="n">${minhas}</span><span><i data-lucide="user-check"></i> Comigo</span></a>` : ''}
          ${atrasadas ? `<a class="quadro-status st-parado" href="#/ordens?situacao=atrasadas"><span class="n">${atrasadas}</span><span><i data-lucide="calendar-x"></i> Atrasadas</span></a>` : ''}
          ${cont.map(({ k, n }) => `<a class="quadro-status" href="#/ordens?situacao=${k}"><span class="n">${n}</span>
            <span><i data-lucide="${STATUS_OS[k].icone}"></i> ${esc(STATUS_OS[k].nome)}</span></a>`).join('')}
        </div>`;
    }
  } catch (e) { console.warn(e); }

  // Preventivas: vencidas e próximas (do maior para o menor)
  try {
    const ag = await agendaAberta();
    if (ag.length) {
      const semOS = ag.filter((s) => s.status === 'prevista');
      const cont = [['vencida', 'st-parado'], ['proxima', 'st-manutencao'], ['em_dia', 'st-operando']]
        .map(([k, cl]) => ({ k, cl, n: ag.filter((s) => s.situacao === k).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
      el.querySelector('#dash-prev').innerHTML = `<h2><i data-lucide="calendar-check"></i> Preventiva</h2>
        <div class="faixa-status">
          <a class="quadro-status total" href="#/preventiva"><span class="n">${ag.length}</span><span>Na agenda</span></a>
          ${cont.map(({ k, cl, n }) => `<a class="quadro-status ${cl}" href="#/preventiva"><span class="n">${n}</span>
            <span><i data-lucide="${SIT_PREV[k].icone}"></i> ${esc(SIT_PREV[k].nome)}</span></a>`).join('')}
          ${semOS.length ? `<a class="quadro-status" href="#/preventiva"><span class="n">${semOS.length}</span><span><i data-lucide="file-plus"></i> Sem OS gerada</span></a>` : ''}
        </div>`;
    }
  } catch (e) { console.warn(e); }

  // Preditiva: pontos em crítico/alerta e rotas atrasadas (do maior para o menor)
  try {
    const pts = (await pontosPreditiva()).filter((p) => p.active);
    if (pts.length) {
      const cont = [['critico', 'st-parado'], ['alerta', 'st-manutencao'], ['atrasada', 'st-parado']]
        .map(([k, cl]) => ({ k, cl, n: pts.filter((p) => (k === 'atrasada' ? p.overdue : p.situacao === k)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
      el.querySelector('#dash-pred').innerHTML = `<h2><i data-lucide="activity"></i> Preditiva</h2>
        <div class="faixa-status">
          <a class="quadro-status total" href="#/preditiva"><span class="n">${pts.length}</span><span>Pontos ativos</span></a>
          ${cont.map(({ k, cl, n }) => `<a class="quadro-status ${cl}" href="#/preditiva"><span class="n">${n}</span>
            <span>${k === 'atrasada' ? '<i data-lucide="calendar-x"></i> Rota atrasada' : `<i data-lucide="${RES_PRED[k].icone}"></i> ${esc(RES_PRED[k].nome)}`}</span></a>`).join('')}
          ${cont.length ? '' : '<span class="quadro-status st-operando"><span class="n"><i data-lucide="circle-check"></i></span><span>Tudo dentro do limite</span></span>'}
        </div>`;
    }
  } catch (e) { console.warn(e); }

  // Pendências: minhas e atrasadas
  try {
    const ps = (await listarPendencias()).filter((p) => PEND_ABERTAS.includes(p.status));
    if (ps.length) {
      const eu = store.perfil?.id;
      const minhas = ps.filter((p) => p.assigned_to === eu);
      const cont = [
        { n: minhas.length, t: 'Comigo', i: 'user-check', h: '#/pendencias?minhas=1', cl: 'st-manutencao' },
        { n: minhas.filter((p) => p.overdue).length, t: 'Minhas atrasadas', i: 'calendar-x', h: '#/pendencias?minhas=1', cl: 'st-parado' },
        { n: ps.filter((p) => p.overdue).length, t: 'Atrasadas (todas)', i: 'calendar-x', h: '#/pendencias?aba=lista', cl: 'st-parado' },
      ].filter((x) => x.n).sort((a, b) => b.n - a.n);
      el.querySelector('#dash-pend').innerHTML = `<h2><i data-lucide="list-todo"></i> Pendências</h2>
        <div class="faixa-status">
          <a class="quadro-status total" href="#/pendencias"><span class="n">${ps.length}</span><span>Em aberto</span></a>
          ${cont.map((x) => `<a class="quadro-status ${x.cl}" href="${x.h}"><span class="n">${x.n}</span><span><i data-lucide="${x.i}"></i> ${esc(x.t)}</span></a>`).join('')}
        </div>`;
    }
  } catch (e) { console.warn(e); }

  // Paradas em aberto agora
  try {
    const ab = await paradasAbertas();
    if (ab.length) {
      el.querySelector('#dash-paradas').innerHTML = `<h2><i data-lucide="octagon-alert"></i> ${ab.length} parada${ab.length === 1 ? '' : 's'} em aberto</h2>${cartoesAbertas(ab)}`;
    }
  } catch (e) { console.warn(e); }
  icones();
}
