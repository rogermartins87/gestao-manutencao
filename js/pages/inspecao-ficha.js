// =====================================================================
// Ficha da inspeção: medições (com o limite da época), resultado,
// OS gerada, anulação com motivo e alterações.
// =====================================================================
import { pode, store } from '../store.js';
import { esc, icones, toast, vazio, fmtDataHora, hojeISO } from '../ui.js';
import * as pd from '../services/preditiva.js';
import { responsaveis, PRIORIDADE } from '../services/ordens.js';
import { badgeResultado } from './preditiva.js';
import { formularioModal } from './ordem-ficha.js';

export async function render(el, [id]) {
  const i = await pd.lerInspecao(id);
  if (!i) { el.innerHTML = '<div class="alerta aviso">Inspeção não encontrada. <a href="#/preditiva?aba=inspecoes">Voltar</a></div>'; return; }
  const ms = await pd.medicoes(id);
  // do pior para o melhor
  const grau = { critico: 0, alerta: 1, normal: 2, sem_limite: 3 };
  ms.sort((a, b) => grau[a.status] - grau[b.status] || a.point.localeCompare(b.point, 'pt-BR'));
  const recarregar = () => render(el, [id]).then(icones);
  const podeOS = (pode('work_order.manage') || pode('work_order.request'))
    && !i.voided_at && !i.work_order_id && i.result !== 'normal' && i.equipment_status !== 'desativado';
  const podeAnular = !i.voided_at && !i.work_order_id
    && (pode('planning.write') || (pode('inspection.write') && i.created_by === store.perfil?.id));
  document.getElementById('titulo-pagina').textContent = `Inspeção — ${i.equipment_tag}`;

  el.innerHTML = `
    <a class="voltar" href="#/preditiva?aba=inspecoes"><i data-lucide="arrow-left"></i> Inspeções</a>
    <div class="card ficha-topo"><div class="card-corpo">
      <div class="ficha-cab">
        <div><div class="equip-tag grande"><a href="#/equipamentos/${i.equipment_id}?aba=preditiva">${esc(i.equipment_tag)}</a></div>
          <h1>${esc(pd.TECNICA[i.type].nome)} — ${fmtDataHora(i.performed_at)}</h1>
          <div class="muted">${esc(i.equipment_name)} · registrada por ${esc(i.performed_by_name || '—')}</div></div>
        <div class="acoes">
          ${podeOS ? '<button class="btn btn-primario" id="btn-os"><i data-lucide="file-plus"></i> Gerar OS</button>' : ''}
          ${podeAnular ? '<button class="btn" id="btn-anular"><i data-lucide="ban"></i> Anular</button>' : ''}
        </div>
      </div>
      <div class="ficha-indicadores">
        <div><span class="rotulo">Resultado</span>${i.voided_at ? '<span class="badge inativo">anulada</span>' : badgeResultado(i.result)}
          ${i.informed_result !== 'normal' ? `<span class="small muted">agravado pelo inspetor (${esc(pd.RESULTADO[i.informed_result].nome.toLowerCase())})</span>` : ''}</div>
        <div><span class="rotulo">Medições</span><b>${ms.length || 'visual'}</b>${Number(i.out_of_limit_count) ? `<span class="small muted">${i.out_of_limit_count} fora do limite</span>` : ''}</div>
        <div><span class="rotulo">Ordem de serviço</span>${i.work_order_id
          ? `<a href="#/ordens/${i.work_order_id}"><b>${esc(i.work_order_number)}</b></a>`
          : `<span class="muted">${i.result === 'normal' ? 'não precisa' : 'nenhuma ainda'}</span>`}</div>
      </div>
    </div></div>
    ${i.voided_at ? `<div class="alerta perigo secao"><i data-lucide="ban"></i><div><b>Inspeção anulada</b> por ${esc(i.voided_by_name || '—')} em ${fmtDataHora(i.voided_at)}.
      Motivo: ${esc(i.voided_reason)}. Ela não conta na situação dos pontos.</div></div>` : ''}
    ${!i.voided_at && i.result !== 'normal' && !i.work_order_id ? `<div class="alerta aviso secao"><i data-lucide="triangle-alert"></i><div>
      Resultado ${esc(pd.RESULTADO[i.result].nome.toLowerCase())}: ${podeOS ? 'gere a OS preditiva para programar a correção.' : 'peça a abertura da OS preditiva ao planejamento.'}</div></div>` : ''}
    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="ruler"></i> Medições</h3></div>
      <div id="tab-med"></div></div>
    ${i.notes ? `<div class="card secao"><div class="card-titulo"><h3><i data-lucide="message-square"></i> Observações</h3></div>
      <div class="card-corpo" style="white-space:pre-wrap">${esc(i.notes)}</div></div>` : ''}
    ${pode('audit.read') ? '<div class="card secao"><div class="card-titulo"><h3><i data-lucide="file-clock"></i> Alterações</h3></div><div id="aud-insp"></div></div>' : ''}`;

  const tab = el.querySelector('#tab-med');
  tab.innerHTML = ms.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
      <th>Ponto</th><th class="num">Valor</th><th>Limites (na época)</th><th>Situação</th></tr></thead><tbody>
      ${ms.map((m) => `<tr><td data-rotulo="Ponto" class="primaria"><div>${m.point_id ? `<a href="#/preditiva/pontos/${m.point_id}"><b>${esc(m.point)}</b></a>` : `<b>${esc(m.point)}</b> <span class="badge inativo">avulsa</span>`}
          <div class="small muted">${esc(m.variable)}</div></div></td>
        <td data-rotulo="Valor" class="num"><b class="nowrap">${pd.fmtMedida(m.value)} ${esc(m.unit)}</b></td>
        <td data-rotulo="Limites" class="small">${esc(pd.textoLimites(m))}</td>
        <td data-rotulo="Situação">${badgeResultado(m.status)}</td></tr>`).join('')}
    </tbody></table></div>` : vazio({ icone: 'eye', titulo: 'Inspeção visual (sem medições)' });

  el.querySelector('#btn-os')?.addEventListener('click', async () => {
    const gerencia = pode('work_order.manage');
    const pessoas = gerencia ? await responsaveis().catch(() => []) : [];
    const pri = i.result === 'critico' ? 'urgente' : 'alta';
    formularioModal({
      titulo: 'Gerar OS preditiva',
      campos: `<p style="margin:0">A OS sai com a lista do que ficou fora do limite${i.notes ? ' e as observações' : ''}. Não conta como falha no MTBF.
          ${pode('work_order.approve') ? '' : 'Ela nasce <b>aberta</b> e precisa ser aprovada.'}</p>
        <div class="campo"><label for="m-pri">Prioridade</label><select id="m-pri" name="pri">
          ${Object.entries(PRIORIDADE).map(([k, x]) => `<option value="${k}" ${k === pri ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        ${gerencia ? `<div class="campo"><label for="m-resp">Responsável</label><select id="m-resp" name="resp"><option value="">A definir</option>
            ${pessoas.map((x) => `<option value="${x.id}">${esc(x.full_name)}</option>`).join('')}</select></div>
          <div class="campo"><label for="m-prazo">Prazo</label><input id="m-prazo" name="prazo" type="date" min="${hojeISO()}"></div>` : ''}`,
      botao: 'Gerar OS',
      enviar: async (f) => {
        const os = await pd.gerarOS(i.id, f.pri.value, f.resp?.value || null, f.prazo?.value || null);
        toast('OS preditiva gerada.');
        location.hash = `#/ordens/${os}`;
      },
      sucesso: null,
    });
  });

  el.querySelector('#btn-anular')?.addEventListener('click', () => formularioModal({
    titulo: 'Anular inspeção',
    campos: `<p style="margin:0">Use quando a inspeção foi lançada errada (equipamento, valor ou data). Ela fica no histórico como <b>anulada</b> e deixa de contar na situação dos pontos. Depois, registre a inspeção correta.</p>
      <div class="campo"><label for="m-mot">Motivo *</label><textarea id="m-mot" name="mot" rows="3" required minlength="10" maxlength="1000" placeholder="Ex.: valor do mancal LA digitado errado"></textarea></div>`,
    botao: 'Anular inspeção', classe: 'btn-perigo',
    enviar: async (f) => pd.anular(i.id, f.mot.value.trim()),
    sucesso: 'Inspeção anulada.', depois: recarregar,
  }));

  const aud = el.querySelector('#aud-insp');
  if (aud) {
    const logs = await pd.alteracoes([i.id]).catch(() => []);
    const desc = (l) => (l.action === 'insert' ? 'Inspeção registrada'
      : l.action === 'anulacao' ? '<b>Inspeção anulada</b>'
        : (l.changed_fields || []).includes('work_order_id') ? (l.new_data?.work_order_id ? 'OS preditiva gerada' : 'OS cancelada — inspeção liberada para nova OS')
          : (l.changed_fields || []).includes('result') ? `Resultado: <b>${esc(pd.RESULTADO[l.new_data?.result]?.nome || '')}</b>` : 'alterada');
    aud.innerHTML = logs.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
        <th>Data e hora</th><th>Quem fez</th><th>O que mudou</th><th>Motivo / nota</th></tr></thead><tbody>
        ${logs.map((l) => `<tr><td data-rotulo="Data e hora" class="num">${fmtDataHora(l.created_at)}</td>
          <td data-rotulo="Quem fez">${esc(l.user_name || 'Sistema')}</td>
          <td data-rotulo="O que mudou" class="small">${desc(l)}</td>
          <td data-rotulo="Motivo / nota" class="small">${esc(l.justification || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : vazio({ icone: 'file-clock', titulo: 'Nenhuma alteração registrada' });
  }
  icones();
}
