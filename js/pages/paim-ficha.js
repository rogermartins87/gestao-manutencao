// =====================================================================
// Ficha do PAIM: máquinas (próxima data, gerar OS), checklist e histórico.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, confirmar, vazio, montarTabela, fmtData, fmtDataHora } from '../ui.js';
import * as pm from '../services/paim.js';
import { responsaveis } from '../services/ordens.js';
import { formularioModal } from './ordem-ficha.js';
import { situacao } from './paim.js';

const STATUS_CHK = {
  aberto: { nome: 'Em andamento', classe: 'info' },
  concluido: { nome: 'Feito', classe: 'ativo' },
  cancelado: { nome: 'Cancelado', classe: 'inativo' },
};

// Janela "Gerar OS" de uma máquina do PAIM (usada aqui e na ficha do equipamento)
export async function abrirGerarOS(m, qtdItens) {
  const pessoas = await responsaveis().catch(() => []);
  formularioModal({
    titulo: `Gerar OS do PAIM — ${m.equipment_tag}`,
    campos: `<p style="margin:0">A OS de <b>${esc(m.paim_name)}</b> sai <b>aprovada</b>, com o checklist de ${qtdItens} itens (revisão ${pm.revisao(m.paim_revision)}). O técnico marca item por item na própria OS.</p>
      <div class="grade grade-2">
        <div class="campo"><label for="g-resp">Responsável</label><select id="g-resp" name="resp"><option value="">A definir</option>
          ${pessoas.map((x) => `<option value="${x.id}">${esc(x.full_name)}</option>`).join('')}</select></div>
        <div class="campo"><label for="g-prazo">Prazo</label><input id="g-prazo" name="prazo" type="date" value="${m.next_due_date || ''}"></div>
      </div>`,
    botao: 'Gerar OS',
    enviar: async (f) => { const os = await pm.gerarOS(m.id, f.resp.value || null, f.prazo.value || null); toast('OS gerada.'); location.hash = `#/ordens/${os}?aba=checklist`; },
  });
}

export const STATUS_CHECK = STATUS_CHK;

