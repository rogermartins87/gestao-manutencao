// =====================================================================
// Ficha da OS: andamento (botões conforme status e permissão), detalhes,
// mão de obra (horas e, para quem vê custos, R$), peças e custos, anexos e alterações.
// =====================================================================
import { store, pode } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, confirmar, carregando, vazio, erroCarga, fmtData, fmtDataHora, fmtNum, fmtMoeda, comprimirImagem, numOuNulo, hojeISO } from '../ui.js';
import * as os from '../services/ordens.js';
import { badgeOS, badgePrioridade } from './ordens.js';
import { badgeStatus } from './equipamentos.js';
import { daOS as paradasDaOS, fmtDuracao, encerrar as encerrarParada } from '../services/paradas.js';
import * as pc from '../services/pecas.js';
import { agendaDaOS } from '../services/preventiva.js';
import { inspecaoDaOS, TECNICA } from '../services/preditiva.js';
import { daOS as pendenciasDaOS, STATUS_PEND } from '../services/pendencias.js';
import { daOS as programacaoDaOS, STATUS_PROG } from '../services/programacao.js';

const paraLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const agoraLocal = () => { const d = new Date(); d.setSeconds(0, 0); return paraLocal(d); };

export async function render(el, [id]) {
  const o = await os.ler(id);
  if (!o) { el.innerHTML = '<div class="alerta aviso">Ordem de serviço não encontrada. <a href="#/ordens">Voltar</a></div>'; return; }
  document.getElementById('titulo-pagina').textContent = `${o.number} — ${o.equipment_tag}`;
  const recarregar = () => render(el, [id]).then(icones);
  const eu = store.perfil?.id;
  const gestor = pode('work_order.manage');
  const executor = pode('work_order.execute') && o.assigned_to === eu;
  const encerrada = os.ENCERRADAS.includes(o.status);
  const ctx = { o, eu, gestor, executor, encerrada, recarregar };

  // Botões de andamento
  const b = [];
  const st = o.status;
  if (st === 'aberta' && pode('work_order.approve')) b.push(['aprovar', 'badge-check', 'Aprovar', 'btn-primario']);
  if (st === 'aprovada' && gestor) b.push(['planejar', 'calendar-clock', 'Marcar como planejada', '']);
  if (['aprovada', 'planejada'].includes(st) && (gestor || executor)) b.push(['iniciar', 'play', 'Iniciar execução', 'btn-primario']);
  if (['aguardando_pecas', 'aguardando_terceiros'].includes(st) && (gestor || executor)) b.push(['iniciar', 'play', 'Retomar execução', 'btn-primario']);
  if (['em_execucao', 'aguardando_terceiros'].includes(st) && (gestor || executor)) b.push(['aguardar_pecas', 'package-search', 'Aguardando peças', '']);
  if (['em_execucao', 'aguardando_pecas'].includes(st) && (gestor || executor)) b.push(['aguardar_terceiros', 'users', 'Aguardando terceiros', '']);
  if (['em_execucao', 'aguardando_pecas', 'aguardando_terceiros'].includes(st) && (gestor || executor)) b.push(['concluir', 'clipboard-check', 'Finalizar atendimento', 'btn-sucesso']);
  const solicitante = o.requested_by === eu;
  if (st === 'atendida' && (solicitante || gestor)) {
    b.push(['finalizar', 'circle-check', 'Finalizar OS', 'btn-sucesso']);
    b.push(['devolver', 'undo-2', 'Devolver para execução', '']);
  }
  if (!encerrada && gestor) b.push(['editar', 'pencil', 'Editar', '']);
  if (!encerrada && (gestor || (st === 'aberta' && o.requested_by === eu))) b.push(['cancelar', 'circle-x', 'Cancelar OS', 'btn-texto']);

  const abas = [
    { id: 'detalhes', titulo: 'Detalhes', icone: 'info', fn: abaDetalhes },
    { id: 'mao', titulo: `Mão de obra${o.labor_hours > 0 ? ` (${fmtNum(o.labor_hours, 1)} h)` : ''}`, icone: 'hard-hat', fn: abaMaoDeObra },
    { id: 'pecas', titulo: `${pode('costs.read') ? 'Peças e custos' : 'Peças'}${o.parts_count ? ` (${o.parts_count})` : ''}`, icone: 'package', fn: abaPecas },
    { id: 'anexos', titulo: `Anexos${o.attachments_count ? ` (${o.attachments_count})` : ''}`, icone: 'paperclip', fn: abaAnexos },
    ...(pode('audit.read') ? [{ id: 'alteracoes', titulo: 'Alterações', icone: 'file-clock', fn: abaAlteracoes }] : []),
  ];
  const pedida = new URLSearchParams(location.hash.split('?')[1] || '').get('aba');
  const info = (rot, val) => `<div><span class="rotulo">${esc(rot)}</span>${val}</div>`;

  el.innerHTML = `
    <a class="voltar" href="#/ordens"><i data-lucide="arrow-left"></i> Ordens de serviço</a>
    ${st === 'atendida' ? `<div class="alerta aviso-atendida"><i data-lucide="clipboard-check"></i><div><b>Atendida${o.finished_at ? ` em ${fmtDataHora(o.finished_at)}` : ''}.</b>
      ${o.requested_by === eu ? 'Confira o serviço e toque em <b>Finalizar OS</b>, ou <b>Devolver para execução</b> se ainda falta algo.'
        : `Aguardando ${esc(o.requested_by_name || 'quem abriu a OS')} conferir e finalizar.`}</div></div>` : ''}
    <div class="card ficha-topo os-topo os-${o.status}"><div class="card-corpo">
      <div class="ficha-cab">
        <div><div class="equip-tag grande">${esc(o.number)}</div><h1>${esc(o.title)}</h1>
          <div class="muted"><a href="#/equipamentos/${o.equipment_id}?aba=ordens"><b>${esc(o.equipment_tag)}</b> — ${esc(o.equipment_name)}</a>
            ${o.equipment_sector ? ` · ${esc(o.equipment_sector)}` : ''} ${o.equipment_status !== 'operando' ? badgeStatus(o.equipment_status) : ''}</div></div>
        <div class="acoes">${b.map(([k, ic, t, cl]) => `<button class="btn ${cl}" data-acao="${k}"><i data-lucide="${ic}"></i> ${esc(t)}</button>`).join('')}</div>
      </div>
      <div class="ficha-indicadores os-indicadores">
        ${info('Status', `${badgeOS(o.status)}${o.overdue ? ' <span class="badge perigo">Atrasada</span>' : ''}<span class="small muted">desde ${fmtDataHora(o.status_changed_at)}</span>`)}
        ${info('Tipo e prioridade', `<span>${esc(os.TIPO_OS[o.type])}${o.type === 'corretiva' ? (o.is_failure ? ' · <b>falha</b>' : ' · sem falha') : ''}</span>${badgePrioridade(o.priority)}`)}
        ${info('Responsável', `<b>${esc(o.assigned_to_name || 'A definir')}</b>${o.planned_start ? `<span class="small muted">início planejado ${fmtDataHora(o.planned_start)}</span>` : ''}`)}
        ${info('Prazo', `<b>${o.due_date ? fmtData(o.due_date) : '—'}</b>`)}
        ${info('Aberta', `<span>${fmtDataHora(o.created_at)}</span><span class="small muted">por ${esc(o.requested_by_name || '—')}</span>`)}
        ${info('Execução', o.started_at ? `<span>início ${fmtDataHora(o.started_at)}</span>${o.finished_at ? `<span class="small muted">fim ${fmtDataHora(o.finished_at)}</span>` : ''}` : '<span class="muted">não iniciada</span>')}
      </div>
    </div></div>
    <div class="abas" role="tablist">${abas.map((a) => `<button class="aba" data-aba="${a.id}"><i data-lucide="${a.icone}" style="width:16px;height:16px;vertical-align:-3px"></i> ${esc(a.titulo)}</button>`).join('')}</div>
    <div id="aba-corpo"></div>`;

  const corpo = el.querySelector('#aba-corpo');
  const abrir = async (a) => {
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === a.id));
    history.replaceState(null, '', `${location.pathname}${location.search}#/ordens/${o.id}?aba=${a.id}`);
    corpo.innerHTML = carregando();
    try { await a.fn(corpo, ctx); } catch (err) { console.error(err); corpo.innerHTML = erroCarga(err); }
    icones();
  };
  el.querySelectorAll('.aba').forEach((x) => x.addEventListener('click', () => abrir(abas.find((a) => a.id === x.dataset.aba))));
  el.querySelector('.ficha-cab .acoes').addEventListener('click', (ev) => {
    const k = ev.target.closest('[data-acao]')?.dataset.acao; if (!k) return;
    acao(k, ctx);
  });
  await abrir(abas.find((a) => a.id === pedida) || abas[0]);
}

