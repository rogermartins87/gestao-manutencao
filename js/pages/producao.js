// =====================================================================
// Produção e OEE (Etapa 13)
//  • OEE: OEE da planta (ponderado pelas horas programadas) e de cada máquina
//  • Lançar turno: produção e refugo de cada máquina num turno
//  • Lançamentos: histórico, com correção/anulação justificada
//  • Turnos: cadastro dos turnos (quem cadastra equipamentos)
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, vazio, carregando, erroCarga, fmtNum, fmtPct, fmtData, fmtDataHora,
  hojeISO, addDias, numOuNulo, montarTabela, baixarCSV, MESES } from '../ui.js';
import * as pr from '../services/producao.js';
import { linha as graficoLinha, semDados, COR } from '../graficos.js';

const ABAS = { oee: 'OEE', lancar: 'Lançar turno', lancamentos: 'Lançamentos', turnos: 'Turnos' };
const PERIODOS = { mes: 'Este mês', mes_ant: 'Mês passado', d7: 'Últimos 7 dias', d30: 'Últimos 30 dias', d90: 'Últimos 90 dias' };
const hora = (t) => (t ? String(t).slice(0, 5) : '');
const nomeMes = (iso) => MESES[Number(iso.slice(5, 7)) - 1];
const qtd = (v, un = '') => (v == null ? '—' : `${fmtNum(v, Number(v) % 1 ? 1 : 0)}${un ? ` ${un}` : ''}`);

function datas(k) {
  const h = hojeISO(); const [y, m] = h.split('-').map(Number); const pad = (x) => String(x).padStart(2, '0');
  if (k === 'mes') return [`${y}-${pad(m)}-01`, h];
  if (k === 'mes_ant') { const d = new Date(y, m - 2, 1); const f = new Date(y, m - 1, 0);
    return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`]; }
  return [addDias(h, -({ d7: 6, d30: 29, d90: 89 }[k] ?? 29)), h];
}

// Cor do OEE: referência comum de mercado (85% = classe mundial; abaixo de 60% = baixo)
const corOEE = (v) => (v == null ? COR.aco : v >= 85 ? COR.verde : v >= 60 ? COR.ambar : COR.vermelho);
const barraPct = (v) => `<span class="barra-oee"><span style="width:${Math.max(0, Math.min(100, v ?? 0))}%;background:${corOEE(v)}"></span></span>`;

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const abas = Object.fromEntries(Object.entries(ABAS).filter(([k]) => (k === 'lancar' ? pode('production.write') : k === 'turnos' ? pode('equipment.write') : true)));
  let aba = abas[params.get('aba')] ? params.get('aba') : 'oee';
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Produção e OEE</h1>
      <p>OEE = Disponibilidade × Performance × Qualidade. A produção é lançada por turno; a disponibilidade vem das paradas e do calendário.</p></div>
      ${pode('production.write') ? '<div class="acoes"><a class="btn btn-primario" href="#/producao?aba=lancar"><i data-lucide="plus"></i> Lançar turno</a></div>' : ''}</div>
    <div class="abas" role="tablist">${Object.entries(abas).map(([k, v]) => `<button class="aba" data-aba="${k}">${v}</button>`).join('')}</div>
    <div id="aba-prod"></div>`;
  let corpo = el.querySelector('#aba-prod');
  const abrir = async (k) => {
    aba = k;
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    history.replaceState(null, '', `${location.pathname}${location.search}#/producao${k === 'oee' ? '' : `?aba=${k}`}`);
    const novo = corpo.cloneNode(false); corpo.replaceWith(novo); corpo = novo;
    novo.innerHTML = carregando();
    try { await ({ oee: abaOEE, lancar: abaLancar, lancamentos: abaLancamentos, turnos: abaTurnos })[k](novo, abrir); } catch (err) { console.error(err); novo.innerHTML = erroCarga(err); }
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b && b.dataset.aba !== aba) abrir(b.dataset.aba); });
  el.querySelector('.cabecalho-pagina .btn-primario')?.addEventListener('click', (ev) => { ev.preventDefault(); abrir('lancar'); });
  await abrir(aba);
}

