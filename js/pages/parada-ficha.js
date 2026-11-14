// =====================================================================
// Ficha da parada: tempo, fases (reparo × espera), mudar fase, encerrar
// (confirmar retorno), editar dados, corrigir horários e alterações.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, vazio, fmtDataHora } from '../ui.js';
import * as pr from '../services/paradas.js';
import { listarDoEquipamento as osDoEquipamento } from '../services/ordens.js';
import { badgeFase } from './paradas.js';

const paraLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const agoraLocal = () => { const d = new Date(); d.setSeconds(0, 0); return paraLocal(d); };

export async function render(el, [id]) {
  const [p, fases] = await Promise.all([pr.ler(id), pr.fases(id)]);
  if (!p) { el.innerHTML = '<div class="alerta aviso">Parada não encontrada. <a href="#/paradas">Voltar</a></div>'; return; }
  document.getElementById('titulo-pagina').textContent = `Parada — ${p.equipment_tag}`;
  const recarregar = () => render(el, [id]).then(icones);
  const podeEditar = pode('downtime.write');
  const info = (rot, val) => `<div><span class="rotulo">${esc(rot)}</span>${val}</div>`;
  const durFase = (f) => (new Date(f.ended_at || p.ended_at || Date.now()) - new Date(f.started_at)) / 36e5;

  const botoes = [];
  if (podeEditar && p.is_open) {
    botoes.push(['fase', 'git-branch', 'Mudar fase', '']);
    botoes.push(['encerrar', 'circle-check', 'Encerrar parada', 'btn-sucesso']);
  }
  if (podeEditar && !p.is_open) botoes.push(['nova-fase', 'plus', 'Adicionar fase', '']);
  if (podeEditar) {
    botoes.push(['editar', 'pencil', 'Editar dados', '']);
    botoes.push(['horarios', 'clock', 'Corrigir horários', 'btn-texto']);
  }

  el.innerHTML = `
    <a class="voltar" href="#/paradas"><i data-lucide="arrow-left"></i> Paradas</a>
    <div class="card ficha-topo ${p.is_open ? 'st-parado' : 'st-operando'}"><div class="card-corpo">
      <div class="ficha-cab">
        <div><div class="equip-tag grande">${esc(p.equipment_tag)}</div><h1>${esc(p.equipment_name)}</h1>
          <div class="muted">${esc(p.reason_name)} · ${esc(pr.CATEGORIA[p.reason_category])} · ${esc(pr.TIPO_PARADA[p.type])}</div></div>
        <div class="acoes">${botoes.map(([k, ic, t, cl]) => `<button class="btn ${cl}" data-acao="${k}"><i data-lucide="${ic}"></i> ${esc(t)}</button>`).join('')}</div>
      </div>
      <div class="ficha-indicadores os-indicadores">
        ${info('Situação', p.is_open ? `<span class="badge perigo">Em aberto</span>${p.current_phase ? badgeFase(p.current_phase) : ''}` : '<span class="badge ativo">Encerrada</span>')}
        ${info('Duração', `<b class="grande-num">${pr.fmtDuracao(p.duration_hours)}</b>${p.is_open ? '<span class="small muted">e contando</span>' : ''}`)}
        ${info('Reparo × espera', p.phases_count ? `<span><b>${pr.fmtDuracao(p.repair_hours)}</b> reparo</span><span class="small muted">${pr.fmtDuracao(p.waiting_hours)} esperando</span>` : '<span class="muted">sem fases registradas</span>')}
        ${info('Início', `<span>${fmtDataHora(p.started_at)}</span><span class="small muted">registrada por ${esc(p.created_by_name || '—')}</span>`)}
        ${info('Retorno à operação', p.ended_at ? `<span>${fmtDataHora(p.ended_at)}</span><span class="small muted">confirmado por ${esc(p.return_confirmed_by_name || '—')}</span>` : '<span class="muted">aguardando</span>')}
        ${info('Ordem de serviço', p.work_order_id ? `<a href="#/ordens/${p.work_order_id}"><b>${esc(p.work_order_number)}</b></a>` : '<span class="muted">nenhuma</span>')}
      </div>
    </div></div>
    ${p.production_impact || p.notes || p.return_notes ? `<div class="card secao"><div class="card-corpo grade" style="gap:8px">
      ${p.production_impact ? `<div><b>Impacto na produção:</b> ${esc(p.production_impact)}</div>` : ''}
      ${p.notes ? `<div style="white-space:pre-wrap"><b>Observações:</b> ${esc(p.notes)}</div>` : ''}
      ${p.return_notes ? `<div><b>No retorno:</b> ${esc(p.return_notes)}</div>` : ''}</div></div>` : ''}
    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="git-branch"></i> Fases</h3></div>
      ${fases.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th>Fase</th><th>Início</th><th>Fim</th><th>Duração</th><th>Observação</th></tr></thead><tbody>
        ${fases.map((f) => `<tr><td data-rotulo="Fase">${badgeFase(f.phase)}</td>
          <td data-rotulo="Início" class="num">${fmtDataHora(f.started_at)}</td>
          <td data-rotulo="Fim" class="num">${f.ended_at ? fmtDataHora(f.ended_at) : '<span class="badge aviso">atual</span>'}</td>
          <td data-rotulo="Duração" class="num"><b>${pr.fmtDuracao(durFase(f))}</b></td>
          <td data-rotulo="Observação" class="small">${esc(f.notes || '—')}<div class="muted">por ${esc(f.autor?.full_name || '—')}</div></td></tr>`).join('')}
      </tbody></table></div>`
      : `<div class="card-corpo">${vazio({ icone: 'git-branch', titulo: 'Nenhuma fase registrada',
          texto: p.is_open ? 'Use "Mudar fase" para dizer se o equipamento está em reparo ou esperando (peças, equipe, aprovação, terceiros).' : 'Sem fases, esta parada conta como "parcial" no MTTR.' })}</div>`}
    </div>
    ${pode('audit.read') ? '<div class="card secao" id="alt-parada"></div>' : ''}`;

  el.querySelector('.ficha-cab .acoes').addEventListener('click', (ev) => {
    const k = ev.target.closest('[data-acao]')?.dataset.acao; if (!k) return;
    if (k === 'fase') modalFase(p, fases, recarregar);
    if (k === 'encerrar') modalEncerrar(p, recarregar);
    if (k === 'nova-fase') modalFaseRetro(p, recarregar);
    if (k === 'editar') modalEditar(p, recarregar);
    if (k === 'horarios') modalHorarios(p, recarregar);
  });

  if (pode('audit.read')) {
    try {
      const logs = await pr.alteracoes(id);
      el.querySelector('#alt-parada').innerHTML = `<div class="card-titulo"><h3><i data-lucide="file-clock"></i> Alterações</h3></div>
        <div class="card-corpo">${logs.length ? `<ul class="linha-tempo">${logs.map((l) => `<li>
          <div>${esc(descricao(l))}</div>${l.justification ? `<div class="small" style="margin-top:2px">Motivo: ${esc(l.justification)}</div>` : ''}
          <div class="quando">${fmtDataHora(l.created_at)} · ${esc(l.user_name || 'Sistema')}</div></li>`).join('')}</ul>` : '<span class="muted">Nada registrado.</span>'}</div>`;
    } catch { /* auditoria é complementar */ }
  }
}

function descricao(l) {
  if (l.table_name === 'downtime_phases') {
    return l.action === 'insert' ? `Fase iniciada: ${pr.FASE[l.new_data?.phase]?.nome || l.new_data?.phase}` : `Fase encerrada: ${pr.FASE[l.new_data?.phase]?.nome || l.new_data?.phase}`;
  }
  if (l.action === 'insert') return 'Parada registrada';
  if (l.action === 'encerramento') return 'Parada encerrada (retorno confirmado)';
  if (l.action === 'correcao') return `Horários corrigidos: ${fmtDataHora(l.old_data?.started_at)} → ${fmtDataHora(l.new_data?.started_at)}${l.new_data?.ended_at ? ` até ${fmtDataHora(l.new_data.ended_at)}` : ''}`;
  return 'Dados da parada alterados';
}

function modal({ titulo, campos, botao, classe = 'btn-primario', enviar, sucesso, depois }) {
  const { el, fechar } = abrirModal({
    titulo,
    html: `<form id="f-pm" class="grade" style="gap:14px">${campos}<div id="msg-pm"></div></form>`,
    rodape: `<button class="btn" data-fechar>Voltar</button><button class="btn ${classe}" type="submit" form="f-pm">${esc(botao)}</button>`,
  });
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try { await enviar(ev.target); toast(sucesso); fechar(); depois?.(); } catch (err) {
      el.querySelector('#msg-pm').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
  return el;
}

function modalFase(p, fases, depois) {
  const atual = fases.find((f) => !f.ended_at);
  modal({
    titulo: `Mudar fase — ${p.equipment_tag}`,
    campos: `<div>Fase atual: ${atual ? badgeFase(atual.phase) : '<span class="muted">nenhuma</span>'}</div>
      <fieldset class="campo"><legend>Nova fase *</legend>
        ${Object.entries(pr.FASE).filter(([k]) => k !== atual?.phase).map(([k, v]) => `<label class="check-linha"><input type="radio" name="fase" value="${k}" required> ${esc(v.nome)}</label>`).join('')}
      </fieldset>
      <div class="campo"><label for="pm-em">A partir de *</label><input id="pm-em" name="em" type="datetime-local" required value="${agoraLocal()}" max="${agoraLocal()}"></div>
      <div class="campo"><label for="pm-obs">Observação</label><input id="pm-obs" name="obs" maxlength="500" placeholder="Ex.: rolamento 6205 pedido ao fornecedor"></div>`,
    botao: 'Mudar fase',
    enviar: (f) => pr.mudarFase(p.id, f.fase.value, new Date(f.em.value).toISOString(), f.obs.value.trim()),
    sucesso: 'Fase atualizada.', depois,
  });
}

function modalEncerrar(p, depois) {
  modal({
    titulo: `Encerrar parada — ${p.equipment_tag}`,
    campos: `<div class="alerta small"><i data-lucide="info"></i><div>Encerrar confirma que o equipamento <b>voltou a operar</b>. O status muda para "operando" e o tempo da parada para de contar.</div></div>
      <div class="campo"><label for="pm-ret">Retorno à operação em *</label><input id="pm-ret" name="ret" type="datetime-local" required value="${agoraLocal()}" max="${agoraLocal()}"></div>
      <div class="campo"><label for="pm-obs2">Observação</label><input id="pm-obs2" name="obs" maxlength="1000" placeholder="Ex.: testada em carga por 30 min, sem ruído"></div>`,
    botao: 'Confirmar retorno', classe: 'btn-sucesso',
    enviar: (f) => pr.encerrar(p.id, new Date(f.ret.value).toISOString(), f.obs.value.trim()),
    sucesso: 'Parada encerrada. Equipamento de volta a operar.', depois,
  });
}

function modalFaseRetro(p, depois) {
  modal({
    titulo: 'Adicionar fase',
    campos: `<div class="campo"><label for="pm-f">Fase *</label><select id="pm-f" name="fase">${Object.entries(pr.FASE).map(([k, v]) => `<option value="${k}">${esc(v.nome)}</option>`).join('')}</select></div>
      <div class="grade grade-2">
        <div class="campo"><label for="pm-i">Início *</label><input id="pm-i" name="ini" type="datetime-local" required value="${paraLocal(new Date(p.started_at))}"></div>
        <div class="campo"><label for="pm-fm">Fim *</label><input id="pm-fm" name="fim" type="datetime-local" required value="${paraLocal(new Date(p.ended_at))}"></div>
      </div>
      <div class="campo"><label for="pm-o">Observação</label><input id="pm-o" name="obs" maxlength="500"></div>
      <p class="muted small">A fase precisa estar dentro do período da parada e não pode se sobrepor a outra fase.</p>`,
    botao: 'Adicionar',
    enviar: (f) => pr.adicionarFase(p.id, { fase: f.fase.value, inicio: new Date(f.ini.value).toISOString(), fim: new Date(f.fim.value).toISOString(), obs: f.obs.value.trim() }),
    sucesso: 'Fase adicionada.', depois,
  });
}

async function modalEditar(p, depois) {
  const [motivos, ordens] = await Promise.all([pr.motivos(), osDoEquipamento(p.equipment_id).catch(() => [])]);
  modal({
    titulo: 'Editar dados da parada',
    campos: `<div class="campo"><label for="pe-m">Motivo *</label><select id="pe-m" name="motivo">
        ${motivos.filter((m) => m.active || m.id === p.reason_id).map((m) => `<option value="${m.id}" ${m.id === p.reason_id ? 'selected' : ''}>${esc(m.name)} (${esc(pr.CATEGORIA[m.category])})</option>`).join('')}</select></div>
      <div class="campo"><label for="pe-t">Tipo *</label><select id="pe-t" name="tipo">${Object.entries(pr.TIPO_PARADA).map(([k, v]) => `<option value="${k}" ${p.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="pe-os">Ordem de serviço</label><select id="pe-os" name="os"><option value="">Nenhuma</option>
        ${ordens.filter((o) => o.status !== 'cancelada' || o.id === p.work_order_id).map((o) => `<option value="${o.id}" ${o.id === p.work_order_id ? 'selected' : ''}>${esc(o.number)} — ${esc(o.title)}</option>`).join('')}</select></div>
      <div class="campo"><label for="pe-i">Impacto na produção</label><input id="pe-i" name="impacto" maxlength="500" value="${esc(p.production_impact || '')}"></div>
      <div class="campo"><label for="pe-o">Observações</label><textarea id="pe-o" name="obs" rows="3" maxlength="2000">${esc(p.notes || '')}</textarea></div>`,
    botao: 'Salvar',
    enviar: (f) => pr.salvarDados(p.id, { reason_id: f.motivo.value, type: f.tipo.value, work_order_id: f.os.value || null,
      production_impact: f.impacto.value.trim() || null, notes: f.obs.value.trim() || null }),
    sucesso: 'Parada atualizada.', depois,
  });
}

