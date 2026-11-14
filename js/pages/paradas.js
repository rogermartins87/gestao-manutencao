// =====================================================================
// Paradas — paradas em aberto (com fase atual e tempo correndo), histórico
// por período, horas paradas por motivo e cadastro de motivos.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, vazio, montarTabela, fmtDataHora } from '../ui.js';
import * as pr from '../services/paradas.js';

export const badgeFase = (f) => {
  const x = pr.FASE[f];
  return x ? `<span class="badge ${x.classe}">${esc(x.nome)}</span>` : '<span class="badge inativo">Sem fase</span>';
};

export function tabelaParadas(container, lista, { semEquipamento = false } = {}) {
  montarTabela(container, {
    linhas: lista, busca: false, porPagina: 50,
    aoClicar: (id) => { location.hash = `#/paradas/${id}`; },
    vazioHtml: vazio({ icone: 'octagon-pause', titulo: 'Nenhuma parada no período' }),
    colunas: [
      { titulo: 'Início', valor: (p) => p.started_at, render: (p) => `<span class="nowrap">${fmtDataHora(p.started_at)}</span>`, classe: 'num', primaria: true },
      ...(semEquipamento ? [] : [{ titulo: 'Equipamento', valor: (p) => p.equipment_tag, render: (p) => `<div><b>${esc(p.equipment_tag)}</b><div class="small muted">${esc(p.equipment_name)}</div></div>` }]),
      { titulo: 'Motivo', valor: (p) => p.reason_name, render: (p) => `<div>${esc(p.reason_name)}<div class="small muted">${esc(pr.CATEGORIA[p.reason_category])} · ${esc(pr.TIPO_PARADA[p.type])}</div></div>` },
      { titulo: 'Duração', valor: (p) => Number(p.duration_hours), render: (p) => `<div><b>${pr.fmtDuracao(p.duration_hours)}</b>${p.is_open ? ' <span class="badge perigo">Em aberto</span>' : ''}</div>`, classe: 'num' },
      { titulo: 'Reparo / espera', valor: (p) => Number(p.repair_hours), render: (p) => (p.phases_count ? `${pr.fmtDuracao(p.repair_hours)} / ${pr.fmtDuracao(p.waiting_hours)}` : '<span class="muted small">sem fases</span>'), classe: 'num' },
      { titulo: 'OS', valor: (p) => p.work_order_number || '', render: (p) => esc(p.work_order_number || '—') },
    ],
  });
}

export function cartoesAbertas(lista) {
  return `<div class="grade-paradas">${lista.map((p) => `
    <a class="card parada-card" href="#/paradas/${p.id}">
      <div class="equip-topo"><span class="equip-tag">${esc(p.equipment_tag)}</span>${badgeFase(p.current_phase)}</div>
      <div class="equip-nome">${esc(p.equipment_name)}</div>
      <div class="equip-meta">${esc(p.reason_name)} · desde ${fmtDataHora(p.started_at)}</div>
      <div class="parada-tempo"><i data-lucide="timer"></i> <b>${pr.fmtDuracao(p.duration_hours)}</b> parada</div>
    </a>`).join('')}</div>`;
}

const PERIODOS = { 30: 'Últimos 30 dias', 90: 'Últimos 90 dias', 365: 'Últimos 12 meses', 0: 'Todo o histórico' };