// =====================================================================
// Aba: OEE
// =====================================================================
const filtroOEE = { per: 'mes' };
async function abaOEE(corpo) {
  corpo.innerHTML = `<div class="card"><div class="filtros filtros-rel">
      <div class="campo"><label for="o-per">Período</label><select id="o-per">
        ${Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${k === filtroOEE.per ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </div></div><div id="res-oee" class="secao"></div>`;
  const res = corpo.querySelector('#res-oee');
  const carregar = async () => {
    res.innerHTML = carregando('Calculando o OEE…');
    const [ini, fim] = datas(filtroOEE.per);
    let linhas; let meses;
    try { [linhas, meses] = await Promise.all([pr.porEquipamento(ini, fim), pr.mensal(12)]); } catch (err) { res.innerHTML = erroCarga(err); return; }
    if (!linhas.length) {
      res.innerHTML = `<div class="card">${vazio({ icone: 'factory', titulo: 'Nenhum equipamento mede OEE ainda',
        texto: 'Abra o cadastro de cada máquina de produção, marque “Mede OEE” e informe a unidade e a velocidade ideal.',
        acao: pode('equipment.write') ? '<a class="btn btn-primario" href="#/equipamentos">Ir para Equipamentos</a>' : '' })}</div>`;
      icones(); return;
    }
    const t = pr.planta(linhas);
    const tile = (rot, icone, v, det, cl = '') => `<div class="card kpi ${cl}"><span class="rotulo"><i data-lucide="${icone}"></i> ${esc(rot)}</span>
      <span class="valor">${fmtPct(v)}</span><span class="detalhe">${det}</span></div>`;
    const ordenadas = [...linhas].sort((a, b) => (b.oee ?? -1) - (a.oee ?? -1) || a.tag.localeCompare(b.tag));
    res.innerHTML = `
      <div class="grade-ind">
        ${tile('OEE da planta', 'factory', t.oee, t.oee == null ? (t.semCalendario ? 'cadastre o horário de funcionamento' : 'sem turnos lançados no período') : `${t.comOEE} de ${t.maquinas} máquinas · ponderado pelas horas programadas`, 'destaque')}
        ${tile('Disponibilidade', 'gauge', t.disponibilidade, 'tempo rodando ÷ tempo programado')}
        ${tile('Performance', 'zap', t.performance, 'produção ÷ (velocidade ideal × tempo rodando)')}
        ${tile('Qualidade', 'badge-check', t.qualidade, '(produzido − refugo) ÷ produzido')}
      </div>
      ${t.acimaIdeal ? `<div class="alerta aviso secao"><i data-lucide="triangle-alert"></i><div><b>${t.acimaIdeal} máquina${t.acimaIdeal === 1 ? '' : 's'} produziu acima da velocidade ideal.</b> A performance foi limitada a 100%. Confira a velocidade ideal no cadastro.</div></div>` : ''}
      <div class="dash-grade dash-21">
        <section class="card caixa-dash"><h3><i data-lucide="trending-up"></i>OEE da planta — últimos 12 meses</h3>
          ${graficoLinha(meses.map((m) => nomeMes(m.month)), meses.map((m) => (m.oee == null ? null : Number(m.oee))), { titulo: 'OEE da planta por mês' })}</section>
        <section class="card caixa-dash"><h3><i data-lucide="info"></i>Como ler</h3><div class="small">
          <p><b>Disponibilidade</b>: quanto do tempo programado a máquina ficou rodando (paradas tiram).</p>
          <p><b>Performance</b>: quanto ela produziu comparado ao que produziria na velocidade ideal no tempo em que rodou.</p>
          <p><b>Qualidade</b>: quanto da produção saiu boa (refugo tira).</p>
          <p class="muted">Referência de mercado: 85% ou mais é classe mundial; abaixo de 60% merece atenção.</p></div></section>
      </div>
      <div class="cabecalho-secao secao"><h3><i data-lucide="list-ordered"></i> Por máquina</h3>
        <div class="acoes"><button class="btn btn-sm" id="b-csv"><i data-lucide="file-spreadsheet"></i> Baixar Excel</button></div></div>
      <p class="muted small">Do maior OEE para o menor. Clique para abrir o equipamento.</p>
      <div class="card" id="tab-oee"></div>`;
    const colunas = [
      { titulo: 'Equipamento', valor: (l) => l.tag, primaria: true, render: (l) => `<div><b>${esc(l.tag)}</b><div class="small muted">${esc(l.name)}</div></div>`, csv: (l) => `${l.tag} — ${l.name}` },
      { titulo: 'OEE', valor: (l) => (l.oee == null ? null : Number(l.oee)), classe: 'num',
        render: (l) => (l.oee == null ? `<span class="muted">—</span><div class="small muted">${esc(pr.SELO_OEE[l.oee_seal] || '')}</div>` : `<div><b style="color:${corOEE(Number(l.oee))}">${fmtPct(Number(l.oee))}</b>${barraPct(Number(l.oee))}</div>`),
        csv: (l) => (l.oee == null ? pr.SELO_OEE[l.oee_seal] : fmtNum(l.oee, 1)) },
      { titulo: 'Disponibilidade', valor: (l) => (l.availability == null ? null : Number(l.availability)), classe: 'num', render: (l) => fmtPct(l.availability == null ? null : Number(l.availability)), csv: (l) => (l.availability == null ? '' : fmtNum(l.availability, 1)) },
      { titulo: 'Performance', valor: (l) => (l.performance == null ? null : Number(l.performance)), classe: 'num',
        render: (l) => `${fmtPct(l.performance == null ? null : Number(l.performance))}${l.performance_capped ? `<div class="small aviso-txt" title="Produziu ${fmtPct(Number(l.performance_raw))} da velocidade ideal">acima do ideal</div>` : ''}`,
        csv: (l) => (l.performance == null ? '' : fmtNum(l.performance, 1)) },
      { titulo: 'Qualidade', valor: (l) => (l.quality == null ? null : Number(l.quality)), classe: 'num', render: (l) => fmtPct(l.quality == null ? null : Number(l.quality)), csv: (l) => (l.quality == null ? '' : fmtNum(l.quality, 1)) },
      { titulo: 'Produção boa', valor: (l) => Number(l.good_qty), classe: 'num',
        render: (l) => `<div>${qtd(l.good_qty, l.production_unit)}<div class="small muted">${qtd(l.rejected_qty)} de refugo</div></div>`,
        csv: (l) => fmtNum(l.good_qty, 3) },
      { titulo: 'Turnos lançados', valor: (l) => l.shifts_recorded, classe: 'num', render: (l) => fmtNum(l.shifts_recorded), csv: (l) => l.shifts_recorded },
    ];
    const cfg = { linhas: ordenadas, colunas, porPagina: 60, busca: true, idLinha: (l) => l.equipment_id, aoClicar: (id) => { location.hash = `#/equipamentos/${id}`; },
      vazioHtml: vazio({ icone: 'factory', titulo: 'Nenhuma máquina' }) };
    montarTabela(res.querySelector('#tab-oee'), cfg);
    res.querySelector('#b-csv').onclick = () => baixarCSV(`oee-${ini}-a-${fim}.csv`, [...colunas,
      { titulo: 'Unidade', csv: (l) => l.production_unit || '' }, { titulo: 'Produzido', csv: (l) => fmtNum(l.produced_qty, 3) }, { titulo: 'Refugo', csv: (l) => fmtNum(l.rejected_qty, 3) },
      { titulo: 'Horas programadas', csv: (l) => fmtNum(l.scheduled_hours, 1) }, { titulo: 'Horas rodando', csv: (l) => fmtNum(l.run_hours, 1) },
      { titulo: 'Horas ideais', csv: (l) => fmtNum(l.ideal_hours, 1) }], ordenadas);
    icones();
  };
  corpo.querySelector('#o-per').onchange = (ev) => { filtroOEE.per = ev.target.value; carregar(); };
  await carregar();
}