function modalHorarios(p, depois) {
  modal({
    titulo: 'Corrigir horários da parada',
    campos: `<div class="grade grade-2">
        <div class="campo"><label for="ph-i">Início *</label><input id="ph-i" name="ini" type="datetime-local" required value="${paraLocal(new Date(p.started_at))}" max="${agoraLocal()}"></div>
        ${p.ended_at ? `<div class="campo"><label for="ph-f">Retorno *</label><input id="ph-f" name="fim" type="datetime-local" required value="${paraLocal(new Date(p.ended_at))}" max="${agoraLocal()}"></div>` : '<div class="muted small" style="align-self:end">A parada está em aberto: para encerrar use "Encerrar parada".</div>'}
      </div>
      <div class="campo"><label for="ph-j">Justificativa * (mínimo 10 caracteres)</label><textarea id="ph-j" name="just" rows="2" required minlength="10" maxlength="500" placeholder="Ex.: início anotado errado; operador confirmou 06:40"></textarea></div>`,
    botao: 'Salvar correção',
    enviar: (f) => pr.corrigirHorarios(p.id, new Date(f.ini.value).toISOString(), f.fim ? new Date(f.fim.value).toISOString() : null, f.just.value.trim()),
    sucesso: 'Horários corrigidos.', depois,
  });
}