// ---------------------------------------------------------------------
// Ações de andamento
// ---------------------------------------------------------------------
async function acao(k, { o, recarregar }) {
  const tentar = async (fn, msg) => {
    try { await fn(); toast(msg); recarregar(); } catch (err) { toast(traduzirErro(err), 'erro'); }
  };
  if (k === 'editar') { location.hash = `#/ordens/${o.id}/editar`; return; }
  if (k === 'aprovar') {
    if (await confirmar({ titulo: `Aprovar ${o.number}`, mensagem: 'Aprovar esta ordem de serviço para programação e execução?', botao: 'Aprovar' })) {
      tentar(() => os.mudarStatus(o.id, 'aprovada'), 'OS aprovada.');
    }
    return;
  }
  if (k === 'planejar') {
    if (!o.assigned_to) { toast('Defina o responsável pela execução (botão Editar) antes de planejar.', 'erro'); return; }
    tentar(() => os.mudarStatus(o.id, 'planejada'), 'OS marcada como planejada.');
    return;
  }
  if (k === 'iniciar') {
    if (!o.assigned_to) { toast('Defina o responsável pela execução (botão Editar) antes de iniciar.', 'erro'); return; }
    tentar(() => os.mudarStatus(o.id, 'em_execucao', o.status.startsWith('aguardando') ? 'Execução retomada' : null),
      o.status.startsWith('aguardando') ? 'Execução retomada.' : 'Execução iniciada.');
    return;
  }
  if (k === 'aguardar_pecas' || k === 'aguardar_terceiros') {
    const pecas = k === 'aguardar_pecas';
    formularioModal({
      titulo: pecas ? 'Aguardando peças' : 'Aguardando terceiros',
      campos: `<div class="campo"><label for="m-nota">${pecas ? 'Quais peças estão sendo aguardadas?' : 'O que está sendo aguardado de terceiros?'} *</label>
        <textarea id="m-nota" name="nota" rows="3" required minlength="3" maxlength="500"
          placeholder="${pecas ? 'Ex.: rolamento 6205 e retentor; pedido de compra 1234' : 'Ex.: técnico do fabricante agendado para quinta'}"></textarea></div>`,
      botao: 'Salvar',
      enviar: (f) => os.mudarStatus(o.id, pecas ? 'aguardando_pecas' : 'aguardando_terceiros', f.nota.value.trim()),
      sucesso: 'Andamento atualizado.', depois: recarregar,
    });
    return;
  }
  if (k === 'finalizar') {
    formularioModal({
      titulo: `Finalizar ${o.number}`,
      campos: `<p style="margin:0">Confira o que foi feito. Ao finalizar, a OS é encerrada de vez.</p>
        ${o.solution ? `<div class="alerta small"><i data-lucide="clipboard-check"></i><div><b>Atendimento:</b> ${esc(o.solution)}</div></div>` : ''}
        <div class="campo"><label for="m-obs">Observação <span class="muted small">(opcional)</span></label>
          <textarea id="m-obs" name="obs" rows="2" maxlength="1000" placeholder="Ex.: conferido em operação, sem vazamento"></textarea></div>`,
      botao: 'Finalizar OS', classe: 'btn-sucesso',
      enviar: (f) => os.finalizar(o.id, f.obs.value.trim()),
      sucesso: 'OS finalizada.', depois: () => perguntarRetorno(o, recarregar),
    });
    return;
  }
  if (k === 'devolver') {
    formularioModal({
      titulo: `Devolver ${o.number}`,
      campos: `<div class="campo"><label for="m-dev">O que ainda precisa ser feito? *</label>
        <textarea id="m-dev" name="dev" rows="3" required minlength="5" maxlength="1000" placeholder="Ex.: ainda faz barulho quando entra em carga"></textarea></div>
        <div class="alerta small"><i data-lucide="info"></i><div>A OS volta para <b>Em execução</b> e ${esc(o.assigned_to_name || 'o responsável')} recebe um aviso com este motivo.</div></div>`,
      botao: 'Devolver', classe: 'btn-primario',
      enviar: (f) => os.devolver(o.id, f.dev.value.trim()),
      sucesso: 'OS devolvida para execução.', depois: recarregar,
    });
    return;
  }
  if (k === 'concluir') {
    formularioModal({
      titulo: `Finalizar atendimento — ${o.number}`,
      campos: `<div class="campo"><label for="m-sol">O que foi feito? * <span class="muted small">(mínimo 10 caracteres)</span></label>
          <textarea id="m-sol" name="sol" rows="4" required minlength="10" maxlength="4000" placeholder="Ex.: substituído rolamento 6205 do mancal LA e retentor; testado em carga por 30 min"></textarea></div>
        <div class="campo"><label for="m-fim">Atendimento finalizado em *</label><input id="m-fim" name="fim" type="datetime-local" required value="${agoraLocal()}" max="${agoraLocal()}"></div>
        <div class="alerta small"><i data-lucide="info"></i><div>É preciso ter pelo menos um lançamento de mão de obra. A OS fica <b>Atendida</b> e ${esc(o.requested_by_name || 'quem abriu')} recebe um aviso para conferir e finalizar.</div></div>`,
      botao: 'Finalizar atendimento', classe: 'btn-sucesso',
      enviar: (f) => os.concluir(o.id, f.sol.value.trim(), new Date(f.fim.value).toISOString()),
      sucesso: 'Atendimento finalizado. Aguardando quem abriu a OS finalizar.', depois: recarregar,
    });
    return;
  }
  if (k === 'cancelar') {
    formularioModal({
      titulo: `Cancelar ${o.number}`,
      campos: `<div class="campo"><label for="m-mot">Motivo do cancelamento *</label>
        <textarea id="m-mot" name="mot" rows="3" required minlength="5" maxlength="500" placeholder="Ex.: aberta em duplicidade com a OS-2026-0012"></textarea></div>`,
      botao: 'Cancelar OS', classe: 'btn-perigo',
      enviar: (f) => os.cancelar(o.id, f.mot.value.trim()),
      sucesso: 'OS cancelada.', depois: recarregar,
    });
  }
}

