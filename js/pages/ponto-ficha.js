// =====================================================================
// Ficha do ponto de medição: limites, gráfico da evolução com as linhas
// de alerta e crítico, histórico de medições e alterações.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, vazio, montarTabela, fmtData, fmtDataHora } from '../ui.js';
import * as pd from '../services/preditiva.js';
import { badgeResultado, abrirPonto } from './preditiva.js';
import { formularioModal } from './ordem-ficha.js';

// Gráfico simples (SVG, sem biblioteca), com as faixas de alerta e crítico
export function graficoPonto(p, hist) {
  const pts = hist.map((m) => ({ t: new Date(m.performed_at).getTime(), v: Number(m.value), m })).sort((a, b) => a.t - b.t);
  if (!pts.length) return '';
  const W = 640; const H = 240; const mg = { e: 56, d: 16, c: 14, b: 30 };
  const lim = [p.alert_limit, p.critical_limit].filter((x) => x != null).map(Number);
  let v0 = Math.min(...pts.map((x) => x.v), ...lim); let v1 = Math.max(...pts.map((x) => x.v), ...lim);
  const folga = (v1 - v0) * 0.1 || Math.abs(v1) * 0.1 || 1; v0 -= folga; v1 += folga;
  if (p.direction !== 'abaixo' && v0 < 0 && pts.every((x) => x.v >= 0)) v0 = 0;
  const t0 = pts[0].t; const t1 = pts[pts.length - 1].t;
  const X = (t) => (t1 === t0 ? (mg.e + W - mg.d) / 2 : mg.e + ((t - t0) / (t1 - t0)) * (W - mg.e - mg.d));
  const Y = (v) => H - mg.b - ((v - v0) / (v1 - v0)) * (H - mg.c - mg.b);
  const dataCurta = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const faixa = (de, ate, cl) => { const a = Y(Math.min(Math.max(de, v0), v1)); const b = Y(Math.min(Math.max(ate, v0), v1));
    return `<rect x="${mg.e}" width="${W - mg.e - mg.d}" y="${Math.min(a, b).toFixed(1)}" height="${Math.abs(a - b).toFixed(1)}" class="${cl}"/>`; };
  const al = p.alert_limit == null ? null : Number(p.alert_limit); const cr = p.critical_limit == null ? null : Number(p.critical_limit);
  const faixas = p.direction === 'abaixo'
    ? `${al != null ? faixa(cr ?? v0, al, 'faixa-alerta') : ''}${cr != null ? faixa(v0, cr, 'faixa-critico') : ''}`
    : `${al != null ? faixa(al, cr ?? v1, 'faixa-alerta') : ''}${cr != null ? faixa(cr, v1, 'faixa-critico') : ''}`;
  const linha = (v, cl, txt) => (v == null ? '' : `<line x1="${mg.e}" x2="${W - mg.d}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="${cl}"/>
    <text x="${W - mg.d - 4}" y="${(Y(v) - 4).toFixed(1)}" text-anchor="end" class="eixo">${txt} ${pd.fmtMedida(v)}</text>`);
  const marcas = [0, 0.5, 1].map((k) => v0 + k * (v1 - v0));
  return `<svg class="grafico-hm grafico-pd" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução de ${esc(p.name)}">
    ${faixas}
    ${marcas.map((v) => `<line x1="${mg.e}" x2="${W - mg.d}" y1="${Y(v)}" y2="${Y(v)}" class="grade-linha"/>
      <text x="${mg.e - 8}" y="${Y(v) + 4}" text-anchor="end" class="eixo">${pd.fmtMedida(Math.round(v * 100) / 100)}</text>`).join('')}
    ${linha(al, 'lim-alerta', 'alerta')}${linha(cr, 'lim-critico', 'crítico')}
    <text x="${mg.e}" y="${H - 8}" class="eixo">${dataCurta(t0)}</text>
    ${t1 !== t0 ? `<text x="${W - mg.d}" y="${H - 8}" text-anchor="end" class="eixo">${dataCurta(t1)}</text>` : ''}
    ${pts.length > 1 ? `<polyline class="linha" points="${pts.map((q) => `${X(q.t).toFixed(1)},${Y(q.v).toFixed(1)}`).join(' ')}"/>` : ''}
    ${pts.map((q) => `<circle class="ponto st-${q.m.status}" cx="${X(q.t).toFixed(1)}" cy="${Y(q.v).toFixed(1)}" r="4.5"><title>${fmtDataHora(q.m.performed_at)}: ${pd.fmtMedida(q.v)} ${esc(p.unit)}</title></circle>`).join('')}
  </svg>`;
}

