// =====================================================================
// Programação semanal — o que cada colaborador da manutenção faz em cada
// dia (como a "ficha semanal individual" do Excel), com o resultado de
// cada atividade e a eficiência da semana.
// =====================================================================
import { pode, store } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, vazio, fmtData, hojeISO, addDias, carregando, erroCarga, confirmar } from '../ui.js';
import * as pg from '../services/programacao.js';
import * as pe from '../services/pendencias.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { listar as listarOS, STATUS_OS, TIPO_OS } from '../services/ordens.js';
import { equipamentosParaEscolher } from '../plantas.js';
import { excecoes } from '../services/indicadores.js';
import { imprimirFichas } from './ficha-semanal.js';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const dataDe = (iso) => new Date(`${iso}T12:00:00`);
const segundaDe = (iso) => { const d = dataDe(iso).getDay(); return addDias(iso, d === 0 ? -6 : 1 - d); };
const diaCurto = (iso) => `${DIAS[dataDe(iso).getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const esp = (k) => (k && pe.ESPECIALIDADE[k] ? pe.ESPECIALIDADE[k].nome : '');
// OS que ainda podem ir para a programação
const OS_ABERTAS = ['aberta', 'aprovada', 'planejada', 'em_execucao', 'aguardando_pecas', 'aguardando_terceiros'];
const badgeOS = (st) => (st && STATUS_OS[st] ? `<span class="badge ${STATUS_OS[st].classe}">${esc(STATUS_OS[st].nome)}</span>` : '');

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let semana = segundaDe(/^\d{4}-\d{2}-\d{2}$/.test(params.get('semana') || '') ? params.get('semana') : hojeISO());
  const gestor = pode('schedule.manage');

  el.innerHTML = `
    <a class="voltar" href="#/pendencias"><i data-lucide="arrow-left"></i> Pendências</a>
    <div class="cabecalho-pagina"><div><h1>Programação semanal</h1>
      <p>O que cada colaborador da manutenção faz em cada dia. Marque o resultado de cada atividade: feita ou não feita (com o motivo).</p></div>
      <div class="acoes">
        <button class="btn" id="btn-imprimir"><i data-lucide="printer"></i> Imprimir fichas</button>
        ${gestor ? '<button class="btn" id="btn-colab"><i data-lucide="users"></i> Colaboradores</button>' : ''}
        ${gestor ? '<button class="btn btn-primario" id="btn-programar"><i data-lucide="calendar-plus"></i> Programar atividade</button>' : ''}
      </div></div>
    <div id="prog-kpis" class="grade prog-kpis"></div>
    <div id="prog-reprog"></div>
    <div class="card semana-nav secao"><div class="card-corpo">
      <button class="btn btn-icone" id="sem-ant" aria-label="Semana anterior"><i data-lucide="chevron-left"></i></button>
      <div class="semana-titulo"><b id="sem-txt"></b><span class="small muted" id="sem-sub"></span></div>
      <button class="btn btn-icone" id="sem-prox" aria-label="Próxima semana"><i data-lucide="chevron-right"></i></button>
      <button class="btn btn-sm btn-texto" id="sem-hoje">Esta semana</button>
    </div></div>
    <div id="prog-corpo">${carregando()}</div>`;

  const corpo = el.querySelector('#prog-corpo');
  const kpis = el.querySelector('#prog-kpis');
  let colabs = [], itens = [], pendentes = [];
  const boxReprog = el.querySelector('#prog-reprog');
  // depois de reprogramar, vai para a semana do novo dia
  const irPara = (dia) => { if (dia) semana = segundaDe(dia); carregar(); };

  const carregar = async () => {
    const fim = addDias(semana, 6);
    history.replaceState(null, '', `${location.pathname}${location.search}#/programacao?semana=${semana}`);
    el.querySelector('#sem-txt').textContent = `Semana de ${fmtData(semana).slice(0, 5)} a ${fmtData(addDias(semana, 4))}`;
    el.querySelector('#sem-sub').textContent = semana === segundaDe(hojeISO()) ? 'esta semana' : '';
    el.querySelector('#sem-hoje').style.display = semana === segundaDe(hojeISO()) ? 'none' : '';
    try {
      [colabs, itens, pendentes] = await Promise.all([pg.colaboradores(), pg.daSemana(semana, fim), pg.aReprogramar().catch(() => [])]);
    } catch (err) { kpis.innerHTML = ''; corpo.innerHTML = erroCarga(err); icones(); return; }
    desenhar();
  };

  const desenharReprog = () => {
    if (!pendentes.length) { boxReprog.innerHTML = ''; return; }
    boxReprog.innerHTML = `<div class="card secao card-reprog"><div class="card-titulo"><h3><i data-lucide="calendar-x"></i> Não feitas a reprogramar <span class="contador">${pendentes.length}</span></h3>
        <span class="muted small">${gestor ? 'escolha um novo dia ou dispense' : 'quem programa vai escolher um novo dia'}</span></div>
      <div class="card-corpo"><ul class="lista-reprog">${pendentes.map((i) => `<li>
        <span class="reprog-dia">${diaCurto(i.scheduled_date)}<span class="small muted">${fmtData(i.scheduled_date).slice(6)}</span></span>
        <div class="reprog-txt"><b>${i.work_order_number ? `<span class="ativ-os">${esc(i.work_order_number)}</span> ` : ''}${esc(i.title)}</b>${i.equipment_tag && !i.title.toUpperCase().includes(i.equipment_tag.toUpperCase()) ? ` <span class="muted">${esc(i.equipment_tag)}</span>` : ''}
          <div class="small muted">${esc(i.staff_name)} · <span class="reprog-motivo">${esc(i.result_note || 'sem motivo')}</span></div></div>
        ${gestor ? `<span class="acoes"><button class="btn btn-sm btn-primario" data-reprog="${i.id}"><i data-lucide="calendar-plus"></i> Reprogramar</button>
          <button class="btn btn-sm btn-texto" data-dispensar="${i.id}">Não reprogramar</button></span>` : ''}</li>`).join('')}</ul></div></div>`;
  };
  boxReprog.addEventListener('click', async (ev) => {
    const r = ev.target.closest('[data-reprog]');
    if (r) { abrirReprogramar({ item: pendentes.find((x) => x.id === r.dataset.reprog), colabs, depois: irPara }); return; }
    const d = ev.target.closest('[data-dispensar]'); if (!d) return;
    const i = pendentes.find((x) => x.id === d.dataset.dispensar);
    if (!(await confirmar({ titulo: 'Não reprogramar', mensagem: `"<b>${esc(i.title)}</b>" (${esc(i.staff_name)}, ${diaCurto(i.scheduled_date)}) sai desta lista e não volta para a programação.${i.pending_task_id ? ' A pendência continua aberta na lista de pendências.' : ''}`, botao: 'Não reprogramar' }))) return;
    try { await pg.dispensar(i.id); toast('Pronto: não vai ser reprogramada.'); carregar(); } catch (err) { toast(traduzirErro(err), 'erro'); }
  });

  const desenhar = () => {
    desenharReprog();
    const hoje = hojeISO();
    const fimDeSemana = itens.some((i) => [5, 6].includes((dataDe(i.scheduled_date).getDay() + 6) % 7));
    const dias = Array.from({ length: fimDeSemana ? 7 : 5 }, (_, k) => addDias(semana, k));
    const eu = store.perfil?.id;
    // colaboradores ativos + inativos que têm atividade na semana; o próprio primeiro
    const linhas = colabs.filter((c) => c.active || itens.some((i) => i.staff_id === c.id))
      .sort((a, b) => (b.profile_id === eu) - (a.profile_id === eu));
    if (!colabs.length) {
      kpis.innerHTML = '';
      corpo.innerHTML = `<div class="card">${vazio({ icone: 'users', titulo: 'Nenhum colaborador cadastrado',
        texto: gestor ? 'Cadastre os mecânicos e eletricistas da manutenção. Não precisam ter conta no sistema.' : 'Quem programa ainda não cadastrou a equipe.',
        acao: gestor ? '<button class="btn btn-primario" data-colab><i data-lucide="user-plus"></i> Cadastrar colaboradores</button>' : '' })}</div>`;
      icones(); return;
    }
    // eficiência: só conta o que já tem resultado ou cujo dia já passou (não pune o resto da semana)
    const contaEf = (i) => i.status !== 'programada' || i.scheduled_date < hoje;
    const resumo = (cid) => {
      const xs = itens.filter((i) => i.staff_id === cid);
      const feitas = xs.filter((i) => i.status === 'feita').length;
      const nao = xs.filter((i) => i.status === 'nao_feita').length;
      const atras = xs.filter((i) => i.status === 'programada' && i.scheduled_date < hoje).length;
      return { total: xs.length, feitas, nao, atras, ef: pct(feitas, xs.filter(contaEf).length) };
    };
    const feitasT = itens.filter((i) => i.status === 'feita').length;
    const tot = { total: itens.length, feitas: feitasT, nao: itens.filter((i) => i.status === 'nao_feita').length,
      atras: itens.filter((i) => i.status === 'programada' && i.scheduled_date < hoje).length, ef: pct(feitasT, itens.filter(contaEf).length) };
    const selo = (ef) => (ef == null ? '<span class="muted">—</span>' : `<span class="ef ${ef >= 85 ? 'bom' : ef >= 60 ? 'alerta' : 'ruim'}">${ef}%</span>`);
    const ativ = (i) => {
      const s = pg.STATUS_PROG[i.status];
      const atrasada = i.status === 'programada' && i.scheduled_date < hoje;
      return `<button class="ativ ${i.status}${atrasada ? ' atrasada' : ''}" data-item="${i.id}" title="${esc(s.nome)}${i.result_note ? ` — ${esc(i.result_note)}` : ''}">
        <i data-lucide="${s.icone}"></i><span class="ativ-txt">${i.rescheduled_from_id ? `<span class="ativ-reprog" title="Reprogramada de ${diaCurto(i.rescheduled_from_date || i.scheduled_date)}">↻</span> ` : ''}${i.status === 'nao_feita' && i.rescheduled_to_date ? `<span class="ativ-reprog">→ ${diaCurto(i.rescheduled_to_date)}</span> ` : ''}${i.work_order_number ? `<span class="ativ-os">${esc(i.work_order_number)}</span> ` : ''}${esc(i.title)}${i.equipment_tag && !i.title.toUpperCase().includes(i.equipment_tag.toUpperCase()) ? ` <b>${esc(i.equipment_tag)}</b>` : ''}</span></button>`;
    };

    kpis.innerHTML = `
        <div class="card kpi"><span class="rotulo"><i data-lucide="calendar-range"></i>Programadas</span><span class="valor">${tot.total}</span><span class="detalhe">${linhas.length} colaborador${linhas.length === 1 ? '' : 'es'}</span></div>
        <div class="card kpi"><span class="rotulo"><i data-lucide="circle-check"></i>Feitas</span><span class="valor">${tot.feitas}</span><span class="detalhe">${tot.nao} não feita${tot.nao === 1 ? '' : 's'}</span></div>
        <div class="card kpi ${tot.atras ? 'kpi-aviso' : ''}"><span class="rotulo"><i data-lucide="clock"></i>Sem resultado</span><span class="valor">${tot.atras}</span><span class="detalhe">dias que já passaram</span></div>
        <div class="card kpi"><span class="rotulo"><i data-lucide="gauge"></i>Eficiência da semana</span><span class="valor">${tot.ef == null ? '—' : `${tot.ef}%`}</span><span class="detalhe">feitas ÷ programadas até agora</span></div>`;
    corpo.innerHTML = `
      <div class="card prog-quadro" style="--dias:${dias.length}">
        <div class="prog-linha prog-cab"><div class="prog-pessoa">Colaborador</div>
          ${dias.map((d) => `<div class="prog-dia ${d === hoje ? 'hoje' : ''}">${diaCurto(d)}</div>`).join('')}</div>
        ${linhas.map((c) => {
          const r = resumo(c.id);
          return `<div class="prog-linha ${c.profile_id === eu ? 'minha' : ''}">
            <div class="prog-pessoa"><b>${esc(c.name)}</b>${c.profile_id === eu ? ' <span class="badge info">você</span>' : ''}
              <span class="small muted">${esc([c.job_title, c.active ? '' : 'inativo'].filter(Boolean).join(' · '))}</span>
              <span class="small prog-ef">${r.feitas}/${r.total} feitas · ${selo(r.ef)}</span></div>
            ${dias.map((d) => {
              const xs = itens.filter((i) => i.staff_id === c.id && i.scheduled_date === d);
              return `<div class="prog-celula ${d === hoje ? 'hoje' : ''}" data-rotulo="${diaCurto(d)}">
                ${xs.map(ativ).join('')}
                ${gestor && c.active ? `<button class="prog-mais" data-add="${c.id}" data-dia="${d}" aria-label="Programar para ${esc(c.name)} em ${diaCurto(d)}"><i data-lucide="plus"></i></button>` : ''}
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
      <p class="small muted secao"><i data-lucide="info" style="width:14px;height:14px;vertical-align:-2px"></i>
        ${gestor ? 'Clique no <b>+</b> do dia para programar. Clique numa atividade para registrar o resultado, mudar o dia ou tirar da programação.'
          : 'Clique na sua atividade para marcar como feita ou não feita.'}</p>`;
    icones();
  };

  const mover = (n) => { semana = addDias(semana, 7 * n); corpo.innerHTML = carregando(); carregar(); };
  el.querySelector('#sem-ant').onclick = () => mover(-1);
  el.querySelector('#sem-prox').onclick = () => mover(1);
  el.querySelector('#sem-hoje').onclick = () => { semana = segundaDe(hojeISO()); corpo.innerHTML = carregando(); carregar(); };
  el.querySelector('#btn-programar')?.addEventListener('click', () => abrirProgramar({ colabs, dia: semana < hojeISO() && addDias(semana, 6) >= hojeISO() ? hojeISO() : semana, itens, depois: carregar }));
  el.querySelector('#btn-imprimir').addEventListener('click', () => escolherFichas({ semana, colabs, itens }));
  const abrirColabs = () => gerenciarColaboradores({ colabs, depois: carregar });
  el.querySelector('#btn-colab')?.addEventListener('click', abrirColabs);
  corpo.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-colab]')) { abrirColabs(); return; }
    const add = ev.target.closest('[data-add]');
    if (add) { abrirProgramar({ colabs, staffId: add.dataset.add, dia: add.dataset.dia, itens, depois: carregar }); return; }
    const it = ev.target.closest('[data-item]');
    if (it) abrirAtividade({ item: itens.find((i) => i.id === it.dataset.item), colabs, gestor, depois: irPara });
  });
  await carregar();
}