export async function render(el) {
  const podeRegistrar = pode('downtime.write');
  const f = { dias: 30, equip: '', motivo: '', tipo: '' };
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Paradas</h1>
      <p>Quando cada equipamento parou, por quê, e quanto foi reparo × espera.</p></div>
      <div class="acoes">
        ${pode('equipment.write') ? '<button class="btn" id="btn-motivos"><i data-lucide="tags"></i> Motivos</button>' : ''}
        ${podeRegistrar ? '<a class="btn btn-primario" href="#/paradas/nova"><i data-lucide="plus"></i> Registrar parada</a>' : ''}
      </div></div>
    <div id="abertas"></div>
    <h2 class="secao"><i data-lucide="history"></i> Histórico</h2>
    <div class="card card-filtros"><div class="card-corpo filtros-equip">
      <div class="campo"><label for="p-per">Período</label><select id="p-per">
        ${Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${Number(k) === f.dias ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="p-eq">Equipamento</label><select id="p-eq"><option value="">Todos</option></select></div>
      <div class="campo"><label for="p-mot">Motivo</label><select id="p-mot"><option value="">Todos</option></select></div>
      <div class="campo"><label for="p-tipo">Tipo</label><select id="p-tipo"><option value="">Todos</option>
        ${Object.entries(pr.TIPO_PARADA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    </div></div>
    <div id="resumo-motivos"></div>
    <div id="res-paradas"></div>`;

  let lista = [];
  const carregar = async () => {
    const desde = f.dias ? new Date(Date.now() - f.dias * 864e5).toISOString() : null;
    lista = await pr.listar({ desde });
    const abertas = lista.filter((p) => p.is_open);
    el.querySelector('#abertas').innerHTML = abertas.length
      ? `<h2><i data-lucide="octagon-alert"></i> ${abertas.length} parada${abertas.length === 1 ? '' : 's'} em aberto</h2>${cartoesAbertas(abertas)}`
      : '<div class="alerta sucesso"><i data-lucide="circle-check"></i><div>Nenhuma parada em aberto agora.</div></div>';
    const eqs = [...new Map(lista.map((p) => [p.equipment_id, p.equipment_tag])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }));
    const mots = [...new Map(lista.map((p) => [p.reason_id, p.reason_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    el.querySelector('#p-eq').innerHTML = `<option value="">Todos</option>${eqs.map(([id, t]) => `<option value="${id}" ${f.equip === id ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
    el.querySelector('#p-mot').innerHTML = `<option value="">Todos</option>${mots.map(([id, t]) => `<option value="${id}" ${f.motivo === id ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
    desenhar();
  };

  const desenhar = () => {
    const r = lista.filter((p) => (!f.equip || p.equipment_id === f.equip) && (!f.motivo || p.reason_id === f.motivo) && (!f.tipo || p.type === f.tipo));
    // Horas paradas por motivo — do maior para o menor
    const porMotivo = new Map();
    r.forEach((p) => { const x = porMotivo.get(p.reason_name) || { h: 0, n: 0 }; x.h += Number(p.duration_hours); x.n += 1; porMotivo.set(p.reason_name, x); });
    const ordenado = [...porMotivo.entries()].sort((a, b) => b[1].h - a[1].h);
    const max = ordenado[0]?.[1].h || 1;
    const totalH = r.reduce((s, p) => s + Number(p.duration_hours), 0);
    el.querySelector('#resumo-motivos').innerHTML = r.length ? `<div class="card secao"><div class="card-titulo"><h3><i data-lucide="bar-chart-3"></i> Horas paradas por motivo</h3>
        <span class="muted small">${r.length} parada${r.length === 1 ? '' : 's'} · ${pr.fmtDuracao(totalH)} no total</span></div>
      <div class="card-corpo barras-motivo">${ordenado.map(([nome, x]) => `<div class="barra-linha">
        <span class="barra-rotulo">${esc(nome)}</span>
        <span class="barra-trilho"><span class="barra" style="width:${Math.max(2, (x.h / max) * 100).toFixed(1)}%"></span></span>
        <span class="barra-valor"><b>${pr.fmtDuracao(x.h)}</b> <span class="muted small">(${x.n})</span></span></div>`).join('')}</div></div>` : '';
    const res = el.querySelector('#res-paradas');
    res.innerHTML = '<div class="card" id="tab-paradas"></div>';
    tabelaParadas(res.querySelector('#tab-paradas'), r);
    icones();
  };

  el.querySelector('#p-per').onchange = (ev) => { f.dias = Number(ev.target.value); carregar(); };
  el.querySelector('#p-eq').onchange = (ev) => { f.equip = ev.target.value; desenhar(); };
  el.querySelector('#p-mot').onchange = (ev) => { f.motivo = ev.target.value; desenhar(); };
  el.querySelector('#p-tipo').onchange = (ev) => { f.tipo = ev.target.value; desenhar(); };
  el.querySelector('#btn-motivos')?.addEventListener('click', () => abrirMotivos(carregar));
  await carregar();
}

// ---------------------------------------------------------------------
// Cadastro de motivos
// ---------------------------------------------------------------------
export function abrirMotivos(aoFechar) {
  const { el } = abrirModal({
    titulo: 'Motivos de parada', largo: true,
    html: `<form id="f-motivo" class="linha-form" style="margin-bottom:14px">
        <input name="nome" required minlength="2" maxlength="80" placeholder="Novo motivo (ex.: Quebra de correia)" aria-label="Nome do motivo">
        <select name="cat" aria-label="Categoria">${Object.entries(pr.CATEGORIA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <button class="btn btn-primario" type="submit"><i data-lucide="plus"></i> Adicionar</button></form>
      <p class="muted small">A categoria separa falhas (contam no MTBF) de paradas preventivas, operacionais e externas.</p>
      <div id="lista-motivos"></div>`,
    rodape: '<button class="btn" data-fechar>Fechar</button>',
  });
  const desenhar = async () => {
    const ms = await pr.motivos();
    el.querySelector('#lista-motivos').innerHTML = `<table class="tabela"><tbody>${ms.map((m) => `<tr>
      <td>${esc(m.name)} ${m.active ? '' : '<span class="badge inativo">inativo</span>'}</td>
      <td><select data-cat="${m.id}" aria-label="Categoria de ${esc(m.name)}">${Object.entries(pr.CATEGORIA).map(([k, v]) => `<option value="${k}" ${m.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td class="acoes-linha"><button class="btn btn-sm btn-texto" data-ativo="${m.id}" data-v="${m.active ? '0' : '1'}">${m.active ? 'Desativar' : 'Reativar'}</button></td>
    </tr>`).join('')}</tbody></table>`;
  };
  el.querySelector('#f-motivo').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await pr.criarMotivo(ev.target.nome.value, ev.target.cat.value); ev.target.reset(); toast('Motivo adicionado.'); await desenhar(); } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
  el.querySelector('#lista-motivos').addEventListener('change', async (ev) => {
    const s = ev.target.closest('[data-cat]'); if (!s) return;
    try { await pr.salvarMotivo(s.dataset.cat, { category: s.value }); toast('Categoria alterada.'); } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
  el.querySelector('#lista-motivos').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-ativo]'); if (!b) return;
    try { await pr.salvarMotivo(b.dataset.ativo, { active: b.dataset.v === '1' }); await desenhar(); } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
  el.closest('.modal-fundo').addEventListener('click', (ev) => { if (ev.target.closest('[data-fechar]') || ev.target.classList.contains('modal-fundo')) aoFechar?.(); });
  desenhar();
}