// =====================================================================
// Aba: Lançar turno — uma linha por máquina que mede OEE
// =====================================================================
async function abaLancar(corpo, abrir) {
  const [turnos, maquinas] = await Promise.all([pr.turnos(), pr.equipamentosOEE()]);
  const ativos = turnos.filter((t) => t.active);
  if (!ativos.length || !maquinas.length) {
    corpo.innerHTML = `<div class="card">${vazio({ icone: 'clipboard-list', titulo: !ativos.length ? 'Nenhum turno cadastrado' : 'Nenhuma máquina mede OEE',
      texto: !ativos.length ? 'Cadastre os turnos da usina (ex.: Turno A 06:00–14:00) na aba “Turnos”.' : 'Marque “Mede OEE” no cadastro das máquinas de produção, com a unidade e a velocidade ideal.',
      acao: !ativos.length && pode('equipment.write') ? '<button class="btn btn-primario" id="ir-turnos">Cadastrar turnos</button>' : '' })}</div>`;
    corpo.querySelector('#ir-turnos')?.addEventListener('click', () => abrir('turnos'));
    return;
  }
  // turno atual pelo horário (o que começou por último antes de agora)
  const agora = new Date(); const hm = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  const dentro = (t) => { const a = hora(t.start_time); const b = hora(t.end_time); return a < b ? hm >= a && hm < b : hm >= a || hm < b; };
  const atual = ativos.find(dentro) || ativos[0];
  const virou = hora(atual.end_time) <= hora(atual.start_time) && hm < hora(atual.end_time);
  const st = { data: virou ? addDias(hojeISO(), -1) : hojeISO(), turno: atual.id };

  corpo.innerHTML = `
    <div class="card"><div class="filtros filtros-rel">
      <div class="campo"><label for="l-data">Dia em que o turno começou</label><input type="date" id="l-data" value="${st.data}" max="${hojeISO()}"></div>
      <div class="campo"><label for="l-turno">Turno</label><select id="l-turno">${ativos.map((t) => `<option value="${t.id}" ${t.id === st.turno ? 'selected' : ''}>${esc(t.name)} (${hora(t.start_time)}–${hora(t.end_time)})</option>`).join('')}</select></div>
    </div></div>
    <p class="muted small secao">Informe a produção total da máquina no turno (boa + refugo) e quanto foi refugo/sucata. Deixe em branco a máquina que não produziu neste turno. Depois de salvo, só é possível corrigir com justificativa.</p>
    <form id="f-lancar" class="card"><div class="tabela-wrap"><table class="tabela responsiva tabela-lancar"><thead><tr>
      <th>Máquina</th><th>Produzido no turno</th><th>Refugo / sucata</th><th>Observação</th><th></th></tr></thead><tbody id="l-linhas"></tbody></table></div>
      <div class="card-corpo acoes" style="justify-content:flex-end"><span class="small muted" id="l-resumo"></span>
        <button class="btn btn-primario" type="submit"><i data-lucide="save"></i> Salvar turno</button></div></form>`;

  const tbody = corpo.querySelector('#l-linhas');
  let ja = [];
  const desenhar = async () => {
    tbody.innerHTML = `<tr><td colspan="5">${carregando()}</td></tr>`;
    ja = await pr.lancamentos({ desde: st.data, ate: st.data });
    ja = ja.filter((r) => r.shift_id === st.turno);
    tbody.innerHTML = maquinas.map((m) => {
      const r = ja.find((x) => x.equipment_id === m.id);
      const un = esc(m.production_unit || '');
      if (r) {
        return `<tr class="ja-lancado"><td data-rotulo="Máquina"><div><b>${esc(m.tag)}</b><div class="small muted">${esc(m.name)}</div></div></td>
          <td data-rotulo="Produzido" class="num">${qtd(r.produced_qty, r.production_unit)}</td><td data-rotulo="Refugo" class="num">${qtd(r.rejected_qty, r.production_unit)}</td>
          <td data-rotulo="Observação" class="small">${esc(r.notes || '')}</td><td><span class="badge ativo"><i data-lucide="check"></i> Lançado</span></td></tr>`;
      }
      return `<tr data-id="${m.id}"><td data-rotulo="Máquina"><div><b>${esc(m.tag)}</b><div class="small muted">${esc(m.name)} · ideal ${qtd(m.ideal_rate)} ${un}/h</div></div></td>
        <td data-rotulo="Produzido"><div class="campo-un"><input name="p" inputmode="decimal" autocomplete="off" aria-label="Produzido por ${esc(m.tag)}"><span>${un}</span></div></td>
        <td data-rotulo="Refugo"><div class="campo-un"><input name="r" inputmode="decimal" autocomplete="off" aria-label="Refugo de ${esc(m.tag)}"><span>${un}</span></div></td>
        <td data-rotulo="Observação"><input name="o" maxlength="300" autocomplete="off" aria-label="Observação de ${esc(m.tag)}"></td><td class="msg-linha small"></td></tr>`;
    }).join('');
    corpo.querySelector('#l-resumo').textContent = `${ja.length} de ${maquinas.length} máquinas já lançadas neste turno`;
    icones();
  };
  corpo.querySelector('#l-data').onchange = (ev) => { st.data = ev.target.value; desenhar(); };
  corpo.querySelector('#l-turno').onchange = (ev) => { st.turno = ev.target.value; desenhar(); };
  corpo.querySelector('#f-lancar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector('[type=submit]');
    const linhas = [...tbody.querySelectorAll('tr[data-id]')].filter((tr) => tr.querySelector('[name=p]').value.trim() !== '' || tr.querySelector('[name=r]').value.trim() !== '');
    if (!linhas.length) { toast('Preencha a produção de pelo menos uma máquina.', 'info'); return; }
    btn.disabled = true; let salvas = 0; let erros = 0;
    for (const tr of linhas) {
      const msg = tr.querySelector('.msg-linha'); msg.textContent = '';
      const p = numOuNulo(tr.querySelector('[name=p]').value); const r = numOuNulo(tr.querySelector('[name=r]').value) ?? 0;
      if (p == null || p < 0 || r < 0) { msg.innerHTML = '<span class="perigo-txt">Número inválido</span>'; erros++; continue; }
      if (r > p) { msg.innerHTML = '<span class="perigo-txt">Refugo maior que o produzido</span>'; erros++; continue; }
      try {
        await pr.lancar({ equipment_id: tr.dataset.id, shift_date: st.data, shift_id: st.turno, produced_qty: p, rejected_qty: r, notes: tr.querySelector('[name=o]').value.trim() || null });
        salvas++;
      } catch (err) { msg.innerHTML = `<span class="perigo-txt">${esc(traduzirErro(err))}</span>`; erros++; }
    }
    btn.disabled = false;
    if (salvas) toast(`${salvas} lançamento${salvas === 1 ? '' : 's'} salvo${salvas === 1 ? '' : 's'}.`);
    if (!erros) await desenhar();
    else {   // mantém as linhas com erro na tela; recarrega o resto
      const pend = Object.fromEntries(linhas.filter((tr) => tr.querySelector('.msg-linha').textContent).map((tr) => [tr.dataset.id,
        { p: tr.querySelector('[name=p]').value, r: tr.querySelector('[name=r]').value, o: tr.querySelector('[name=o]').value, m: tr.querySelector('.msg-linha').innerHTML }]));
      await desenhar();
      Object.entries(pend).forEach(([id, v]) => { const tr = tbody.querySelector(`tr[data-id="${id}"]`); if (!tr) return;
        tr.querySelector('[name=p]').value = v.p; tr.querySelector('[name=r]').value = v.r; tr.querySelector('[name=o]').value = v.o; tr.querySelector('.msg-linha').innerHTML = v.m; });
    }
  });
  await desenhar();
}