export function formularioModal({ titulo, campos, botao, classe = 'btn-primario', enviar, sucesso, depois }) {
  const { el, fechar } = abrirModal({
    titulo,
    html: `<form id="f-modal" class="grade" style="gap:14px">${campos}<div id="msg-modal"></div></form>`,
    rodape: `<button class="btn" data-fechar>Voltar</button><button class="btn ${classe}" type="submit" form="f-modal">${esc(botao)}</button>`,
  });
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      await enviar(ev.target);
      if (sucesso) toast(sucesso);
      fechar(); depois?.();
    } catch (err) {
      el.querySelector('#msg-modal').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
  return { el, fechar };
}

// ---------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------
async function abaDetalhes(corpo, { o }) {
  const [h, paradas, prev, insp] = await Promise.all([os.historico(o.id), paradasDaOS(o.id).catch(() => []),
    o.type === 'preventiva' ? agendaDaOS(o.id).catch(() => null) : null,
    o.type === 'preditiva' ? inspecaoDaOS(o.id).catch(() => null) : null]);
  const [pends, prog] = await Promise.all([pendenciasDaOS(o.id).catch(() => []), programacaoDaOS(o.id).catch(() => [])]);
  const podeParada = pode('downtime.write') && !paradas.some((p) => p.is_open);
  corpo.innerHTML = `<div class="grade grade-2">
    <div class="grade" style="gap:16px">
      <div class="card"><div class="card-titulo"><h3><i data-lucide="file-text"></i> Descrição</h3></div>
        <div class="card-corpo" style="white-space:pre-wrap">${o.description ? esc(o.description) : '<span class="muted">Sem descrição.</span>'}</div></div>
      ${o.solution ? `<div class="card"><div class="card-titulo"><h3><i data-lucide="circle-check"></i> O que foi feito</h3></div>
        <div class="card-corpo" style="white-space:pre-wrap">${esc(o.solution)}</div></div>` : ''}
      ${prev ? `<div class="alerta info"><i data-lucide="calendar-check"></i><div>Gerada pelo plano preventivo
        <a href="#/preventiva/planos/${prev.plan_id}"><b>${esc(prev.plan_name)}</b></a> (vencimento nº ${prev.sequence}).
        Ao concluir, a próxima preventiva é agendada a partir da data de conclusão.</div></div>` : ''}
      ${insp ? `<div class="alerta info"><i data-lucide="activity"></i><div>Gerada pela inspeção de
        <a href="#/preditiva/inspecoes/${insp.id}"><b>${esc(TECNICA[insp.type].nome.toLowerCase())} de ${fmtDataHora(insp.performed_at)}</b></a>.
        Depois do reparo, registre uma nova inspeção para confirmar que voltou ao normal.</div></div>` : ''}
      ${o.cancel_reason ? `<div class="alerta perigo"><i data-lucide="circle-x"></i><div><b>Cancelada:</b> ${esc(o.cancel_reason)}</div></div>` : ''}
      <div class="card"><div class="card-titulo"><h3><i data-lucide="list-todo"></i> Pendências desta OS</h3>
        ${pode('pending.write') ? '<button class="btn btn-sm" id="btn-pend-os"><i data-lucide="plus"></i> Nova pendência</button>' : ''}</div>
        <div class="card-corpo">${pends.length ? `<ul class="lista-linhas">${pends.map((x) => `<li><a href="#/pendencias/${x.id}">${esc(x.title)}</a>
          <span class="badge ${STATUS_PEND[x.status].classe}">${esc(STATUS_PEND[x.status].nome)}</span>
          <span class="small muted">${esc(x.assigned_to_name || 'sem responsável')}</span></li>`).join('')}</ul>`
          : '<span class="muted small">Nenhuma. Use para o que depende de outra pessoa: comprar peça, pedir orçamento, chamar terceiro.</span>'}</div></div>
      <div class="card"><div class="card-titulo"><h3><i data-lucide="calendar-range"></i> Programação semanal</h3>
        <a class="btn btn-sm" href="#/programacao"><i data-lucide="calendar-plus"></i> Ver a programação</a></div>
        <div class="card-corpo">${prog.length ? `<ul class="lista-linhas">${prog.map((x) => `<li><a href="#/programacao?semana=${x.scheduled_date}">${fmtData(x.scheduled_date)}</a>
          · <b>${esc(x.staff_name)}</b> <span class="badge ${STATUS_PROG[x.status].classe}">${esc(STATUS_PROG[x.status].nome)}</span>
          ${x.result_note ? `<div class="small muted">${esc(x.result_note)}</div>` : ''}</li>`).join('')}</ul>`
          : '<span class="muted small">Ainda não programada. Na Programação semanal, use <b>+</b> → <b>Ordem de serviço</b> para colocá-la no dia de um colaborador.</span>'}</div></div>
      <div class="card"><div class="card-titulo"><h3><i data-lucide="octagon-pause"></i> Paradas do equipamento ligadas a esta OS</h3>
        ${podeParada ? `<a class="btn btn-sm" href="#/paradas/nova?os=${o.id}"><i data-lucide="plus"></i> Registrar parada</a>` : ''}</div>
        <div class="card-corpo">${paradas.length ? `<ul class="lista-linhas">${paradas.map((p) => `<li><a href="#/paradas/${p.id}">${fmtDataHora(p.started_at)}</a>
          · ${esc(p.reason_name)} · <b>${fmtDuracao(p.duration_hours)}</b> ${p.is_open ? '<span class="badge perigo">Em aberto</span>' : '<span class="badge ativo">Encerrada</span>'}</li>`).join('')}</ul>`
          : '<span class="muted small">Nenhuma. Concluir a OS não encerra parada: o retorno à operação é confirmado na própria parada.</span>'}</div></div>
      ${o.approved_at ? `<p class="muted small">Aprovada em ${fmtDataHora(o.approved_at)} por ${esc(o.approved_by_name || '—')}.</p>` : ''}
    </div>
    <div class="card"><div class="card-titulo"><h3><i data-lucide="history"></i> Andamento</h3></div><div class="card-corpo">
      <ul class="linha-tempo">${h.map((x) => `<li>
        <div>${x.old_status ? `${badgeOS(x.old_status)} → ` : ''}${badgeOS(x.new_status)}</div>
        ${x.note ? `<div style="margin-top:4px">${esc(x.note)}</div>` : ''}
        <div class="quando">${fmtDataHora(x.changed_at)} · ${esc(x.autor?.full_name || 'Sistema')}</div></li>`).join('')}</ul>
    </div></div>
  </div>`;
  corpo.querySelector('#btn-pend-os')?.addEventListener('click', async () => {
    const { abrirPendencia } = await import('./pendencias.js');
    abrirPendencia({ osId: o.id, depois: () => abaDetalhes(corpo, { o }).then(icones) });
  });
}

