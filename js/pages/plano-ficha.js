// =====================================================================
// Ficha do plano preventivo: dados, próximo vencimento (gerar OS, pular,
// reprogramar), tarefas (checklist da OS) e histórico da agenda.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, confirmar, vazio, montarTabela, fmtData, fmtDataHora, fmtNum, numOuNulo, hojeISO } from '../ui.js';
import * as pv from '../services/preventiva.js';
import { badgeSituacao, vencimento } from './preventiva.js';
import { formularioModal } from './ordem-ficha.js';
import { badgePrioridade } from './ordens.js';

export async function render(el, [id]) {
  const p = await pv.lerPlano(id);
  if (!p) { el.innerHTML = '<div class="alerta aviso">Plano não encontrado. <a href="#/preventiva?aba=planos">Voltar</a></div>'; return; }
  document.getElementById('titulo-pagina').textContent = `${p.equipment_tag} — ${p.name}`;
  const [tarefas, agenda] = await Promise.all([pv.tarefas(id), pv.agendaDoPlano(id)]);
  const recarregar = () => render(el, [id]).then(icones);
  const planejar = pode('planning.write');
  const gerar = pode('work_order.manage');
  const prox = agenda.find((s) => ['prevista', 'os_gerada'].includes(s.status));
  const info = (rot, val) => `<div><span class="rotulo">${esc(rot)}</span>${val}</div>`;

  const b = [];
  if (prox?.status === 'prevista' && p.active && gerar) b.push(['gerar', 'file-plus', 'Gerar OS', 'btn-primario']);
  if (prox?.status === 'prevista' && planejar) b.push(['reprogramar', 'calendar-cog', 'Reprogramar', ''], ['pular', 'skip-forward', 'Pular esta', '']);
  if (planejar) b.push(['editar', 'pencil', 'Editar', '']);
  if (planejar) b.push(p.active ? ['desativar', 'pause', 'Desativar', 'btn-texto'] : ['reativar', 'play', 'Reativar', '']);

  el.innerHTML = `
    <a class="voltar" href="#/preventiva?aba=planos"><i data-lucide="arrow-left"></i> Planejamento preventivo</a>
    <div class="card ficha-topo"><div class="card-corpo">
      <div class="ficha-cab">
        <div><div class="equip-tag grande">${esc(p.equipment_tag)}</div><h1>${esc(p.name)} ${p.active ? '' : '<span class="badge inativo">desativado</span>'}</h1>
          <div class="muted"><a href="#/equipamentos/${p.equipment_id}?aba=preventiva">${esc(p.equipment_name)}</a>${p.equipment_sector ? ` · ${esc(p.equipment_sector)}` : ''}</div></div>
        <div class="acoes">${b.map(([k, ic, t, cl]) => `<button class="btn ${cl}" data-acao="${k}"><i data-lucide="${ic}"></i> ${esc(t)}</button>`).join('')}</div>
      </div>
      ${!p.active && p.deactivated_reason ? `<div class="alerta aviso small" style="margin-top:12px"><i data-lucide="pause"></i><div><b>Desativado:</b> ${esc(p.deactivated_reason)}</div></div>` : ''}
      <div class="ficha-indicadores os-indicadores">
        ${info('Quando', `<b>${esc(pv.GATILHO[p.trigger].nome)}</b><span>${esc(pv.intervalo(p))}</span>`)}
        ${info('Tolerância', `<span>${[p.interval_days ? `${p.tolerance_days} dia${p.tolerance_days === 1 ? '' : 's'}` : null, p.interval_hours ? `${fmtNum(p.tolerance_hours, 0)} h` : null].filter(Boolean).join(' / ')}</span>`)}
        ${info('Próximo vencimento', prox ? `${vencimento(prox)}${badgeSituacao(prox.situacao)}` : '<span class="muted">—</span>')}
        ${info('Execuções no prazo', Number(p.executed_count) ? `<b class="grande-num">${p.on_time_count} de ${p.executed_count}</b><span class="small muted">última ${fmtData(p.last_executed_at)}</span>` : '<span class="muted">nenhuma ainda</span>')}
        ${info('OS', `<span>${badgePrioridade(p.priority)}</span><span class="small muted">responsável: ${esc(p.default_assignee_name || 'a definir')}</span>`)}
        ${info('Tarefas', `<b>${p.tasks_count}</b>${p.estimated_minutes ? `<span class="small muted">≈ ${fmtNum(p.estimated_minutes / 60, 1)} h estimadas</span>` : ''}`)}
      </div>
      ${prox?.work_order_id ? `<div class="alerta info small" style="margin-top:12px"><i data-lucide="file-check"></i><div>OS <a href="#/ordens/${prox.work_order_id}"><b>${esc(prox.work_order_number)}</b></a> gerada para este vencimento.
        Ao concluir a OS, a próxima data é agendada a partir da execução.</div></div>` : ''}
      ${p.description ? `<p style="margin:14px 0 0;white-space:pre-wrap">${esc(p.description)}</p>` : ''}
    </div></div>

    <div class="grade grade-2 secao">
      <div class="card"><div class="card-titulo"><h3><i data-lucide="list-checks"></i> Tarefas (checklist da OS)</h3></div>
        <div class="card-corpo">
          ${tarefas.length ? `<ol class="lista-tarefas">${tarefas.map((t) => `<li class="${t.active ? '' : 'inativa'}">
            <span>${esc(t.description)}${t.estimated_minutes ? ` <span class="muted small">(${t.estimated_minutes} min)</span>` : ''}${t.active ? '' : ' <span class="badge inativo">desativada</span>'}</span>
            ${planejar ? `<span class="acoes-linha"><button class="btn btn-sm btn-texto" data-tarefa="${t.id}" title="Alterar"><i data-lucide="pencil"></i></button>
              <button class="btn btn-sm btn-texto" data-ativa="${t.id}" data-v="${t.active ? '0' : '1'}">${t.active ? 'Desativar' : 'Reativar'}</button></span>` : ''}
          </li>`).join('')}</ol>` : `<p class="muted" style="margin:0 0 12px">Nenhuma tarefa ainda.${planejar ? ' Cadastre o passo a passo: ele vai na descrição de cada OS gerada.' : ''}</p>`}
          ${planejar ? `<form id="f-tarefa" class="linha-form" style="margin-top:12px">
            <input name="desc" required minlength="3" maxlength="500" placeholder="Nova tarefa (ex.: Lubrificar guias lineares)" aria-label="Descrição da tarefa">
            <input name="min" type="number" min="1" max="1440" placeholder="min" aria-label="Minutos estimados" style="width:90px">
            <button class="btn btn-primario" type="submit"><i data-lucide="plus"></i> Adicionar</button></form>` : ''}
        </div></div>
      <div class="card"><div class="card-titulo"><h3><i data-lucide="history"></i> Agenda e histórico</h3></div>
        <div id="tab-hist"></div></div>
    </div>`;

  montarTabela(el.querySelector('#tab-hist'), {
    linhas: agenda, busca: false, porPagina: 20,
    vazioHtml: vazio({ icone: 'calendar', titulo: 'Sem itens' }),
    colunas: [
      { titulo: 'Nº', chave: 'sequence', render: (s) => `<b>${s.sequence}</b>`, classe: 'num', primaria: true },
      { titulo: 'Previsto', valor: (s) => s.due_date || '', render: vencimento, classe: 'num' },
      { titulo: 'Situação', valor: (s) => s.status, render: (s) => `<div>${badgeSituacao(s.situacao)}${s.status === 'executada' ? (s.on_time ? ' <span class="badge ativo">no prazo</span>' : ' <span class="badge perigo">fora do prazo</span>') : ''}
        ${s.executed_at ? `<div class="small muted">em ${fmtDataHora(s.executed_at)}${s.executed_hour_meter != null ? ` · ${fmtNum(s.executed_hour_meter, 0)} h` : ''}</div>` : ''}
        ${s.notes ? `<div class="small muted">${esc(s.notes)}</div>` : ''}</div>` },
      { titulo: 'OS', valor: (s) => s.work_order_number || '', render: (s) => (s.work_order_id ? `<a href="#/ordens/${s.work_order_id}">${esc(s.work_order_number)}</a>` : '—') },
    ],
  });

  el.querySelector('.ficha-cab .acoes').addEventListener('click', async (ev) => {
    const k = ev.target.closest('[data-acao]')?.dataset.acao; if (!k) return;
    if (k === 'editar') { location.hash = `#/preventiva/planos/${id}/editar`; return; }
    if (k === 'gerar') {
      try { const os = await pv.gerarOS(prox.id); toast('OS gerada.'); location.hash = `#/ordens/${os}`; } catch (err) { toast(traduzirErro(err), 'erro'); }
      return;
    }
    if (k === 'reativar') {
      if (await confirmar({ titulo: 'Reativar plano', mensagem: 'O plano volta a agendar. O próximo vencimento será contado a partir de hoje (e do horímetro atual).', botao: 'Reativar' })) {
        try { await pv.reativarPlano(id); toast('Plano reativado.'); recarregar(); } catch (err) { toast(traduzirErro(err), 'erro'); }
      }
      return;
    }
    const motivo = (ph) => `<div class="campo"><label for="m-mot">Motivo * <span class="muted small">(mínimo 10 caracteres)</span></label>
      <textarea id="m-mot" name="mot" rows="2" required minlength="10" maxlength="500" placeholder="${ph}"></textarea></div>`;
    if (k === 'desativar') {
      formularioModal({ titulo: 'Desativar plano',
        campos: `<p style="margin:0">O item previsto sai da agenda e nenhuma OS nova é gerada. Uma OS já gerada continua valendo. O histórico fica guardado.</p>
          <div class="campo"><label for="m-mot">Motivo *</label><input id="m-mot" name="mot" required minlength="5" maxlength="300" placeholder="Ex.: equipamento vendido"></div>`,
        botao: 'Desativar', classe: 'btn-perigo', enviar: (f) => pv.desativarPlano(id, f.mot.value.trim()), sucesso: 'Plano desativado.', depois: recarregar });
    }
    if (k === 'pular') {
      formularioModal({ titulo: 'Pular este vencimento',
        campos: `<p style="margin:0">Vencimento: ${vencimento(prox)}</p><p class="muted small" style="margin:0">O próximo será contado a partir deste vencimento. Itens pulados não contam no cumprimento.</p>
          ${motivo('Ex.: feita junto com a parada geral da usina')}`,
        botao: 'Pular', enviar: (f) => pv.pular(prox.id, f.mot.value.trim()), sucesso: 'Vencimento pulado.', depois: recarregar });
    }
    if (k === 'reprogramar') {
      formularioModal({ titulo: 'Reprogramar vencimento',
        campos: `<div class="grade grade-2">
            ${p.interval_days ? `<div class="campo"><label for="m-data">Nova data *</label><input id="m-data" name="data" type="date" required value="${prox.due_date || hojeISO()}"></div>` : ''}
            ${p.interval_hours ? `<div class="campo"><label for="m-hm">Novo horímetro (h) *</label><input id="m-hm" name="hm" inputmode="decimal" required value="${String(prox.due_hour_meter ?? '').replace('.', ',')}"></div>` : ''}
          </div>${motivo('Ex.: antecipada para a parada programada de dezembro')}`,
        botao: 'Reprogramar',
        enviar: (f) => {
          const hm = p.interval_hours ? numOuNulo(f.hm.value) : null;
          if (p.interval_hours && (hm == null || hm < 0)) throw new Error('Informe o horímetro.');
          return pv.reprogramar(prox.id, p.interval_days ? f.data.value : null, hm, f.mot.value.trim());
        },
        sucesso: 'Vencimento reprogramado.', depois: recarregar });
    }
  });

  el.querySelector('#f-tarefa')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const pos = (tarefas.reduce((m, t) => Math.max(m, t.position), 0) || 0) + 1;
    try {
      await pv.criarTarefa({ plan_id: id, position: Math.min(pos, 999), description: f.desc.value.trim(), estimated_minutes: f.min.value ? Number(f.min.value) : null });
      toast('Tarefa adicionada.'); recarregar();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
  el.querySelector('.lista-tarefas')?.addEventListener('click', async (ev) => {
    const at = ev.target.closest('[data-ativa]');
    const ed = ev.target.closest('[data-tarefa]');
    if (at) {
      try { await pv.salvarTarefa(at.dataset.ativa, { active: at.dataset.v === '1' }); recarregar(); } catch (err) { toast(traduzirErro(err), 'erro'); }
    }
    if (ed) {
      const t = tarefas.find((x) => x.id === ed.dataset.tarefa);
      formularioModal({ titulo: 'Alterar tarefa',
        campos: `<div class="campo"><label for="m-td">Descrição *</label><input id="m-td" name="desc" required minlength="3" maxlength="500" value="${esc(t.description)}"></div>
          <div class="grade grade-2"><div class="campo"><label for="m-tp">Ordem</label><input id="m-tp" name="pos" type="number" min="1" max="999" value="${t.position}"></div>
          <div class="campo"><label for="m-tm">Minutos estimados</label><input id="m-tm" name="min" type="number" min="1" max="1440" value="${t.estimated_minutes ?? ''}"></div></div>`,
        botao: 'Salvar',
        enviar: (f) => pv.salvarTarefa(t.id, { description: f.desc.value.trim(), position: Number(f.pos.value || 1), estimated_minutes: f.min.value ? Number(f.min.value) : null }),
        sucesso: 'Tarefa alterada.', depois: recarregar });
    }
  });
}