// =====================================================================
// Aba: Lançamentos (histórico) com correção e anulação
// =====================================================================
async function abaLancamentos(corpo) {
  const st = { per: 'd30', eq: '', ver: 'valida' };
  const [turnos, maquinas] = await Promise.all([pr.turnos(), pr.equipamentosOEE()]);
  const nomeTurno = (id) => turnos.find((t) => t.id === id)?.name || '—';
  const podeCorrigir = pode('production.correct');
  corpo.innerHTML = `<div class="card"><div class="filtros filtros-rel">
      <div class="campo"><label for="h-per">Período</label><select id="h-per">${Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${k === st.per ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="h-eq">Máquina</label><select id="h-eq"><option value="">Todas</option>${maquinas.map((m) => `<option value="${m.id}">${esc(m.tag)} — ${esc(m.name)}</option>`).join('')}</select></div>
      <div class="campo"><label for="h-ver">Mostrar</label><select id="h-ver"><option value="valida">Só válidos</option><option value="todos">Também corrigidos e anulados</option></select></div>
    </div></div><div id="res-lanc" class="secao"></div>`;
  const res = corpo.querySelector('#res-lanc');
  const carregar = async () => {
    res.innerHTML = carregando();
    const [ini, fim] = datas(st.per);
    let ls;
    try { ls = await pr.lancamentos({ desde: ini, ate: fim, equipamento: st.eq || null, todos: st.ver === 'todos' }); } catch (err) { res.innerHTML = erroCarga(err); return; }
    ls.sort((a, b) => b.shift_date.localeCompare(a.shift_date) || String(b.created_at).localeCompare(String(a.created_at)));
    const eqs = Object.fromEntries(maquinas.map((m) => [m.id, m]));
    const colunas = [
      { titulo: 'Turno', valor: (l) => `${l.shift_date} ${nomeTurno(l.shift_id)}`, primaria: true, render: (l) => `<div><b>${fmtData(l.shift_date)}</b><div class="small muted">${esc(nomeTurno(l.shift_id))}</div></div>` },
      { titulo: 'Máquina', valor: (l) => eqs[l.equipment_id]?.tag || '', render: (l) => `<b>${esc(eqs[l.equipment_id]?.tag || '—')}</b>` },
      { titulo: 'Produzido', valor: (l) => Number(l.produced_qty), classe: 'num', render: (l) => qtd(l.produced_qty, l.production_unit) },
      { titulo: 'Refugo', valor: (l) => Number(l.rejected_qty), classe: 'num', render: (l) => qtd(l.rejected_qty, l.production_unit) },
      { titulo: 'Situação', valor: (l) => l.status, render: (l) => (l.status === 'valida' ? `<span class="badge ativo">${l.corrects_record_id ? 'Corrigido' : 'Válido'}</span>`
        : `<span class="badge inativo">${l.status === 'anulada' ? 'Anulado' : 'Substituído'}</span>`) + (l.justification ? `<div class="small muted">${esc(l.justification)}</div>` : '') },
      { titulo: 'Lançado em', valor: (l) => l.created_at, render: (l) => `<span class="small">${fmtDataHora(l.created_at)}</span>` },
      ...(podeCorrigir ? [{ titulo: '', render: (l) => (l.status === 'valida' ? `<div class="acoes-linha"><button class="btn btn-sm" data-corrigir="${l.id}">Corrigir</button>
        <button class="btn btn-sm btn-texto" data-anular="${l.id}">Anular</button></div>` : '') }] : []),
    ];
    res.innerHTML = '<div class="card" id="tab-lanc"></div>';
    montarTabela(res.querySelector('#tab-lanc'), { linhas: ls, colunas, porPagina: 50, busca: false,
      vazioHtml: vazio({ icone: 'clipboard-list', titulo: 'Nenhum lançamento no período' }) });
    res.onclick = (ev) => {
      const c = ev.target.closest('[data-corrigir]'); const a = ev.target.closest('[data-anular]');
      const l = ls.find((x) => x.id === (c?.dataset.corrigir || a?.dataset.anular)); if (!l) return;
      const eq = eqs[l.equipment_id];
      const { el: m, fechar } = abrirModal({
        titulo: `${c ? 'Corrigir' : 'Anular'} lançamento — ${eq?.tag || ''}, ${fmtData(l.shift_date)} ${nomeTurno(l.shift_id)}`,
        html: `<form id="f-cor" class="grade" style="gap:12px">
          ${c ? `<div class="grade grade-2"><div class="campo"><label for="c-p">Produzido (${esc(l.production_unit)})</label><input id="c-p" inputmode="decimal" value="${l.produced_qty}" required></div>
            <div class="campo"><label for="c-r">Refugo (${esc(l.production_unit)})</label><input id="c-r" inputmode="decimal" value="${l.rejected_qty}"></div></div>`
          : `<p style="margin:0">O lançamento de ${qtd(l.produced_qty, l.production_unit)} deixa de contar no OEE, mas fica guardado no histórico.</p>`}
          <div class="campo"><label for="c-j">Justificativa * (mínimo de 10 caracteres)</label><textarea id="c-j" rows="3" required minlength="10" maxlength="500"></textarea></div>
          <div id="c-msg"></div></form>`,
        rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn ${c ? 'btn-primario' : 'btn-perigo'}" form="f-cor" type="submit">${c ? 'Salvar correção' : 'Anular lançamento'}</button>`,
      });
      m.querySelector('#f-cor').addEventListener('submit', async (e2) => {
        e2.preventDefault();
        try {
          if (c) await pr.corrigir(l.id, numOuNulo(m.querySelector('#c-p').value), numOuNulo(m.querySelector('#c-r').value) ?? 0, m.querySelector('#c-j').value.trim());
          else await pr.anular(l.id, m.querySelector('#c-j').value.trim());
          fechar(); toast(c ? 'Lançamento corrigido.' : 'Lançamento anulado.'); carregar();
        } catch (err) { m.querySelector('#c-msg').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`; }
      });
    };
    icones();
  };
  corpo.querySelector('#h-per').onchange = (ev) => { st.per = ev.target.value; carregar(); };
  corpo.querySelector('#h-eq').onchange = (ev) => { st.eq = ev.target.value; carregar(); };
  corpo.querySelector('#h-ver').onchange = (ev) => { st.ver = ev.target.value; carregar(); };
  await carregar();
}

// =====================================================================
// Aba: Turnos
// =====================================================================
async function abaTurnos(corpo) {
  const lista = await pr.turnos();
  corpo.innerHTML = `
    <p class="muted small">Os turnos servem para o lançamento da produção. O tempo programado de cada máquina continua vindo do calendário de funcionamento (Relatórios → Calendário de funcionamento).</p>
    <div class="card"><div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th>Turno</th><th>Horário</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.length ? lista.map((t) => `<tr><td data-rotulo="Turno"><b>${esc(t.name)}</b></td><td data-rotulo="Horário">${hora(t.start_time)} – ${hora(t.end_time)}${hora(t.end_time) <= hora(t.start_time) ? ' <span class="small muted">(termina no dia seguinte)</span>' : ''}</td>
        <td data-rotulo="Situação">${t.active ? '<span class="badge ativo">Ativo</span>' : '<span class="badge inativo">Desativado</span>'}</td>
        <td><div class="acoes-linha"><button class="btn btn-sm" data-editar="${t.id}">Editar</button>
          <button class="btn btn-sm btn-texto" data-ativo="${t.id}">${t.active ? 'Desativar' : 'Reativar'}</button></div></td></tr>`).join('')
        : `<tr><td colspan="4">${vazio({ icone: 'clock', titulo: 'Nenhum turno cadastrado' })}</td></tr>`}
    </tbody></table></div><div class="card-corpo"><button class="btn btn-primario" id="t-novo"><i data-lucide="plus"></i> Novo turno</button></div></div>`;
  const recarregar = async () => { corpo.innerHTML = carregando(); await abaTurnos(corpo); icones(); };
  const form = (t = {}) => {
    const { el: m, fechar } = abrirModal({
      titulo: t.id ? `Editar ${t.name}` : 'Novo turno',
      html: `<form id="f-turno" class="grade" style="gap:12px">
        <div class="campo"><label for="t-n">Nome *</label><input id="t-n" required maxlength="40" value="${esc(t.name || '')}" placeholder="Ex.: Turno A"></div>
        <div class="grade grade-2"><div class="campo"><label for="t-i">Início *</label><input id="t-i" type="time" required value="${hora(t.start_time)}"></div>
          <div class="campo"><label for="t-f">Fim *</label><input id="t-f" type="time" required value="${hora(t.end_time)}"></div></div>
        <div class="campo"><label for="t-o">Ordem na lista</label><input id="t-o" type="number" min="0" max="99" value="${t.sort_order ?? lista.length + 1}"></div>
        <p class="small muted" style="margin:0">Se o fim for antes do início (ex.: 22:00 – 06:00), o turno termina no dia seguinte.</p><div id="t-msg"></div></form>`,
      rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" form="f-turno" type="submit">Salvar</button>',
    });
    m.querySelector('#f-turno').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = { name: m.querySelector('#t-n').value.trim(), start_time: m.querySelector('#t-i').value, end_time: m.querySelector('#t-f').value, sort_order: Number(m.querySelector('#t-o').value || 0) };
      try { if (t.id) await pr.salvarTurno(t.id, d); else await pr.criarTurno(d); fechar(); toast('Turno salvo.'); recarregar(); }
      catch (err) { m.querySelector('#t-msg').innerHTML = `<div class="alerta perigo">${esc(/nome_idx|duplicate/i.test(err.message) ? 'Já existe um turno ativo com esse nome.' : traduzirErro(err))}</div>`; }
    });
  };
  corpo.querySelector('#t-novo').onclick = () => form();
  corpo.onclick = async (ev) => {
    const e = ev.target.closest('[data-editar]'); const a = ev.target.closest('[data-ativo]');
    if (e) form(lista.find((t) => t.id === e.dataset.editar));
    if (a) { const t = lista.find((x) => x.id === a.dataset.ativo);
      try { await pr.salvarTurno(t.id, { active: !t.active }); toast(t.active ? 'Turno desativado.' : 'Turno reativado.'); recarregar(); } catch (err) { toast(traduzirErro(err), 'erro'); } }
  };
}