async function abaMaoDeObra(corpo, ctx) {
  const { o, eu, gestor, executor, encerrada } = ctx;
  const verCusto = pode('costs.read');
  const linhas = await os.maoDeObra(o.id);
  const custos = verCusto ? Object.fromEntries((await os.custosMaoDeObra(linhas.map((l) => l.id))).map((c) => [c.labor_id, c])) : {};
  const podeLancar = !encerrada && o.status !== 'aberta' && (gestor || executor);
  const totalH = linhas.reduce((s, l) => s + Number(l.hours), 0);
  const totalR = linhas.reduce((s, l) => s + Number(custos[l.id]?.total_cost || 0), 0);
  const podeEditar = (l) => !encerrada && (gestor || l.created_by === eu);

  corpo.innerHTML = `
    ${podeLancar ? '<div class="acoes" style="margin:0 0 16px"><button class="btn btn-primario" id="btn-mo"><i data-lucide="plus"></i> Lançar horas</button></div>'
      : !encerrada && o.status === 'aberta' ? '<div class="alerta small secao"><i data-lucide="info"></i><div>As horas podem ser lançadas depois que a OS for aprovada.</div></div>' : ''}
    <div class="card">${linhas.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
        <th>Quem</th><th>Início</th><th>Fim</th><th>Horas</th>${verCusto ? '<th>R$/h</th><th>Custo</th>' : ''}<th>Observação</th><th></th></tr></thead><tbody>
        ${linhas.map((l) => `<tr>
          <td data-rotulo="Quem">${l.technician_id ? esc(l.tecnico?.full_name || '—') : `${esc(l.third_party_name)} <span class="badge inativo">terceiro</span>`}</td>
          <td data-rotulo="Início" class="num">${fmtDataHora(l.started_at)}</td>
          <td data-rotulo="Fim" class="num">${fmtDataHora(l.ended_at)}</td>
          <td data-rotulo="Horas" class="num"><b>${fmtNum(l.hours, 2)} h</b></td>
          ${verCusto ? `<td data-rotulo="R$/h" class="num">${custos[l.id]?.hourly_cost == null ? '—' : fmtMoeda(custos[l.id].hourly_cost)}</td>
            <td data-rotulo="Custo" class="num">${custos[l.id]?.total_cost == null ? (l.technician_id ? '<span class="muted small">sem valor da hora</span>' : '<span class="muted small">serviço externo</span>') : fmtMoeda(custos[l.id].total_cost)}</td>` : ''}
          <td data-rotulo="Observação" class="small">${esc(l.notes || '—')}<div class="muted">lançado por ${esc(l.autor?.full_name || '—')}</div></td>
          <td>${podeEditar(l) ? `<button class="btn btn-sm btn-texto" data-editar="${l.id}" title="Alterar lançamento"><i data-lucide="pencil"></i></button>` : ''}</td>
        </tr>`).join('')}
        <tr class="linha-total"><td data-rotulo="Total" colspan="3"><b>Total</b></td><td data-rotulo="Horas" class="num"><b>${fmtNum(totalH, 2)} h</b></td>
          ${verCusto ? `<td></td><td data-rotulo="Custo" class="num"><b>${fmtMoeda(totalR)}</b></td>` : ''}<td></td><td></td></tr>
      </tbody></table></div>`
    : `<div class="card-corpo">${vazio({ icone: 'hard-hat', titulo: 'Nenhuma hora lançada', texto: podeLancar ? 'Lance as horas de cada técnico que trabalhou nesta OS.' : '' })}</div>`}</div>
    ${verCusto ? '<p class="muted small secao">O custo usa o valor da hora do técnico no momento do lançamento (cadastrado em Usuários e configurações → Custo da mão de obra). Mudar o valor depois não altera lançamentos antigos.</p>' : ''}`;

  corpo.onclick = (ev) => {
    if (ev.target.closest('#btn-mo')) abrirMaoDeObra(ctx, null);
    const ed = ev.target.closest('[data-editar]');
    if (ed) abrirMaoDeObra(ctx, linhas.find((l) => l.id === ed.dataset.editar));
  };
}

async function abrirMaoDeObra({ o, eu, recarregar }, l) {
  let pessoas = [];
  try { pessoas = await os.responsaveis(); } catch { /* lista vazia */ }
  const terceiro = l ? !l.technician_id : false;
  const tecAtual = l ? l.technician_id : (pessoas.some((p) => p.id === eu) ? eu : o.assigned_to);
  const fimPadrao = new Date(); fimPadrao.setSeconds(0, 0);
  const iniPadrao = new Date(fimPadrao.getTime() - 3600000);
  formularioModal({
    titulo: l ? 'Alterar lançamento de horas' : `Lançar horas — ${o.number}`,
    campos: `
      <fieldset class="campo"><legend>Quem trabalhou</legend>
        <label class="check-linha"><input type="radio" name="quem" value="tec" ${terceiro ? '' : 'checked'}> Técnico da equipe</label>
        <label class="check-linha"><input type="radio" name="quem" value="ter" ${terceiro ? 'checked' : ''}> Terceiro (empresa ou prestador)</label>
      </fieldset>
      <div class="campo" id="c-tec"><label for="m-tec">Técnico *</label><select id="m-tec" name="tec">
        ${pessoas.map((p) => `<option value="${p.id}" ${p.id === tecAtual ? 'selected' : ''}>${esc(p.full_name)}</option>`).join('')}</select></div>
      <div class="campo oculto" id="c-ter"><label for="m-ter">Nome do terceiro *</label><input id="m-ter" name="ter" maxlength="120" value="${esc(l?.third_party_name || '')}" placeholder="Ex.: Eletro Sul Ltda"></div>
      <div class="grade grade-2">
        <div class="campo"><label for="m-ini">Início *</label><input id="m-ini" name="ini" type="datetime-local" required value="${paraLocal(l ? new Date(l.started_at) : iniPadrao)}"></div>
        <div class="campo"><label for="m-fim2">Fim *</label><input id="m-fim2" name="fim" type="datetime-local" required value="${paraLocal(l ? new Date(l.ended_at) : fimPadrao)}" max="${agoraLocal()}"></div>
      </div>
      <div class="small muted" id="m-dur"></div>
      <div class="campo"><label for="m-obs">Observação</label><input id="m-obs" name="obs" maxlength="1000" value="${esc(l?.notes || '')}" placeholder="Opcional"></div>`,
    botao: l ? 'Salvar' : 'Lançar',
    enviar: (f) => {
      const ini = new Date(f.ini.value); const fim = new Date(f.fim.value);
      if (!(fim > ini)) throw new Error('O fim precisa ser depois do início.');
      const dados = {
        technician_id: f.quem.value === 'tec' ? f.tec.value : null,
        third_party_name: f.quem.value === 'ter' ? f.ter.value.trim() : null,
        started_at: ini.toISOString(), ended_at: fim.toISOString(), notes: f.obs.value.trim() || null,
      };
      if (f.quem.value === 'ter' && dados.third_party_name.length < 2) throw new Error('Informe o nome do terceiro.');
      return l ? os.alterarMaoDeObra(l.id, dados) : os.lancarMaoDeObra({ work_order_id: o.id, ...dados });
    },
    sucesso: l ? 'Lançamento alterado.' : 'Horas lançadas.',
    depois: recarregar,
  });
  const m = document.querySelector('#f-modal');
  const ajustar = () => {
    const ter = m.quem.value === 'ter';
    m.querySelector('#c-tec').classList.toggle('oculto', ter);
    m.querySelector('#c-ter').classList.toggle('oculto', !ter);
    m.ter.required = ter;
    const h = (new Date(m.fim.value) - new Date(m.ini.value)) / 36e5;
    m.querySelector('#m-dur').textContent = Number.isFinite(h) && h > 0 ? `Duração: ${fmtNum(h, 2)} h` : '';
  };
  m.addEventListener('change', ajustar); m.addEventListener('input', ajustar);
  ajustar();
}

// ---------------------------------------------------------------------
// Peças e custos
// ---------------------------------------------------------------------
async function abaPecas(corpo, ctx) {
  const { o, eu, gestor, executor, encerrada, recarregar } = ctx;
  const verCusto = pode('costs.read');
  const lancaCusto = pode('costs.write');
  const [pecas, resumo, servicos] = await Promise.all([
    pc.daOS(o.id),
    verCusto ? pc.custosOS(o.id).catch(() => null) : null,
    verCusto ? pc.servicos(o.id).catch(() => []) : [],
  ]);
  const podeLancar = !encerrada && o.status !== 'aberta' && pode('parts.register') && (gestor || executor);
  const podeMexer = (u) => !encerrada && (gestor || u.created_by === eu);
  const podeServico = lancaCusto && o.status !== 'cancelada';
  const total = resumo ? Number(resumo.labor_cost) + Number(resumo.parts_cost) + Number(resumo.external_cost) : 0;
  const card = (rot, v, ic, cl = '') => `<div class="card kpi ${cl}"><span class="rotulo"><i data-lucide="${ic}"></i> ${esc(rot)}</span><span class="valor">${fmtMoeda(v)}</span></div>`;

  corpo.innerHTML = `
    ${resumo ? `<div class="grade-custos secao">
        ${card('Mão de obra', resumo.labor_cost, 'hard-hat')}${card('Peças', resumo.parts_cost, 'package')}
        ${card('Serviços externos', resumo.external_cost, 'truck')}${card('Total da OS', total, 'sigma', 'destaque')}</div>
      ${Number(resumo.parts_without_cost) ? `<div class="alerta aviso small secao"><i data-lucide="triangle-alert"></i><div>${resumo.parts_without_cost} peça${resumo.parts_without_cost == 1 ? '' : 's'} sem valor: o total está incompleto.${lancaCusto ? ' Use o botão <b>R$</b> na linha para informar.' : ''}</div></div>` : ''}` : ''}

    <div class="acoes" style="margin:0 0 12px;justify-content:space-between;align-items:center">
      <h3 style="margin:0"><i data-lucide="package" style="width:18px;height:18px;vertical-align:-3px"></i> Peças trocadas</h3>
      ${podeLancar ? '<button class="btn btn-primario" id="btn-peca"><i data-lucide="plus"></i> Lançar peça</button>' : ''}</div>
    ${!encerrada && o.status === 'aberta' ? '<div class="alerta small secao"><i data-lucide="info"></i><div>As peças podem ser lançadas depois que a OS for aprovada.</div></div>' : ''}
    <div class="card">${pecas.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
        <th>Peça</th><th>Quantidade</th><th>Data da troca</th><th>Motivo</th>${verCusto ? '<th>R$ unit.</th><th>Custo</th>' : ''}<th></th></tr></thead><tbody>
        ${pecas.map((u) => `<tr>
          <td data-rotulo="Peça"><div>${u.part_id ? `<a href="#/pecas/${u.part_id}"><b>${esc(u.part_code)}</b></a> ` : '<span class="badge inativo">fora do catálogo</span> '}${esc(u.part_name)}
            <div class="small muted">${esc(u.manufacturer || '')}${u.manufacturer ? ' · ' : ''}lançado por ${esc(u.created_by_name || '—')}</div></div></td>
          <td data-rotulo="Quantidade" class="num"><b>${pc.fmtQtd(u.quantity, u.unit)}</b></td>
          <td data-rotulo="Data da troca" class="num">${fmtDataHora(u.replaced_at)}</td>
          <td data-rotulo="Motivo" class="small"><div>${esc(u.reason || '—')}${u.notes ? `<div class="muted">${esc(u.notes)}</div>` : ''}</div></td>
          ${verCusto ? `<td data-rotulo="R$ unit." class="num"><div>${u.unit_cost == null ? '<span class="muted small">sem valor</span>' : `${fmtMoeda(u.unit_cost)}${u.cost_source === 'manual' ? '<div class="muted small">valor da nota</div>' : ''}`}</div></td>
            <td data-rotulo="Custo" class="num">${u.total_cost == null ? '—' : `<b>${fmtMoeda(u.total_cost)}</b>`}</td>` : ''}
          <td class="acoes-linha"><div>
            ${lancaCusto && o.status !== 'cancelada' ? `<button class="btn btn-sm btn-texto" data-custo="${u.id}" title="Informar o valor pago">R$</button>` : ''}
            ${podeMexer(u) ? `<button class="btn btn-sm btn-texto" data-editar-peca="${u.id}" title="Alterar"><i data-lucide="pencil"></i></button>
              <button class="btn btn-sm btn-texto" data-remover-peca="${u.id}" title="Remover"><i data-lucide="trash-2"></i></button>` : ''}</div></td>
        </tr>`).join('')}
      </tbody></table></div>`
    : `<div class="card-corpo">${vazio({ icone: 'package', titulo: 'Nenhuma peça lançada', texto: podeLancar ? 'Lance as peças e componentes trocados nesta OS. Assim o equipamento ganha o histórico de trocas.' : '' })}</div>`}</div>

    ${verCusto ? `<div class="acoes" style="margin:22px 0 12px;justify-content:space-between;align-items:center">
        <h3 style="margin:0"><i data-lucide="truck" style="width:18px;height:18px;vertical-align:-3px"></i> Serviços externos e outros custos</h3>
        ${podeServico ? '<button class="btn" id="btn-servico"><i data-lucide="plus"></i> Lançar custo</button>' : ''}</div>
      <div class="card">${servicos.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
          <th>Data</th><th>Descrição</th><th>Fornecedor</th><th>Nota fiscal</th><th>Valor</th><th></th></tr></thead><tbody>
          ${servicos.map((m) => `<tr>
            <td data-rotulo="Data" class="num">${fmtData(m.incurred_at)}</td>
            <td data-rotulo="Descrição"><div>${esc(m.description)} <span class="badge inativo">${esc(pc.TIPO_CUSTO[m.type])}</span></div></td>
            <td data-rotulo="Fornecedor">${esc(m.supplier || '—')}</td>
            <td data-rotulo="Nota fiscal">${esc(m.invoice || '—')}</td>
            <td data-rotulo="Valor" class="num"><b>${fmtMoeda(m.amount)}</b></td>
            <td class="acoes-linha">${podeServico ? `<button class="btn btn-sm btn-texto" data-remover-servico="${m.id}" title="Remover"><i data-lucide="trash-2"></i></button>` : ''}</td>
          </tr>`).join('')}</tbody></table></div>`
        : `<div class="card-corpo muted small">Nenhum. Lance aqui serviços de terceiros (usinagem, rebobinamento, técnico do fabricante), fretes e outros gastos da OS.</div>`}</div>`
      : '<p class="muted small secao">Os valores em R$ ficam visíveis só para administrador e gestor.</p>'}`;

  corpo.onclick = async (ev) => {
    if (ev.target.closest('#btn-peca')) return abrirLancarPeca(ctx, null);
    if (ev.target.closest('#btn-servico')) return abrirServico(ctx);
    const ed = ev.target.closest('[data-editar-peca]');
    if (ed) return abrirLancarPeca(ctx, pecas.find((u) => u.id === ed.dataset.editarPeca));
    const cu = ev.target.closest('[data-custo]');
    if (cu) return abrirCustoPeca(pecas.find((u) => u.id === cu.dataset.custo), recarregar);
    const rp = ev.target.closest('[data-remover-peca]');
    const rs = ev.target.closest('[data-remover-servico]');
    if (rp || rs) {
      const u = rp ? pecas.find((x) => x.id === rp.dataset.removerPeca) : servicos.find((x) => x.id === rs.dataset.removerServico);
      formularioModal({
        titulo: rp ? 'Remover peça' : 'Remover custo',
        campos: `<div>${rp ? `<b>${esc(u.part_name)}</b> — ${pc.fmtQtd(u.quantity, u.unit)}` : `<b>${esc(u.description)}</b> — ${fmtMoeda(u.amount)}`}</div>
          <div class="campo"><label for="m-rm">Motivo da remoção *</label><input id="m-rm" name="mot" required minlength="5" maxlength="300" placeholder="Ex.: lançado por engano"></div>
          <p class="muted small">O lançamento sai da OS e do histórico do equipamento, mas fica registrado nas alterações.</p>`,
        botao: 'Remover', classe: 'btn-perigo',
        enviar: (f) => (rp ? pc.remover(u.id, f.mot.value.trim()) : pc.removerServico(u.id, f.mot.value.trim())),
        sucesso: 'Lançamento removido.', depois: recarregar,
      });
    }
  };
}

async function abrirLancarPeca({ o, recarregar }, u) {
  const catalogo = u ? [] : (await pc.catalogo()).filter((p) => p.active);
  const unidadeDe = (id) => catalogo.find((p) => p.id === id)?.unit || 'un';
  const motivos = `<datalist id="m-motivos">${pc.MOTIVOS_TROCA.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>`;
  const quando = u ? new Date(u.replaced_at) : new Date();
  formularioModal({
    titulo: u ? `Alterar peça — ${u.part_name}` : `Lançar peça — ${o.number}`,
    campos: `
      ${u ? `<div><b>${esc(u.part_code || '')}</b> ${esc(u.part_name)}</div>` : `
      <fieldset class="campo"><legend>Peça</legend>
        <label class="check-linha"><input type="radio" name="origem" value="cat" ${catalogo.length ? 'checked' : 'disabled'}> Do catálogo</label>
        <label class="check-linha"><input type="radio" name="origem" value="livre" ${catalogo.length ? '' : 'checked'}> Fora do catálogo (só o nome)</label>
      </fieldset>
      <div id="c-cat" class="grade" style="gap:8px">
        <div class="campo"><label for="m-busca">Buscar no catálogo</label><input id="m-busca" type="search" placeholder="Código, nome ou fabricante" autocomplete="off"></div>
        <div class="campo"><label for="m-peca">Peça *</label><select id="m-peca" name="peca" size="6">
          ${catalogo.map((p) => `<option value="${p.id}">${esc(p.code)} — ${esc(p.name)}${p.manufacturer ? ` (${esc(p.manufacturer)})` : ''}</option>`).join('')}</select></div>
      </div>
      <div id="c-livre" class="grade grade-2 oculto">
        <div class="campo"><label for="m-nome">Nome da peça *</label><input id="m-nome" name="nome" maxlength="160" placeholder="Ex.: Retentor 45x62x8"></div>
        <div class="campo"><label for="m-un">Unidade *</label><select id="m-un" name="un">${Object.entries(pc.UNIDADE).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      </div>`}
      <div class="grade grade-2">
        <div class="campo"><label for="m-qtd">Quantidade * <span class="muted small" id="m-qtd-un">${u ? esc(u.unit) : ''}</span></label>
          <input id="m-qtd" name="qtd" inputmode="decimal" required autocomplete="off" value="${u ? String(Number(u.quantity)).replace('.', ',') : '1'}"></div>
        <div class="campo"><label for="m-quando">Data da troca *</label><input id="m-quando" name="quando" type="datetime-local" required value="${paraLocal(quando)}" max="${agoraLocal()}"></div>
      </div>
      <div class="campo"><label for="m-mot">Motivo da troca</label><input id="m-mot" name="motivo" list="m-motivos" maxlength="500" value="${esc(u?.reason || '')}" placeholder="Ex.: Desgaste">${motivos}</div>
      <div class="campo"><label for="m-obs">Observação</label><input id="m-obs" name="obs" maxlength="1000" value="${esc(u?.notes || '')}" placeholder="Opcional. Ex.: mancal lado acionamento"></div>`,
    botao: u ? 'Salvar' : 'Lançar peça',
    enviar: (f) => {
      const qtd = numOuNulo(f.qtd.value);
      if (qtd == null || qtd <= 0) throw new Error('Informe uma quantidade maior que zero.');
      const dados = { quantity: qtd, replaced_at: new Date(f.quando.value).toISOString(), reason: f.motivo.value.trim() || null, notes: f.obs.value.trim() || null };
      if (u) return pc.alterar(u.id, dados);
      if (f.origem.value === 'cat') {
        if (!f.peca.value) throw new Error('Escolha a peça na lista.');
        return pc.lancar({ work_order_id: o.id, part_id: f.peca.value, ...dados });
      }
      if (f.nome.value.trim().length < 2) throw new Error('Informe o nome da peça.');
      return pc.lancar({ work_order_id: o.id, part_id: null, part_name: f.nome.value.trim(), unit: f.un.value, ...dados });
    },
    sucesso: u ? 'Lançamento alterado.' : 'Peça lançada.',
    depois: recarregar,
  });
  if (u) return;
  const m = document.querySelector('#f-modal');
  const sel = m.querySelector('#m-peca');
  const ajustar = () => {
    const livre = m.origem.value === 'livre';
    m.querySelector('#c-cat').classList.toggle('oculto', livre);
    m.querySelector('#c-livre').classList.toggle('oculto', !livre);
    m.nome.required = livre;
    m.querySelector('#m-qtd-un').textContent = livre ? m.un.value : (sel.value ? unidadeDe(sel.value) : '');
  };
  m.querySelector('#m-busca').addEventListener('input', (ev) => {
    const t = ev.target.value.trim().toLowerCase();
    [...sel.options].forEach((op) => { op.hidden = !!t && !op.textContent.toLowerCase().includes(t); });
    const vis = [...sel.options].filter((op) => !op.hidden);
    if (vis.length === 1) sel.value = vis[0].value;
    ajustar();
  });
  m.addEventListener('change', ajustar);
  ajustar();
}

function abrirCustoPeca(u, depois) {
  formularioModal({
    titulo: 'Valor pago pela peça',
    campos: `<div><b>${esc(u.part_code || '')}</b> ${esc(u.part_name)} — ${pc.fmtQtd(u.quantity, u.unit)}</div>
      <div class="campo"><label for="m-cu">Custo por ${esc(u.unit)} (R$) *</label>
        <input id="m-cu" name="valor" inputmode="decimal" required autocomplete="off" value="${u.unit_cost == null ? '' : String(u.unit_cost).replace('.', ',')}" placeholder="Ex.: 85,50"></div>
      <p class="muted small">Use o valor da nota fiscal. Fica registrado quem alterou e quando.</p>`,
    botao: 'Salvar',
    enviar: (f) => {
      const v = numOuNulo(f.valor.value);
      if (v == null || v < 0) throw new Error('Valor inválido. Use, por exemplo, 85,50.');
      return pc.definirCusto(u.id, v);
    },
    sucesso: 'Custo da peça salvo.', depois,
  });
}

function abrirServico({ o, recarregar }) {
  formularioModal({
    titulo: `Lançar custo — ${o.number}`,
    campos: `
      <div class="grade grade-2">
        <div class="campo"><label for="m-tipo">Tipo *</label><select id="m-tipo" name="tipo">${Object.entries(pc.TIPO_CUSTO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        <div class="campo"><label for="m-data">Data *</label><input id="m-data" name="data" type="date" required value="${hojeISO()}" max="${hojeISO()}"></div>
      </div>
      <div class="campo"><label for="m-desc">Descrição *</label><input id="m-desc" name="desc" required minlength="3" maxlength="300" placeholder="Ex.: Rebobinamento do motor de 75 cv"></div>
      <div class="grade grade-2">
        <div class="campo"><label for="m-forn">Fornecedor</label><input id="m-forn" name="forn" maxlength="160" placeholder="Ex.: Eletro Sul Ltda"></div>
        <div class="campo"><label for="m-nf">Nota fiscal</label><input id="m-nf" name="nf" maxlength="60" placeholder="Nº da NF"></div>
      </div>
      <div class="campo"><label for="m-valor">Valor (R$) *</label><input id="m-valor" name="valor" inputmode="decimal" required autocomplete="off" placeholder="Ex.: 1.850,00"></div>`,
    botao: 'Lançar',
    enviar: (f) => {
      const v = numOuNulo(f.valor.value);
      if (v == null || v < 0) throw new Error('Valor inválido. Use, por exemplo, 1.850,00.');
      return pc.lancarServico({ work_order_id: o.id, type: f.tipo.value, incurred_at: f.data.value, description: f.desc.value.trim(),
        supplier: f.forn.value.trim() || null, invoice: f.nf.value.trim() || null, amount: v });
    },
    sucesso: 'Custo lançado.', depois: recarregar,
  });
}

async function abaAnexos(corpo, { o, gestor, executor, eu, encerrada, recarregar }) {
  const lista = await os.anexos(o.id);
  const podeEnviar = gestor || executor || o.requested_by === eu;
  corpo.innerHTML = `
    ${podeEnviar ? `<div class="card" style="margin-bottom:16px"><div class="card-corpo">
      <form id="f-anexo" class="form-doc">
        <div class="campo"><label for="a-arq">Arquivo (foto ou PDF, até 20 MB)</label><input id="a-arq" name="arq" type="file" accept="application/pdf,image/*" required></div>
        <div class="campo"><label for="a-tit">Título</label><input id="a-tit" name="titulo" required minlength="2" maxlength="160" placeholder="Ex.: Foto do vazamento"></div>
        <div class="campo"><label for="a-tipo">Tipo</label><select id="a-tipo" name="tipo">${Object.entries(os.TIPO_ANEXO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><button class="btn btn-primario" type="submit"><i data-lucide="upload"></i> Enviar</button></div>
      </form></div></div>` : ''}
    <div class="card"><div class="card-corpo">${lista.length ? `<ul class="lista-docs">${lista.map((d) => `<li>
        <i data-lucide="${d.mime_type === 'application/pdf' ? 'file-text' : 'image'}"></i>
        <div class="doc-info"><b>${esc(d.title)}</b><div class="muted small">${esc(os.TIPO_ANEXO[d.kind] || d.kind)} · ${esc(d.file_name || '')}${d.size_bytes ? ` · ${fmtNum(d.size_bytes / 1048576, 1)} MB` : ''} · ${fmtDataHora(d.created_at)} por ${esc(d.autor?.full_name || '—')}</div></div>
        <span class="acoes"><button class="btn btn-sm" data-abrir="${esc(d.storage_path)}"><i data-lucide="external-link"></i> Abrir</button>
        ${gestor || d.created_by === eu ? `<button class="btn btn-sm btn-texto" data-remover="${d.id}" title="Remover da lista"><i data-lucide="trash-2"></i></button>` : ''}</span>
      </li>`).join('')}</ul>` : vazio({ icone: 'paperclip', titulo: 'Nenhum anexo', texto: podeEnviar ? 'Envie fotos do problema, do serviço feito ou relatórios.' : '' })}</div></div>
    ${encerrada ? '<p class="muted small secao">A OS está encerrada, mas ainda é possível anexar fotos e relatórios.</p>' : ''}`;

  corpo.querySelector('#f-anexo')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector('[type=submit]');
    let arq = f.arq.files[0];
    if (!arq) return;
    if (arq.size > 20 * 1048576) return toast('O arquivo passa de 20 MB.', 'erro');
    btn.disabled = true; btn.innerHTML = 'Enviando…';
    try {
      if (arq.type.startsWith('image/')) arq = await comprimirImagem(arq);
      await os.enviarAnexo(o.id, arq, { titulo: f.titulo.value.trim(), tipo: f.tipo.value });
      toast('Anexo enviado.');
      recarregar();
    } catch (err) {
      toast(traduzirErro(err), 'erro');
      btn.disabled = false; btn.innerHTML = '<i data-lucide="upload"></i> Enviar'; icones();
    }
  });
  corpo.onclick = async (ev) => {
    const ab = ev.target.closest('[data-abrir]');
    const rm = ev.target.closest('[data-remover]');
    try {
      if (ab) window.open(await os.linkAnexo(ab.dataset.abrir), '_blank', 'noopener');
      if (rm && await confirmar({ titulo: 'Remover anexo', mensagem: 'Remover este anexo da lista? O arquivo continua guardado no histórico.', botao: 'Remover', perigo: true })) {
        await os.removerAnexo(rm.dataset.remover);
        toast('Anexo removido da lista.');
        recarregar();
      }
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  };
}

const ROTULO = {
  title: 'Título', description: 'Descrição', priority: 'Prioridade', type: 'Tipo', is_failure: 'Falha', assigned_to: 'Responsável',
  planned_start: 'Início planejado', due_date: 'Prazo', equipment_id: 'Equipamento', notes: 'Observação', started_at: 'Início', ended_at: 'Fim',
  technician_id: 'Técnico', third_party_name: 'Terceiro', quantity: 'Quantidade', replaced_at: 'Data da troca', reason: 'Motivo da troca',
  amount: 'Valor', supplier: 'Fornecedor', invoice: 'Nota fiscal', incurred_at: 'Data',
};
const OCULTOS = new Set(['updated_at', 'updated_by', 'created_at', 'created_by', 'status_changed_at', 'id', 'hours']);

async function abaAlteracoes(corpo, { o }) {
  const logs = await os.alteracoes(o.id);
  const val = (c, v) => {
    if (v == null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (c === 'priority') return os.PRIORIDADE[v]?.nome || v;
    if (c === 'type') return os.TIPO_OS[v] || v;
    if (c === 'status') return os.STATUS_OS[v]?.nome || v;
    if (['planned_start', 'started_at', 'ended_at', 'finished_at', 'replaced_at'].includes(c)) return fmtDataHora(v);
    if (c === 'amount') return fmtMoeda(v);
    if (c === 'due_date' || c === 'incurred_at') return fmtData(v);
    return String(v);
  };
  const desc = (l) => {
    if (l.table_name === 'work_order_attachments') return l.action === 'insert' ? `Anexo enviado: ${esc(l.new_data?.title)}` : `Anexo removido: ${esc(l.new_data?.title)}`;
    if (l.table_name === 'work_order_parts') {
      if (l.action === 'insert') return `Peça lançada: ${esc(l.new_data?.part_name)} (${esc(String(l.new_data?.quantity))} ${esc(l.new_data?.unit)})`;
      if (l.new_data?.removed_at && !l.old_data?.removed_at) return `Peça removida: ${esc(l.new_data?.part_name)}`;
    }
    if (l.table_name === 'maintenance_costs') {
      if (l.action === 'insert') return `Custo lançado: ${esc(l.new_data?.description)} (${fmtMoeda(l.new_data?.amount)})`;
      if (l.new_data?.removed_at && !l.old_data?.removed_at) return `Custo removido: ${esc(l.new_data?.description)}`;
    }
    if (l.table_name === 'work_order_labor' && l.action === 'insert') return `Horas lançadas: ${fmtDataHora(l.new_data?.started_at)} → ${fmtDataHora(l.new_data?.ended_at)}`;
    if (l.action === 'insert') return 'OS aberta';
    if (l.action === 'status') return `Status: ${esc(val('status', l.old_data?.status))} → <b>${esc(val('status', l.new_data?.status))}</b>`;
    const pre = { work_order_labor: 'Lançamento de horas — ', work_order_parts: `Peça ${esc(l.new_data?.part_name || '')} — `, maintenance_costs: 'Custo — ' }[l.table_name] || '';
    const campos = (l.changed_fields || []).filter((c) => !OCULTOS.has(c) && ROTULO[c]);
    return campos.length ? pre + campos.map((c) => `<div><span class="muted">${esc(ROTULO[c])}:</span>
      <s class="valor-antigo">${esc(val(c, l.old_data?.[c]))}</s> → <b>${esc(val(c, l.new_data?.[c]))}</b></div>`).join('') : `${pre}alterado`;
  };
  corpo.innerHTML = `<div class="card">${logs.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
      <th>Data e hora</th><th>Quem fez</th><th>O que mudou</th><th>Motivo / nota</th></tr></thead><tbody>
      ${logs.map((l) => `<tr><td data-rotulo="Data e hora" class="num">${fmtDataHora(l.created_at)}</td>
        <td data-rotulo="Quem fez">${esc(l.user_name || 'Sistema / SQL Editor')}</td>
        <td data-rotulo="O que mudou" class="small">${desc(l)}</td>
        <td data-rotulo="Motivo / nota" class="small">${esc(l.justification || '—')}</td></tr>`).join('')}
    </tbody></table></div>` : vazio({ icone: 'file-clock', titulo: 'Nenhuma alteração registrada' })}</div>`;
}

// Depois de finalizar: se a OS tem parada em aberto, pergunta se a máquina já voltou a operar
async function perguntarRetorno(o, recarregar) {
  let abertas = [];
  recarregar();   // a ficha atrás já mostra a OS finalizada
  try { abertas = (await paradasDaOS(o.id)).filter((p) => p.is_open); } catch { abertas = []; }
  if (!abertas.length || !pode('downtime.write')) return;
  const p = abertas[0];
  formularioModal({
    titulo: `${p.equipment_tag} já voltou a operar?`,
    campos: `<p style="margin:0">A ${esc(o.number)} foi finalizada. A parada de <b>${esc(p.equipment_tag)}</b> (${esc(p.reason_name)}) ainda está em aberto.</p>
      <div class="campo"><label for="m-ret">Retorno à operação em *</label><input id="m-ret" name="ret" type="datetime-local" required value="${agoraLocal()}" max="${agoraLocal()}"></div>
      <div class="campo"><label for="m-robs">Observação <span class="muted small">(opcional)</span></label><input id="m-robs" name="robs" maxlength="500"></div>
      <p class="muted small" style="margin:0">Se ainda não voltou, toque em <b>Voltar</b>: dá para encerrar depois pela própria parada.</p>`,
    botao: 'Sim, voltou a operar', classe: 'btn-sucesso',
    enviar: (f) => encerrarParada(p.id, new Date(f.ret.value).toISOString(), f.robs.value.trim()),
    sucesso: `Parada encerrada: ${p.equipment_tag} em operação.`, depois: recarregar,
  });
}