// ---------------------------------------------------------------------
// Programar atividade (pendência da lista ou outra atividade)
// ---------------------------------------------------------------------
async function abrirProgramar({ colabs, staffId = '', dia, itens, depois }) {
  const [pends, eqs, oss, osProg] = await Promise.all([pe.listar(), listarEquipamentos(), listarOS().catch(() => []), pg.osProgramadas().catch(() => [])]);
  const abertas = pends.filter((p) => pe.ABERTAS.includes(p.status));
  const progOS = new Map(); osProg.forEach((x) => { if (!progOS.has(x.work_order_id)) progOS.set(x.work_order_id, x); });
  const osAbertas = oss.filter((o) => OS_ABERTAS.includes(o.status));
  const ativos = colabs.filter((c) => c.active);
  const { el, fechar } = abrirModal({
    titulo: 'Programar atividade', largo: true,
    html: `<form id="f-prog" class="grade" style="gap:14px">
      <div class="grade grade-form">
        <div class="campo"><label for="pr-col">Colaborador *</label><select id="pr-col" name="col" required><option value="">Selecione…</option>
          ${ativos.map((c) => `<option value="${c.id}" ${c.id === staffId ? 'selected' : ''}>${esc(c.name)}${c.job_title ? ` (${esc(c.job_title)})` : ''}</option>`).join('')}</select></div>
        <div class="campo"><label for="pr-dia">Dia *</label><input id="pr-dia" name="dia" type="date" required value="${dia}"></div>
        <div class="campo"><label>O que vai fazer</label>
          <div class="abas-acesso" role="tablist"><button type="button" class="ativa" data-tipo="pend">Pendência</button><button type="button" data-tipo="os">OS</button><button type="button" data-tipo="livre">Outra</button></div></div>
      </div>
      <div id="pr-pend" class="grade" style="gap:10px">
        <div class="filtros-prog">
          <input id="pr-busca" type="search" placeholder="Buscar por TAG ou texto…" aria-label="Buscar pendência">
          <label class="check-linha"><input type="checkbox" id="pr-esp" checked> Só da especialidade do colaborador</label>
          <label class="check-linha"><input type="checkbox" id="pr-livres" checked> Esconder as já programadas</label>
        </div>
        <div class="lista-escolha" id="pr-lista" role="listbox" aria-label="Pendências abertas"></div>
      </div>
      <div id="pr-os" class="grade oculto" style="gap:10px">
        <div class="filtros-prog">
          <input id="pr-os-busca" type="search" placeholder="Buscar por número, TAG ou texto…" aria-label="Buscar OS">
          <select id="pr-os-tipo" aria-label="Tipo de OS"><option value="">Todos os tipos</option>${Object.entries(TIPO_OS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
          <label class="check-linha"><input type="checkbox" id="pr-os-livres" checked> Esconder as já programadas</label>
        </div>
        <div class="lista-escolha" id="pr-os-lista" role="listbox" aria-label="Ordens de serviço em aberto"></div>
      </div>
      <div id="pr-livre" class="grade grade-form oculto">
        <div class="campo campo-largo"><label for="pr-tit">Atividade *</label><input id="pr-tit" name="tit" maxlength="300" placeholder="Ex.: Preventiva + lubrificação G01"></div>
        <div class="campo"><label for="pr-eq">Equipamento</label><select id="pr-eq" name="eq"><option value="">Nenhum</option>
          ${equipamentosParaEscolher(eqs).map((e) => `<option value="${e.id}">${esc(e.tag)} — ${esc(e.name)}</option>`).join('')}</select></div>
      </div>
      <div id="msg-prog"></div></form>`,
    rodape: `<span class="small muted" id="pr-sel-n" style="margin-right:auto"></span><button class="btn" data-fechar>Cancelar</button>
      <button class="btn btn-primario" type="submit" form="f-prog">Programar</button>`,
  });
  const f = el.querySelector('form');
  let tipo = 'pend';
  const escolhidas = new Set();
  const osEscolhidas = new Set();
  const listaOS = el.querySelector('#pr-os-lista');
  const desenharOS = () => {
    const t = el.querySelector('#pr-os-busca').value.trim().toLowerCase();
    const tp = el.querySelector('#pr-os-tipo').value;
    const ordemPri = { urgente: 0, alta: 1, media: 2, baixa: 3 };
    const r = osAbertas.filter((o) => (!tp || o.type === tp)
      && (!el.querySelector('#pr-os-livres').checked || !progOS.has(o.id) || osEscolhidas.has(o.id))
      && (!t || [o.number, o.title, o.equipment_tag, o.equipment_name].some((v) => String(v || '').toLowerCase().includes(t))))
      .sort((a, b) => (ordemPri[a.priority] - ordemPri[b.priority]) || String(a.due_date || '9').localeCompare(String(b.due_date || '9')) || String(a.number).localeCompare(String(b.number)));
    listaOS.innerHTML = r.length ? r.slice(0, 200).map((o) => { const pr = progOS.get(o.id); return `<label class="escolha ${osEscolhidas.has(o.id) ? 'sel' : ''}">
        <input type="checkbox" value="${o.id}" ${osEscolhidas.has(o.id) ? 'checked' : ''}>
        <span><b>${esc(o.number)}</b> · <b>${esc(o.equipment_tag || '')}</b> ${esc(o.title)}
          <span class="small muted">${[TIPO_OS[o.type], STATUS_OS[o.status]?.nome, o.due_date ? `prazo ${fmtData(o.due_date).slice(0, 5)}` : '', pr ? `já programada ${diaCurto(pr.scheduled_date)} · ${pr.staff_name}` : ''].filter(Boolean).map(esc).join(' · ')}</span></span></label>`; }).join('')
      : '<p class="muted small" style="margin:8px">Nenhuma OS em aberto com esses filtros.</p>';
    el.querySelector('#pr-sel-n').textContent = tipo === 'os' && osEscolhidas.size ? `${osEscolhidas.size} selecionada${osEscolhidas.size === 1 ? '' : 's'}` : '';
  };
  listaOS.addEventListener('change', (ev) => { const v = ev.target.value; if (ev.target.checked) osEscolhidas.add(v); else osEscolhidas.delete(v); desenharOS(); });
  ['#pr-os-busca', '#pr-os-tipo', '#pr-os-livres'].forEach((x) => el.querySelector(x).addEventListener(x === '#pr-os-busca' ? 'input' : 'change', desenharOS));
  const lista = el.querySelector('#pr-lista');
  const desenharLista = () => {
    const c = colabs.find((x) => x.id === f.col.value);
    const t = el.querySelector('#pr-busca').value.trim().toLowerCase();
    const soEsp = el.querySelector('#pr-esp').checked && c?.specialty && c.specialty !== 'ambos';
    const r = abertas.filter((p) => (!soEsp || !p.specialty || p.specialty === c.specialty || p.specialty === 'ambos')
      && (!el.querySelector('#pr-livres').checked || !p.next_schedule_date || escolhidas.has(p.id))
      && (!t || [p.title, p.equipment_tag, p.description].some((v) => String(v || '').toLowerCase().includes(t))))
      .sort((a, b) => String(a.equipment_tag || '~').localeCompare(String(b.equipment_tag || '~')) || a.title.localeCompare(b.title));
    lista.innerHTML = r.length ? r.slice(0, 200).map((p) => `<label class="escolha ${escolhidas.has(p.id) ? 'sel' : ''}">
        <input type="checkbox" value="${p.id}" ${escolhidas.has(p.id) ? 'checked' : ''}>
        <span><b>${esc(p.equipment_tag || 'Sem TAG')}</b> ${esc(p.title)}
          <span class="small muted">${[esp(p.specialty), p.next_schedule_date ? `já programada ${diaCurto(p.next_schedule_date)} · ${p.next_schedule_staff}` : ''].filter(Boolean).map(esc).join(' · ')}</span></span></label>`).join('')
      : '<p class="muted small" style="margin:8px">Nenhuma pendência aberta com esses filtros.</p>';
    el.querySelector('#pr-sel-n').textContent = tipo === 'pend' && escolhidas.size ? `${escolhidas.size} selecionada${escolhidas.size === 1 ? '' : 's'}` : '';
  };
  lista.addEventListener('change', (ev) => { const v = ev.target.value; if (ev.target.checked) escolhidas.add(v); else escolhidas.delete(v); desenharLista(); });
  ['#pr-busca', '#pr-esp', '#pr-livres'].forEach((s) => el.querySelector(s).addEventListener(s === '#pr-busca' ? 'input' : 'change', desenharLista));
  f.col.addEventListener('change', desenharLista);
  el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => {
    tipo = b.dataset.tipo;
    el.querySelectorAll('[data-tipo]').forEach((x) => x.classList.toggle('ativa', x === b));
    el.querySelector('#pr-pend').classList.toggle('oculto', tipo !== 'pend');
    el.querySelector('#pr-livre').classList.toggle('oculto', tipo !== 'livre');
    el.querySelector('#pr-os').classList.toggle('oculto', tipo !== 'os');
    f.tit.required = tipo === 'livre';
    if (tipo === 'os') desenharOS(); else desenharLista();
  }));
  desenharLista();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      if (!f.col.value) throw new Error('Escolha o colaborador.');
      let pos = Math.max(0, ...itens.filter((i) => i.staff_id === f.col.value && i.scheduled_date === f.dia.value).map((i) => i.position)) + 1;
      if (tipo === 'pend') {
        if (!escolhidas.size) throw new Error('Marque pelo menos uma pendência da lista.');
        for (const id of escolhidas) {
          const p = abertas.find((x) => x.id === id);
          await pg.programar({ staff_id: f.col.value, scheduled_date: f.dia.value, position: pos++, title: p.title, pending_task_id: p.id, equipment_id: p.equipment_id });
        }
      } else if (tipo === 'os') {
        if (!osEscolhidas.size) throw new Error('Marque pelo menos uma OS da lista.');
        for (const id of osEscolhidas) {
          const o = osAbertas.find((x) => x.id === id);
          await pg.programar({ staff_id: f.col.value, scheduled_date: f.dia.value, position: pos++, title: o.title, work_order_id: o.id, equipment_id: o.equipment_id });
        }
      } else {
        await pg.programar({ staff_id: f.col.value, scheduled_date: f.dia.value, position: pos, title: f.tit.value.trim(), equipment_id: f.eq.value || null });
      }
      const n = tipo === 'pend' ? escolhidas.size : tipo === 'os' ? osEscolhidas.size : 1;
      toast(n > 1 ? `${n} atividades programadas.` : 'Atividade programada.');
      fechar(); depois?.();
    } catch (err) {
      el.querySelector('#msg-prog').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Atividade: resultado, mudar dia/colaborador, tirar da programação
// ---------------------------------------------------------------------
function abrirAtividade({ item: i, colabs, gestor, depois }) {
  const minha = colabs.find((c) => c.id === i.staff_id)?.profile_id === store.perfil?.id;
  const registra = gestor || minha;
  const pendAberta = i.pending_task_id && pe.ABERTAS.includes(i.pending_status);
  // quem programa pode ligar (ou trocar) a pendência; a lista chega depois de abrir
  const ligar = gestor;
  const { el, fechar } = abrirModal({
    titulo: 'Atividade programada',
    html: `<form id="f-ativ" class="grade" style="gap:14px">
      <div><b>${esc(i.title)}</b>
        <div class="small muted">${esc(i.staff_name)} · ${diaCurto(i.scheduled_date)}${i.equipment_tag ? ` · ${esc(i.equipment_tag)} — ${esc(i.equipment_name || '')}` : ''}</div>
        ${i.pending_task_id ? `<div class="small" style="margin-top:6px"><a href="#/pendencias/${i.pending_task_id}"><i data-lucide="list-todo" style="width:14px;height:14px;vertical-align:-2px"></i> Ver a pendência</a>
          ${i.pending_status ? `· ${esc(pe.STATUS_PEND[i.pending_status]?.nome || '')}` : ''}</div>` : ''}
        ${i.work_order_id ? `<div class="small" style="margin-top:6px"><a href="#/ordens/${i.work_order_id}"><i data-lucide="clipboard-list" style="width:14px;height:14px;vertical-align:-2px"></i> Ver a ${esc(i.work_order_number || 'OS')}</a>
          ${badgeOS(i.work_order_status)}</div>` : ''}
        ${i.rescheduled_from_id ? `<div class="small" style="margin-top:6px"><span class="ativ-reprog">↻</span> Reprogramada: não foi feita em ${diaCurto(i.rescheduled_from_date || i.scheduled_date)}.</div>` : ''}
        ${i.rescheduled_to_date ? `<div class="small" style="margin-top:6px"><span class="ativ-reprog">→</span> Reprogramada para <b>${diaCurto(i.rescheduled_to_date)}</b> (${esc(i.rescheduled_to_staff || '')}).</div>` : ''}
        ${i.status !== 'programada' ? `<div class="small muted" style="margin-top:6px">Registrado por ${esc(i.done_by_name || '—')}${i.done_at ? ` em ${new Date(i.done_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</div>` : ''}
      </div>
      ${registra ? `
      <div class="campo"><label>Resultado</label>
        <div class="abas-acesso" role="radiogroup">${Object.entries(pg.STATUS_PROG).map(([k, s]) => `<button type="button" data-res="${k}" class="${i.status === k ? 'ativa' : ''}"><i data-lucide="${s.icone}" style="width:15px;height:15px;vertical-align:-3px"></i> ${s.nome}</button>`).join('')}</div></div>
      <div class="campo"><label for="at-obs" id="at-obs-rot">Observação</label><textarea id="at-obs" name="obs" rows="2" maxlength="1000" placeholder="Opcional">${esc(i.result_note || '')}</textarea></div>
      ${pendAberta || ligar ? '<label class="check-linha oculto" id="at-conc-l"><input type="checkbox" id="at-conc" checked> Concluir também a pendência (o problema foi resolvido)</label>' : ''}
      ${gestor && !i.rescheduled_to_id ? `<fieldset class="bloco-reprog oculto" id="at-reprog"><legend><label class="check-linha" style="margin:0"><input type="checkbox" id="at-rp" checked> <b>Reprogramar</b></label></legend>
        <div class="grade grade-form">
          <div class="campo"><label for="at-rp-dia">Novo dia</label><input id="at-rp-dia" type="date" value="${pg.proxDiaUtil(i.scheduled_date > hojeISO() ? i.scheduled_date : hojeISO())}"></div>
          <div class="campo"><label for="at-rp-col">Colaborador</label><select id="at-rp-col">${colabs.filter((c) => c.active).map((c) => `<option value="${c.id}" ${c.id === i.staff_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        </div>
        <span class="small muted">Desmarque se não precisa voltar. Ela fica na lista "Não feitas a reprogramar" até você decidir.</span></fieldset>` : ''}
      <div class="alerta info oculto" id="at-os-aviso"><i data-lucide="clipboard-list"></i><div>A OS não muda sozinha. Depois de salvar, abra a OS para
        lançar a mão de obra e <b>finalizar o atendimento</b> (o que foi feito).</div></div>`
    : `<p class="muted small" style="margin:0">Só quem programa ou o próprio colaborador registram o resultado.</p>`}
      ${ligar ? `<div class="campo"><label for="at-pend"><i data-lucide="link" style="width:14px;height:14px;vertical-align:-2px"></i> ${i.pending_task_id || i.work_order_id ? 'Ligada a' : 'Ligar a uma OS ou pendência'}</label>
        <select id="at-pend" name="pend" disabled><option value="">Carregando…</option></select>
        <span class="small muted" id="at-pend-dica"></span></div>` : ''}
      ${gestor ? `<details class="secao-det"${i.status === 'programada' ? '' : ' hidden'}><summary>Mudar dia ou colaborador</summary>
        <div class="grade grade-form" style="margin-top:10px">
          <div class="campo"><label for="at-col">Colaborador</label><select id="at-col" name="col">${colabs.filter((c) => c.active || c.id === i.staff_id).map((c) => `<option value="${c.id}" ${c.id === i.staff_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="campo"><label for="at-dia">Dia</label><input id="at-dia" name="dia" type="date" value="${i.scheduled_date}"></div>
        </div></details>` : ''}
      <div id="msg-ativ"></div></form>`,
    rodape: `${gestor && i.status === 'programada' ? '<button class="btn btn-texto" id="at-remover" style="margin-right:auto"><i data-lucide="trash-2"></i> Tirar da programação</button>' : ''}
      <button class="btn" data-fechar>Voltar</button>${registra ? '<button class="btn btn-primario" type="submit" form="f-ativ">Salvar</button>' : ''}`,
  });
  const f = el.querySelector('form');
  // "Ver a OS" / "Ver a pendência": fecha a janela ao ir para a outra tela
  el.querySelectorAll('a[href^="#/"]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); const h = a.getAttribute('href'); fechar(); location.hash = h; }));
  let res = i.status;
  const ajustar = () => {
    el.querySelectorAll('[data-res]').forEach((b) => b.classList.toggle('ativa', b.dataset.res === res));
    const obs = el.querySelector('#at-obs');
    if (obs) {
      obs.required = res === 'nao_feita'; obs.minLength = res === 'nao_feita' ? 5 : 0;
      el.querySelector('#at-obs-rot').textContent = res === 'nao_feita' ? 'Por que não foi feita? *' : 'Observação';
      obs.placeholder = res === 'nao_feita' ? 'Ex.: faltou peça; máquina não foi liberada pela produção' : res === 'feita' ? 'Opcional. Ex.: trocado o retentor' : 'Opcional';
    }
    const v = f.pend && !f.pend.disabled ? f.pend.value : i.work_order_id ? `os:${i.work_order_id}` : i.pending_task_id ? `pe:${i.pending_task_id}` : '';
    const temPend = v.startsWith('pe:') && (f.pend && !f.pend.disabled ? f.pend.selectedOptions[0]?.dataset.aberta === '1' : pendAberta);
    el.querySelector('#at-conc-l')?.classList.toggle('oculto', res !== 'feita' || !temPend);
    el.querySelector('#at-os-aviso')?.classList.toggle('oculto', res !== 'feita' || !v.startsWith('os:'));
    el.querySelector('#at-reprog')?.classList.toggle('oculto', res !== 'nao_feita');
  };
  el.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', () => { res = b.dataset.res; ajustar(); }));
  ajustar();
  if (ligar) {
    // OS e pendências abertas do mesmo equipamento (sem equipamento: todas)
    Promise.all([
      (i.equipment_id ? pe.doEquipamento(i.equipment_id) : pe.listar()),
      listarOS().then((l) => (i.equipment_id ? l.filter((o) => o.equipment_id === i.equipment_id) : l)),
    ]).then(([ps, oss]) => {
      const tagDe = (x) => (!i.equipment_id && x.equipment_tag ? `${x.equipment_tag} — ` : '');
      const pend = ps.filter((p) => pe.ABERTAS.includes(p.status) && p.id !== i.pending_task_id)
        .sort((a, b) => String(a.equipment_tag || '').localeCompare(String(b.equipment_tag || '')) || a.title.localeCompare(b.title, 'pt-BR'));
      const ordens = oss.filter((o) => OS_ABERTAS.includes(o.status) && o.id !== i.work_order_id)
        .sort((a, b) => String(a.number).localeCompare(String(b.number)));
      const opP = (p, sel) => `<option value="pe:${p.id}" data-aberta="${pe.ABERTAS.includes(p.status) ? 1 : 0}" ${sel ? 'selected' : ''}>${esc(`${tagDe(p)}${p.title}`)}${p.next_schedule_date && !sel ? ` (programada ${fmtData(p.next_schedule_date).slice(0, 5)})` : ''}</option>`;
      const opO = (o, sel) => `<option value="os:${o.id}" ${sel ? 'selected' : ''}>${esc(`${o.number} · ${tagDe(o)}${o.title}`)}${o.status && STATUS_OS[o.status] ? ` (${STATUS_OS[o.status].nome})` : ''}</option>`;
      const atual = i.work_order_id ? opO({ id: i.work_order_id, number: i.work_order_number, title: i.work_order_title || i.title, status: i.work_order_status }, true)
        : i.pending_task_id ? opP({ id: i.pending_task_id, title: i.pending_title || 'Pendência atual', status: i.pending_status }, true) : '';
      f.pend.innerHTML = `<option value="">${atual ? 'Nenhuma (desligar)' : 'Nenhuma'}</option>${atual}
        ${ordens.length ? `<optgroup label="Ordens de serviço">${ordens.map((o) => opO(o, false)).join('')}</optgroup>` : ''}
        ${pend.length ? `<optgroup label="Pendências">${pend.map((p) => opP(p, false)).join('')}</optgroup>` : ''}`;
      f.pend.disabled = false;
      el.querySelector('#at-pend-dica').textContent = ordens.length || pend.length || atual ? ''
        : (i.equipment_id ? 'Nenhuma OS ou pendência aberta para este equipamento.' : 'Nenhuma OS ou pendência aberta.');
      f.pend.addEventListener('change', ajustar);
      ajustar();
    }).catch(() => { f.pend.innerHTML = '<option value="">Não foi possível carregar</option>'; });
  }
  el.querySelector('#at-remover')?.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Tirar da programação', mensagem: `Tirar "<b>${esc(i.title)}</b>" da programação de ${esc(i.staff_name)}? A pendência continua aberta na lista.`, botao: 'Tirar', perigo: true }))) return;
    try { await pg.remover(i.id); toast('Atividade tirada da programação.'); fechar(); depois?.(); } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const d = { status: res, result_note: f.obs?.value.trim() || null };
      if (gestor && f.col && res === 'programada') Object.assign(d, { staff_id: f.col.value, scheduled_date: f.dia.value });
      const lig = f.pend && !f.pend.disabled ? f.pend.value : null;
      const pendId = lig === null ? i.pending_task_id || null : lig.startsWith('pe:') ? lig.slice(3) : null;
      const osId = lig === null ? i.work_order_id || null : lig.startsWith('os:') ? lig.slice(3) : null;
      if (pendId !== (i.pending_task_id || null)) d.pending_task_id = pendId;
      if (osId !== (i.work_order_id || null)) d.work_order_id = osId;
      await pg.alterar(i.id, d);
      let aviso = res === 'feita' ? 'Atividade feita.' : res === 'nao_feita' ? 'Registrado: não feita.' : 'pending_task_id' in d || 'work_order_id' in d ? (pendId || osId ? `Atividade ligada à ${osId ? 'OS' : 'pendência'}.` : 'Atividade desligada.') : 'Atividade salva.';
      if (res === 'feita' && pendId && !el.querySelector('#at-conc-l')?.classList.contains('oculto') && el.querySelector('#at-conc')?.checked) {
        try { await pe.salvar(pendId, { status: 'concluida', done_note: d.result_note }); aviso = 'Atividade feita e pendência concluída.'; }
        catch (err) { toast(`Atividade salva, mas a pendência não foi concluída: ${traduzirErro(err)}`, 'erro'); }
      }
      let novoDia = null;
      if (res === 'nao_feita' && el.querySelector('#at-rp')?.checked) {
        const dia = el.querySelector('#at-rp-dia').value;
        if (!dia) throw new Error('Escolha o novo dia ou desmarque "Reprogramar".');
        try {
          await pg.reprogramar({ ...i, pending_task_id: pendId, work_order_id: osId }, { dia, staffId: el.querySelector('#at-rp-col').value });
          aviso = `Não feita. Reprogramada para ${diaCurto(dia)}.`; novoDia = dia;
        } catch (err) { toast(`Registrado como não feita, mas não foi reprogramada: ${traduzirErro(err)}`, 'erro'); }
      }
      toast(aviso); fechar(); depois?.(novoDia);
    } catch (err) {
      el.querySelector('#msg-ativ').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Reprogramar uma não feita (da lista "Não feitas a reprogramar")
// ---------------------------------------------------------------------
function abrirReprogramar({ item: i, colabs, depois }) {
  const { el, fechar } = abrirModal({
    titulo: 'Reprogramar atividade',
    html: `<form id="f-reprog" class="grade" style="gap:14px">
      <div><b>${i.work_order_number ? `<span class="ativ-os">${esc(i.work_order_number)}</span> ` : ''}${esc(i.title)}</b>
        <div class="small muted">Não feita em ${diaCurto(i.scheduled_date)} por ${esc(i.staff_name)}${i.equipment_tag ? ` · ${esc(i.equipment_tag)}` : ''}</div>
        <div class="small" style="margin-top:4px">Motivo: ${esc(i.result_note || '—')}</div></div>
      <div class="grade grade-form">
        <div class="campo"><label for="rp-dia">Novo dia *</label><input id="rp-dia" name="dia" type="date" required value="${pg.proxDiaUtil(hojeISO())}"></div>
        <div class="campo"><label for="rp-col">Colaborador *</label><select id="rp-col" name="col">${colabs.filter((c) => c.active).map((c) => `<option value="${c.id}" ${c.id === i.staff_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      </div>
      <p class="small muted" style="margin:0">A atividade nova continua ligada à mesma ${i.work_order_id ? 'OS' : i.pending_task_id ? 'pendência' : 'descrição'}.</p>
      <div id="msg-reprog"></div></form>`,
    rodape: '<button class="btn" data-fechar>Voltar</button><button class="btn btn-primario" type="submit" form="f-reprog"><i data-lucide="calendar-plus"></i> Reprogramar</button>',
  });
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      await pg.reprogramar(i, { dia: ev.target.dia.value, staffId: ev.target.col.value });
      toast(`Reprogramada para ${diaCurto(ev.target.dia.value)}.`); fechar(); depois?.(ev.target.dia.value);
    } catch (err) {
      el.querySelector('#msg-reprog').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
  icones();
}

// ---------------------------------------------------------------------
// Colaboradores da manutenção (com ou sem conta no sistema)
// ---------------------------------------------------------------------
async function gerenciarColaboradores({ colabs, depois }) {
  const pessoas = await pe.pessoasAtivas().catch(() => []);
  let editando = null;
  const { el } = abrirModal({
    titulo: 'Colaboradores da manutenção', largo: true,
    html: `<div id="col-lista"></div>
      <form id="f-col" class="grade card-corpo form-colab" style="gap:12px">
        <h3 id="col-tit" style="margin:0">Novo colaborador</h3>
        <div class="grade grade-form">
          <div class="campo"><label for="co-nome">Nome *</label><input id="co-nome" name="nome" required minlength="2" maxlength="120" placeholder="Ex.: José Gustavo"></div>
          <div class="campo"><label for="co-fun">Função</label><input id="co-fun" name="fun" maxlength="60" list="co-funcoes" placeholder="Ex.: Mecânico">
            <datalist id="co-funcoes"><option value="Mecânico"><option value="Eletricista"><option value="Mecânico de manutenção"><option value="Eletromecânico"><option value="Auxiliar de manutenção"></datalist></div>
          <div class="campo"><label for="co-esp">Especialidade</label><select id="co-esp" name="esp"><option value="">—</option>
            ${Object.entries(pe.ESPECIALIDADE).map(([k, v]) => `<option value="${k}">${esc(v.nome)}</option>`).join('')}</select></div>
          <div class="campo"><label for="co-conta">Conta no sistema</label><select id="co-conta" name="conta"><option value="">Não tem conta</option>
            ${pessoas.map((p) => `<option value="${p.id}">${esc(p.full_name)}</option>`).join('')}</select>
            <span class="ajuda">Com conta, a pessoa vê a própria programação e registra o resultado.</span></div>
        </div>
        <label class="check-linha oculto" id="co-ativo-l"><input type="checkbox" id="co-ativo" checked> Ativo (aparece na programação)</label>
        <div id="msg-col"></div>
        <div class="acoes"><button type="button" class="btn btn-texto oculto" id="co-cancelar">Cancelar edição</button><button class="btn btn-primario" type="submit" id="co-salvar">Cadastrar</button></div>
      </form>`,
    rodape: '<button class="btn" data-fechar>Fechar</button>',
  });
  const f = el.querySelector('form');
  const desenhar = () => {
    el.querySelector('#col-lista').innerHTML = colabs.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th>Nome</th><th>Função</th><th>Especialidade</th><th>Conta no sistema</th><th></th></tr></thead><tbody>
      ${colabs.map((c) => `<tr class="${c.active ? '' : 'muted'}"><td class="primaria"><b>${esc(c.name)}</b>${c.active ? '' : ' <span class="badge inativo">inativo</span>'}</td>
        <td data-rotulo="Função">${esc(c.job_title || '—')}</td><td data-rotulo="Especialidade">${esc(esp(c.specialty) || '—')}</td>
        <td data-rotulo="Conta">${esc(pessoas.find((p) => p.id === c.profile_id)?.full_name || (c.profile_id ? 'vinculada' : 'não tem'))}</td>
        <td><button class="btn btn-sm" data-ed="${c.id}"><i data-lucide="pencil"></i> Editar</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">Nenhum colaborador ainda. Cadastre abaixo.</p>';
    icones();
  };
  const limpar = () => {
    editando = null; f.reset();
    el.querySelector('#col-tit').textContent = 'Novo colaborador'; el.querySelector('#co-salvar').textContent = 'Cadastrar';
    el.querySelector('#co-ativo-l').classList.add('oculto'); el.querySelector('#co-cancelar').classList.add('oculto');
  };
  el.querySelector('#col-lista').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ed]'); if (!b) return;
    const c = colabs.find((x) => x.id === b.dataset.ed); editando = c;
    f.nome.value = c.name; f.fun.value = c.job_title || ''; f.esp.value = c.specialty || ''; f.conta.value = c.profile_id || '';
    el.querySelector('#co-ativo').checked = c.active;
    el.querySelector('#col-tit').textContent = `Editar ${c.name}`; el.querySelector('#co-salvar').textContent = 'Salvar';
    el.querySelector('#co-ativo-l').classList.remove('oculto'); el.querySelector('#co-cancelar').classList.remove('oculto');
    f.nome.focus();
  });
  el.querySelector('#co-cancelar').addEventListener('click', limpar);
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = el.querySelector('#co-salvar'); btn.disabled = true;
    try {
      await pg.salvarColaborador(editando?.id, { name: f.nome.value.trim(), job_title: f.fun.value.trim() || null, specialty: f.esp.value || null,
        profile_id: f.conta.value || null, active: editando ? el.querySelector('#co-ativo').checked : true });
      toast(editando ? 'Colaborador alterado.' : 'Colaborador cadastrado.');
      colabs = await pg.colaboradores(); limpar(); desenhar(); el.querySelector('#msg-col').innerHTML = '';
    } catch (err) {
      const msg = err.code === '23505' ? (/profile/i.test(err.message) ? 'Essa conta já está ligada a outro colaborador.' : 'Já existe um colaborador com esse nome.') : traduzirErro(err);
      el.querySelector('#msg-col').innerHTML = `<div class="alerta perigo">${esc(msg)}</div>`;
    }
    btn.disabled = false;
  });
  // ao fechar a janela (botão, fundo ou Esc), atualiza a programação
  const fundo = el.closest('.modal-fundo');
  const obs = new MutationObserver(() => { if (!document.body.contains(fundo)) { obs.disconnect(); depois?.(); } });
  obs.observe(document.body, { childList: true });
  desenhar();
}

// ---------------------------------------------------------------------
// Imprimir as fichas semanais (modelo da planilha), uma por colaborador
// ---------------------------------------------------------------------
async function escolherFichas({ semana, colabs, itens }) {
  const dias = Array.from({ length: 5 }, (_, k) => addDias(semana, k));
  // feriados: dias sem operação na usina toda, cadastrados no calendário de funcionamento
  const exc = await excecoes(semana).catch(() => []);
  const feriadoDe = (d) => exc.find((x) => x.date === d && !x.equipment_id && !x.start_time);
  const lista = colabs.filter((c) => c.active || itens.some((i) => i.staff_id === c.id));
  const n = (c) => itens.filter((i) => i.staff_id === c.id).length;
  const { el, fechar } = abrirModal({
    titulo: 'Imprimir fichas da semana',
    html: `<form id="f-fichas" class="grade" style="gap:14px">
      <p class="muted" style="margin:0">Semana de ${fmtData(semana).slice(0, 5)} a ${fmtData(dias[4])}. Sai uma folha A4 por colaborador, no modelo da ficha semanal individual.
        Para guardar em PDF, escolha <b>Salvar como PDF</b> no lugar da impressora.</p>
      <div class="campo"><label>Colaboradores</label>
        <div class="lista-escolha">${lista.map((c) => `<label class="escolha"><input type="checkbox" name="col" value="${c.id}" ${n(c) ? 'checked' : ''}>
          <span><b>${esc(c.name)}</b> <span class="small muted">${esc(c.job_title || '')} · ${n(c)} atividade${n(c) === 1 ? '' : 's'}</span></span></label>`).join('')}</div></div>
      <div class="campo"><label>Feriado ou dia sem expediente</label>
        <div class="filtros-prog">${dias.map((d) => `<label class="check-linha"><input type="checkbox" name="fer" value="${d}" ${feriadoDe(d) ? 'checked' : ''}> ${diaCurto(d)}</label>`).join('')}</div>
        <span class="ajuda">O dia marcado sai escrito FERIADO na ficha, sem atividades.</span></div>
      <div id="msg-fichas"></div></form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-fichas"><i data-lucide="printer"></i> Abrir para imprimir</button>`,
  });
  el.querySelector('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const ids = [...f.querySelectorAll('[name=col]:checked')].map((x) => x.value);
    if (!ids.length) { el.querySelector('#msg-fichas').innerHTML = '<div class="alerta perigo">Marque pelo menos um colaborador.</div>'; return; }
    const janela = window.open('', '_blank');
    if (!janela) { el.querySelector('#msg-fichas').innerHTML = '<div class="alerta perigo">O navegador bloqueou a janela de impressão. Permita janelas pop-up para este site e tente de novo.</div>'; return; }
    const feriados = Object.fromEntries([...f.querySelectorAll('[name=fer]:checked')].map((x) => [x.value, 'FERIADO']));
    imprimirFichas(janela, { semana, colabs: lista.filter((c) => ids.includes(c.id)), itens, feriados });
    fechar();
  });
}