export async function render(el, [id]) {
  const p = await pm.ler(id);
  if (!p) { el.innerHTML = '<div class="alerta aviso">PAIM não encontrado. <a href="#/paim">Voltar</a></div>'; return; }
  document.getElementById('titulo-pagina').textContent = `PAIM — ${p.name}`;
  const [its, maqs, hist] = await Promise.all([pm.itens(id), pm.maquinas(id), pm.historico(id)]);
  const recarregar = () => render(el, [id]).then(icones);
  const planejar = pode('planning.write');
  const gerar = pode('work_order.manage') && p.active;
  const info = (rot, val) => `<div><span class="rotulo">${esc(rot)}</span>${val}</div>`;
  const b = [];
  if (planejar) b.push(['editar', 'pencil', 'Editar', 'btn-primario']);
  if (planejar) b.push(p.active ? ['desativar', 'pause', 'Desativar', 'btn-texto'] : ['reativar', 'play', 'Reativar', '']);

  el.innerHTML = `
    <a class="voltar" href="#/paim"><i data-lucide="arrow-left"></i> PAIM</a>
    <div class="card ficha-topo"><div class="card-corpo">
      <div class="ficha-cab">
        <div><div class="equip-tag grande">PAIM · revisão ${pm.revisao(p.revision)}</div><h1>${esc(p.name)} ${p.active ? '' : '<span class="badge inativo">desativado</span>'}</h1>
          <div class="muted small">${p.revised_at ? `Revisado em ${fmtData(p.revised_at)}${p.revised_by_name ? ` por ${esc(p.revised_by_name)}` : ''}` : ''}</div></div>
        <div class="acoes">${b.map(([k, ic, t, cl]) => `<button class="btn ${cl}" data-acao="${k}"><i data-lucide="${ic}"></i> ${esc(t)}</button>`).join('')}</div>
      </div>
      <div class="ficha-indicadores os-indicadores">
        ${info('Frequência', p.interval_days == null ? '<span class="badge aviso">A definir</span>' : `<b>${esc(pm.frequencia(p.interval_days))}</b>`)}
        ${info('Itens do checklist', `<b class="grande-num">${p.items_count}</b><span class="small muted">${[['mecânica', p.items_mecanica], ['elétrica', p.items_eletrica], ['operacional', p.items_operacional]].filter(([, n]) => Number(n)).map(([l, n]) => `${n} ${l}`).join(' · ')}</span>`)}
        ${info('Máquinas', `<b class="grande-num">${p.equipment_count}</b>`)}
        ${info('Situação', [Number(p.overdue_count) ? `<span class="badge perigo">${p.overdue_count} atrasada${p.overdue_count == 1 ? '' : 's'}</span>` : '',
          Number(p.open_count) ? `<span class="badge info">${p.open_count} em andamento</span>` : ''].filter(Boolean).join(' ') || '<span class="badge ativo">Em dia</span>')}
      </div>
      ${p.interval_days == null && planejar ? `<div class="alerta aviso small" style="margin-top:12px"><i data-lucide="calendar-x"></i><div>Este PAIM ainda não tem frequência.
        Toque em <b>Editar</b> e escolha de quanto em quanto tempo ele é feito. Assim, ao finalizar cada OS, o sistema marca a próxima data sozinho.</div></div>` : ''}
      ${p.description ? `<p style="margin:14px 0 0;white-space:pre-wrap">${esc(p.description)}</p>` : ''}
    </div></div>

    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="factory"></i> Máquinas</h3>
      ${planejar ? `<a class="btn btn-sm" href="#/paim/${id}/editar"><i data-lucide="calendar-cog"></i> Mudar máquinas e datas</a>` : ''}</div>
      <div id="tab-maq"></div></div>

    <div class="grade grade-2 secao">
      <div class="card"><div class="card-titulo"><h3><i data-lucide="list-checks"></i> Checklist</h3></div>
        <div class="card-corpo">${pm.AREAS.map((a) => { const l = its.filter((i) => i.area === a); return l.length ? `
          <h4 class="paim-area-tit"><i data-lucide="${pm.AREA[a].icone}"></i> ${esc(pm.AREA[a].nome)}</h4>
          <ol class="lista-tarefas paim-lista">${l.map((i) => `<li><span><b>${esc(i.item)}</b>${i.how_to ? `<span class="small muted d-bloco">${esc(i.how_to)}</span>` : ''}</span></li>`).join('')}</ol>` : ''; }).join('')
          || '<span class="muted">Sem itens.</span>'}</div></div>
      <div class="card"><div class="card-titulo"><h3><i data-lucide="history"></i> Histórico</h3></div>
        <div id="tab-hist"></div></div>
    </div>`;

  montarTabela(el.querySelector('#tab-maq'), {
    linhas: maqs, busca: maqs.length > 10, porPagina: 50,
    vazioHtml: vazio({ icone: 'factory', titulo: 'Nenhuma máquina neste PAIM', texto: planejar ? 'Toque em "Mudar máquinas e datas" para marcar as máquinas.' : '' }),
    colunas: [
      { titulo: 'Máquina', valor: (m) => m.equipment_tag, render: (m) => `<a href="#/equipamentos/${m.equipment_id}"><b>${esc(m.equipment_tag)}</b></a> <span class="muted small">${esc(m.equipment_name)}</span>`, primaria: true },
      { titulo: 'Próxima data', valor: (m) => m.next_due_date || '', render: (m) => (m.next_due_date ? fmtData(m.next_due_date) : '<span class="muted">—</span>'), classe: 'num' },
      { titulo: 'Última vez', valor: (m) => m.last_done_at || '', render: (m) => (m.last_done_at ? fmtData(m.last_done_at.slice(0, 10)) : '<span class="muted">—</span>'), classe: 'num' },
      { titulo: 'Situação', valor: (m) => (m.open_check_id ? 1 : m.overdue ? 0 : 2), render: situacao },
      { titulo: '', render: (m) => (gerar && !m.open_check_id && m.equipment_status !== 'desativado'
        ? `<button class="btn btn-sm" data-gerar="${m.id}"><i data-lucide="file-plus"></i> Gerar OS</button>` : '') },
    ],
  });

  montarTabela(el.querySelector('#tab-hist'), {
    linhas: hist, busca: false, porPagina: 15,
    vazioHtml: vazio({ icone: 'calendar', titulo: 'Ainda não foi feito', texto: 'Cada OS gerada aparece aqui.' }),
    colunas: [
      { titulo: 'Máquina', valor: (c) => c.equipment_tag, render: (c) => `<b>${esc(c.equipment_tag)}</b>`, primaria: true },
      { titulo: 'OS', valor: (c) => c.work_order_number, render: (c) => `<a href="#/ordens/${c.work_order_id}?aba=checklist">${esc(c.work_order_number)}</a><div class="small muted">rev. ${pm.revisao(c.revision)}</div>` },
      { titulo: 'Quando', valor: (c) => c.done_at || c.created_at, render: (c) => `<span class="badge ${STATUS_CHK[c.status].classe}">${esc(STATUS_CHK[c.status].nome)}</span>
        <div class="small muted">${c.done_at ? `feito em ${fmtDataHora(c.done_at)}` : `gerada em ${fmtData(c.created_at.slice(0, 10))}`}</div>` },
      { titulo: 'Resultado', valor: (c) => Number(c.pending_count), render: (c) => `${c.answered_count} de ${c.items_count}${Number(c.pending_count) ? ` · <span class="badge aviso">${c.pending_count} pendência${c.pending_count == 1 ? '' : 's'}</span>` : ''}` },
    ],
  });

  el.querySelector('#tab-maq').addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-gerar]'); if (!g) return;
    abrirGerarOS(maqs.find((x) => x.id === g.dataset.gerar), p.items_count);
  });

  el.querySelector('.ficha-cab .acoes').addEventListener('click', async (ev) => {
    const k = ev.target.closest('[data-acao]')?.dataset.acao; if (!k) return;
    if (k === 'editar') { location.hash = `#/paim/${id}/editar`; return; }
    const ativar = k === 'reativar';
    const ok = await confirmar({
      titulo: ativar ? 'Reativar PAIM' : 'Desativar PAIM',
      mensagem: ativar ? 'O PAIM volta a aparecer nas listas e a gerar OS.'
        : 'O PAIM deixa de gerar OS e sai das listas de atrasadas. As OS já abertas continuam. O histórico fica guardado.',
      botao: ativar ? 'Reativar' : 'Desativar', perigo: !ativar,
    });
    if (!ok) return;
    try {
      await pm.salvar(id, {
        name: p.name, description: p.description, interval_days: p.interval_days, priority: p.priority, active: ativar,
        items: its.map((i) => ({ id: i.id, area: i.area, item: i.item, how_to: i.how_to })),
        equipment: maqs.map((m) => ({ equipment_id: m.equipment_id, next_due_date: m.next_due_date })),
      });
      toast(ativar ? 'PAIM reativado.' : 'PAIM desativado.'); recarregar();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
}
