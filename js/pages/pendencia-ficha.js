// =====================================================================
// Ficha da pendência: detalhes, botões de andamento e histórico.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, vazio, fmtDataHora, fmtData, abrirModal, toast, traduzirErro } from '../ui.js';
import { daPendencia, STATUS_PROG } from '../services/programacao.js';
import * as pe from '../services/pendencias.js';
import { PRIORIDADE, TIPO_OS, responsaveis } from '../services/ordens.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { equipamentosParaEscolher } from '../plantas.js';
import { podeAlterar, badgePend, prazo, abrirPendencia, mudarStatus } from './pendencias.js';

const ROTULO = { title: 'Título', description: 'Detalhes', assigned_to: 'Responsável', due_date: 'Prazo', priority: 'Prioridade',
  equipment_id: 'Equipamento', work_order_id: 'OS', specialty: 'Especialidade', status: 'Situação', done_note: 'Como foi resolvido', cancel_reason: 'Motivo do cancelamento' };

export async function render(el, [id]) {
  const p = await pe.ler(id);
  if (!p) { el.innerHTML = '<div class="alerta aviso">Pendência não encontrada. <a href="#/pendencias">Voltar</a></div>'; return; }
  const recarregar = () => render(el, [id]).then(icones);
  const alt = podeAlterar(p);
  const aberta = pe.ABERTAS.includes(p.status);

  el.innerHTML = `
    <a class="voltar" href="#/pendencias"><i data-lucide="arrow-left"></i> Pendências</a>
    <div class="card ficha-topo"><div class="card-corpo">
      <div class="ficha-cab">
        <div><h1>${esc(p.title)}</h1>
          <div class="muted">Criada por ${esc(p.created_by_name || '—')} em ${fmtDataHora(p.created_at)}</div></div>
        <div class="acoes">
          ${alt && p.status === 'aberta' ? '<button class="btn" data-st="em_andamento"><i data-lucide="play"></i> Iniciar</button>' : ''}
          ${alt && aberta ? '<button class="btn btn-sucesso" data-st="concluida"><i data-lucide="check"></i> Concluir</button>' : ''}
          ${aberta && !p.work_order_id && pode('work_order.manage') ? '<button class="btn btn-primario" id="btn-virar-os"><i data-lucide="clipboard-plus"></i> Virar OS</button>' : ''}
          ${alt && aberta ? '<button class="btn" id="btn-editar"><i data-lucide="pencil"></i> Editar</button>' : ''}
          ${alt && aberta ? '<button class="btn btn-texto" data-st="cancelada"><i data-lucide="circle-x"></i> Cancelar</button>' : ''}
          ${alt && !aberta ? '<button class="btn" data-st="aberta"><i data-lucide="rotate-ccw"></i> Reabrir</button>' : ''}
        </div>
      </div>
      <div class="ficha-indicadores">
        <div><span class="rotulo">Situação</span>${badgePend(p.status)}</div>
        <div><span class="rotulo">Responsável</span><b>${esc(p.assigned_to_name || 'sem responsável')}</b></div>
        <div><span class="rotulo">Prazo</span>${prazo(p)}</div>
        <div><span class="rotulo">Prioridade</span><span class="badge ${PRIORIDADE[p.priority].classe}">${esc(PRIORIDADE[p.priority].nome)}</span></div>
        <div><span class="rotulo">Especialidade</span><b>${esc(pe.ESPECIALIDADE[p.specialty]?.nome || 'Não definida')}</b></div>
        <div><span class="rotulo">Programação</span><span id="prog-pend" class="small muted">—</span></div>
      </div>
    </div></div>
    ${p.status === 'concluida' ? `<div class="alerta sucesso secao"><i data-lucide="circle-check"></i><div>Concluída por ${esc(p.done_by_name || '—')} em ${fmtDataHora(p.done_at)}${p.done_note ? `: ${esc(p.done_note)}` : '.'}</div></div>` : ''}
    ${p.status === 'cancelada' ? `<div class="alerta perigo secao"><i data-lucide="circle-x"></i><div>Cancelada: ${esc(p.cancel_reason || '')}</div></div>` : ''}
    ${!alt && aberta && pode('pending.write') ? '<p class="muted small secao">Só quem criou, o responsável ou o gestor podem alterar esta pendência.</p>' : ''}
    <div class="grade grade-2 secao">
      <div class="card"><div class="card-titulo"><h3><i data-lucide="file-text"></i> Detalhes</h3></div>
        <div class="card-corpo" style="white-space:pre-wrap">${p.description ? esc(p.description) : '<span class="muted">Sem detalhes.</span>'}</div></div>
      <div class="card"><div class="card-titulo"><h3><i data-lucide="link"></i> Ligada a</h3></div>
        <div class="card-corpo grade" style="gap:8px">
          ${p.equipment_id ? `<div><span class="muted">Equipamento:</span> <a href="#/equipamentos/${p.equipment_id}"><b>${esc(p.equipment_tag)}</b> — ${esc(p.equipment_name)}</a></div>` : ''}
          ${p.work_order_id ? `<div><span class="muted">Ordem de serviço:</span> <a href="#/ordens/${p.work_order_id}"><b>${esc(p.work_order_number)}</b></a></div>` : ''}
          ${!p.equipment_id && !p.work_order_id ? '<span class="muted">Nada (pendência avulsa).</span>' : ''}
        </div></div>
    </div>
    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="history"></i> Histórico</h3></div><div id="hist-pend"></div></div>`;

  el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => mudarStatus(p, b.dataset.st, recarregar)));
  el.querySelector('#btn-editar')?.addEventListener('click', () => abrirPendencia({ pend: p, depois: recarregar }));
  el.querySelector('#btn-virar-os')?.addEventListener('click', () => abrirVirarOS(p));

  daPendencia(id).then((xs) => {
    const box = el.querySelector('#prog-pend');
    if (!box || !xs.length) return;
    box.classList.remove('muted');
    box.innerHTML = xs.map((x) => `<a href="#/programacao?semana=${x.scheduled_date}">${fmtData(x.scheduled_date)} · ${esc(x.staff_name)}</a>
      <span class="badge ${STATUS_PROG[x.status].classe}">${esc(STATUS_PROG[x.status].nome)}</span>${x.result_note ? ` <span class="muted">${esc(x.result_note)}</span>` : ''}`).join('<br>');
  }).catch(() => {});
  const logs = await pe.alteracoes(id).catch(() => []);
  const val = (c, v) => (v == null || v === '' ? '—' : c === 'status' ? pe.STATUS_PEND[v]?.nome || v : c === 'priority' ? PRIORIDADE[v]?.nome || v : c === 'specialty' ? pe.ESPECIALIDADE[v]?.nome || v
    : c === 'due_date' ? v.split('-').reverse().join('/') : ['assigned_to', 'equipment_id', 'work_order_id'].includes(c) ? 'alterado' : String(v));
  const desc = (l) => {
    if (l.action === 'insert') return 'Pendência criada';
    const cs = (l.changed_fields || []).filter((c) => ROTULO[c]);
    return cs.length ? cs.map((c) => `<div><span class="muted">${esc(ROTULO[c])}:</span> ${['assigned_to', 'equipment_id', 'work_order_id'].includes(c) ? '<b>alterado</b>'
      : `<s class="valor-antigo">${esc(val(c, l.old_data?.[c]))}</s> → <b>${esc(val(c, l.new_data?.[c]))}</b>`}</div>`).join('') : 'alterada';
  };
  el.querySelector('#hist-pend').innerHTML = logs.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
      <th>Data e hora</th><th>Quem fez</th><th>O que mudou</th></tr></thead><tbody>
      ${logs.map((l) => `<tr><td data-rotulo="Data e hora" class="num">${fmtDataHora(l.created_at)}</td>
        <td data-rotulo="Quem fez">${esc(l.user_name || 'Sistema')}</td><td data-rotulo="O que mudou" class="small">${desc(l)}</td></tr>`).join('')}
    </tbody></table></div>` : vazio({ icone: 'history', titulo: 'Sem histórico visível', texto: pode('audit.read') ? '' : 'O histórico de alterações é visível para gestor e administrador.' });
  icones();
}

// ---------------------------------------------------------------------
// Pendência vira OS: o serviço era maior do que parecia
// ---------------------------------------------------------------------
async function abrirVirarOS(p) {
  const [resp, equips] = await Promise.all([responsaveis().catch(() => []), p.equipment_id ? [] : listarEquipamentos().catch(() => [])]);
  const { el, fechar } = abrirModal({
    titulo: 'Transformar a pendência em OS',
    html: `<form id="f-virar" class="grade" style="gap:14px">
      <div class="alerta info small"><i data-lucide="info"></i><div>A OS é aberta com os dados abaixo. A pendência fica <b>concluída</b> e ligada à OS
        ("Virou a OS-…")${p.next_schedule_date ? ', e o que já estava na programação passa a ser da OS' : ''}. Peças, horas e o histórico ficam na OS.</div></div>
      ${p.equipment_id ? `<div><span class="muted">Equipamento:</span> <b>${esc(p.equipment_tag)}</b> — ${esc(p.equipment_name)}</div>`
        : `<div class="campo"><label for="vo-eq">Equipamento *</label><select id="vo-eq" name="eq" required><option value="">Selecione…</option>
          ${equipamentosParaEscolher(equips, '').filter((e) => e.status !== 'desativado').map((e) => `<option value="${e.id}">${esc(e.tag)} — ${esc(e.name)}</option>`).join('')}</select></div>`}
      <div class="grade grade-form">
        <div class="campo"><label for="vo-tipo">Tipo *</label><select id="vo-tipo" name="tipo">${Object.entries(TIPO_OS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        <div class="campo"><label for="vo-pri">Prioridade *</label><select id="vo-pri" name="pri">${Object.entries(PRIORIDADE).map(([k, v]) => `<option value="${k}" ${k === p.priority ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></div>
      </div>
      <fieldset class="campo" id="vo-falha"><legend>Houve falha do equipamento? * <span class="muted small">(conta no MTBF)</span></legend>
        <label class="check-linha"><input type="radio" name="falha" value="sim" required> Sim — quebrou ou deixou de funcionar como deveria</label>
        <label class="check-linha"><input type="radio" name="falha" value="nao"> Não — desgaste, ajuste ou melhoria</label></fieldset>
      <div class="campo"><label for="vo-tit">Título da OS *</label><input id="vo-tit" name="tit" required minlength="3" maxlength="160" value="${esc(p.title)}"></div>
      <div class="campo"><label for="vo-desc">Descrição</label><textarea id="vo-desc" name="desc" rows="3" maxlength="4000">${esc(p.description || '')}</textarea></div>
      <div class="grade grade-form">
        <div class="campo"><label for="vo-resp">Responsável pela execução</label><select id="vo-resp" name="resp"><option value="">A definir</option>
          ${resp.map((r) => `<option value="${r.id}" ${r.id === p.assigned_to ? 'selected' : ''}>${esc(r.full_name)} (${esc(r.role_name)})</option>`).join('')}</select></div>
        <div class="campo"><label for="vo-prazo">Prazo</label><input id="vo-prazo" name="prazo" type="date" value="${p.due_date || ''}"></div>
      </div>
      <div id="msg-virar"></div></form>`,
    rodape: '<button class="btn" data-fechar>Voltar</button><button class="btn btn-primario" type="submit" form="f-virar"><i data-lucide="clipboard-plus"></i> Abrir a OS</button>',
  });
  const f = el.querySelector('form');
  const ajustar = () => {
    const corretiva = f.tipo.value === 'corretiva';
    el.querySelector('#vo-falha').classList.toggle('oculto', !corretiva);
    f.querySelectorAll('[name=falha]').forEach((r) => { r.required = corretiva; });
  };
  f.tipo.addEventListener('change', ajustar); ajustar();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const os = await pe.virarOS(p.id, { tipo: f.tipo.value, prioridade: f.pri.value, falha: f.querySelector('[name=falha]:checked')?.value === 'sim',
        titulo: f.tit.value.trim(), descricao: f.desc.value.trim(), responsavel: f.resp.value, prazo: f.prazo.value, equipamento: f.eq?.value });
      toast('Pendência transformada em OS.'); fechar(); location.hash = `#/ordens/${os}`;
    } catch (err) {
      el.querySelector('#msg-virar').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
  icones();
}