export async function render(el, [id]) {
  const p = await pd.lerPonto(id);
  if (!p) { el.innerHTML = '<div class="alerta aviso">Ponto não encontrado. <a href="#/preditiva">Voltar</a></div>'; return; }
  const hist = await pd.historicoDoPonto(id);
  const recarregar = () => render(el, [id]).then(icones);
  const planeja = pode('planning.write');
  document.getElementById('titulo-pagina').textContent = `${p.equipment_tag} — ${p.name}`;

  el.innerHTML = `
    <a class="voltar" href="#/equipamentos/${p.equipment_id}?aba=preditiva"><i data-lucide="arrow-left"></i> ${esc(p.equipment_tag)}</a>
    <div class="card ficha-topo"><div class="card-corpo">
      <div class="ficha-cab">
        <div><div class="equip-tag grande"><a href="#/equipamentos/${p.equipment_id}?aba=preditiva">${esc(p.equipment_tag)}</a></div>
          <h1>${esc(p.name)} ${p.active ? '' : '<span class="badge inativo">desativado</span>'}</h1>
          <div class="muted">${esc(pd.TECNICA[p.technique].nome)} · ${esc(p.variable)} (${esc(p.unit)}) · ${esc(p.equipment_name)}</div></div>
        <div class="acoes">
          ${pode('inspection.write') && p.active ? `<a class="btn btn-primario" href="#/preditiva/inspecoes/nova?equipamento=${p.equipment_id}&tecnica=${p.technique}"><i data-lucide="clipboard-plus"></i> Registrar inspeção</a>` : ''}
          ${planeja ? '<button class="btn" id="btn-editar"><i data-lucide="pencil"></i> Editar</button>' : ''}
          ${planeja ? `<button class="btn" id="btn-ativo"><i data-lucide="${p.active ? 'circle-off' : 'circle-check'}"></i> ${p.active ? 'Desativar' : 'Reativar'}</button>` : ''}
        </div>
      </div>
      <div class="ficha-indicadores">
        <div><span class="rotulo">Situação</span>${badgeResultado(p.situacao)}${p.overdue ? '<span class="small perigo-txt">rota atrasada</span>' : ''}</div>
        <div><span class="rotulo">Última medição</span>${p.last_value == null ? '<span class="muted">—</span>' : `<b>${pd.fmtMedida(p.last_value)} ${esc(p.unit)}</b><span class="small muted">${fmtDataHora(p.last_at)}</span>`}</div>
        <div><span class="rotulo">Limites</span><b class="small">${esc(pd.textoLimites(p))}</b>
          <span class="small muted">${p.interval_days ? `medir a cada ${p.interval_days} dia${p.interval_days === 1 ? '' : 's'}${p.next_due_date ? ` · próxima ${fmtData(p.next_due_date)}` : ''}` : 'sem rota fixa'}</span></div>
      </div>
    </div></div>
    ${p.deactivated_reason ? `<div class="alerta info secao"><i data-lucide="info"></i><div>Desativado: ${esc(p.deactivated_reason)}</div></div>` : ''}
    ${p.notes ? `<p class="muted secao">${esc(p.notes)}</p>` : ''}
    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="line-chart"></i> Evolução</h3></div>
      <div class="card-corpo">${hist.length ? graficoPonto(p, hist) : vazio({ icone: 'line-chart', titulo: 'Nenhuma medição ainda' })}
      ${hist.length ? '<p class="small muted" style="margin:8px 0 0">Faixa amarela = alerta; faixa vermelha = crítico (limites atuais). Cada medição guarda o limite da época.</p>' : ''}</div></div>
    <h3 class="secao"><i data-lucide="list" style="width:18px;height:18px;vertical-align:-3px"></i> Medições</h3>
    <div class="card" id="tab-hist"></div>`;

  if (hist.length) {
    montarTabela(el.querySelector('#tab-hist'), {
      linhas: hist, busca: false, porPagina: 25,
      aoClicar: (mid) => { location.hash = `#/preditiva/inspecoes/${hist.find((m) => m.id === mid).inspection_id}`; },
      colunas: [
        { titulo: 'Data', valor: (m) => m.performed_at, classe: 'num', primaria: true, render: (m) => `<span class="nowrap">${fmtDataHora(m.performed_at)}</span>` },
        { titulo: 'Valor', valor: (m) => Number(m.value), classe: 'num', render: (m) => `<b class="nowrap">${pd.fmtMedida(m.value)} ${esc(m.unit)}</b>` },
        { titulo: 'Situação', valor: (m) => m.status, render: (m) => badgeResultado(m.status) },
        { titulo: 'Limites na época', valor: (m) => Number(m.alert_limit ?? 0), render: (m) => `<span class="small">${esc(pd.textoLimites(m))}</span>` },
      ],
    });
  } else el.querySelector('#tab-hist').innerHTML = vazio({ icone: 'ruler', titulo: 'Nenhuma medição registrada' });

  el.querySelector('#btn-editar')?.addEventListener('click', () => abrirPonto({ ponto: p, depois: recarregar }));
  el.querySelector('#btn-ativo')?.addEventListener('click', () => (p.active
    ? formularioModal({
      titulo: 'Desativar ponto',
      campos: `<p style="margin:0">O ponto sai da ronda e da situação; o histórico de medições continua guardado.</p>
        <div class="campo"><label for="m-mot">Motivo *</label><input id="m-mot" name="mot" required minlength="5" maxlength="300" placeholder="Ex.: motor substituído"></div>`,
      botao: 'Desativar', classe: 'btn-perigo',
      enviar: (f) => pd.salvarPonto(p.id, { active: false, deactivated_reason: f.mot.value.trim() }),
      sucesso: 'Ponto desativado.', depois: recarregar,
    })
    : pd.salvarPonto(p.id, { active: true }).then(() => { toast('Ponto reativado.'); recarregar(); }, (err) => toast(traduzirErro(err), 'erro'))));
  icones();
}
