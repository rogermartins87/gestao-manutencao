// =====================================================================
// Ficha do ponto de luz: dados, vida útil e histórico de trocas e
// manutenções.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, vazio, montarTabela, fmtData, fmtNum, diasEntre, hojeISO } from '../ui.js';
import * as il from '../services/iluminacao.js';
import { abrirPonto, abrirEvento, badgeVida, descEvento } from './iluminacao.js';

export async function render(el, [id]) {
  const p = await il.ler(id);
  if (!p) { el.innerHTML = '<div class="alerta aviso">Ponto de luz não encontrado. <a href="#/iluminacao">Voltar</a></div>'; return; }
  document.getElementById('titulo-pagina').textContent = `${p.code} — ${p.location}`;
  const evs = await il.historico(id);
  const recarregar = () => render(el, [id]).then(icones);
  const info = (rot, val) => `<div><span class="rotulo">${esc(rot)}</span>${val}</div>`;
  const restam = p.end_of_life ? diasEntre(hojeISO(), p.end_of_life) : null;
  const vidaTxt = p.end_of_life == null ? '<span class="muted">Informe a vida útil e a data da última troca</span>'
    : `<b>${fmtData(p.end_of_life)}</b><span class="small muted">${restam < 0 ? `vencida há ${fmtNum(-restam)} dia${restam === -1 ? '' : 's'}` : `faltam ${fmtNum(restam)} dia${restam === 1 ? '' : 's'}`}</span>`;
  const servico = pode('lighting.service') && p.active;

  el.innerHTML = `
    <a class="voltar" href="#/iluminacao"><i data-lucide="arrow-left"></i> Iluminação</a>
    <div class="card ficha-topo"><div class="card-corpo">
      <div class="ficha-cab">
        <div><div class="equip-tag grande">${esc(p.code)}</div><h1>${esc(p.location)} ${p.active ? '' : '<span class="badge inativo">inativo</span>'}</h1>
          <div class="muted">${esc(p.plant_name || '')}</div></div>
        <div class="acoes">
          ${servico ? `<button class="btn btn-primario" data-ev="troca"><i data-lucide="lightbulb"></i> Registrar troca</button>
            <button class="btn" data-ev="manutencao"><i data-lucide="wrench"></i> Registrar manutenção</button>` : ''}
          ${pode('lighting.write') ? '<button class="btn" id="btn-editar-luz"><i data-lucide="pencil"></i> Editar</button>' : ''}
        </div>
      </div>
      <div class="ficha-indicadores">
        ${info('Lâmpadas', `<b class="grande-num">${p.quantity} × ${esc(il.fmtW(p.power_w))}</b><span class="small muted">${esc(il.TIPO_LAMPADA[p.lamp_type] || p.lamp_type)} · ${esc(il.fmtW(p.total_w))} no total</span>`)}
        ${info('Vida útil', `${badgeVida(p)}<span class="small muted">${p.lifetime_hours ? `${fmtNum(p.lifetime_hours)} h · ${fmtNum(p.hours_per_day, 1)} h acesas por dia` : 'vida útil não informada'}</span>`)}
        ${info('Fim previsto da vida útil', vidaTxt)}
        ${info('Última troca de todas', p.last_replaced_at ? `<b>${fmtData(p.last_replaced_at)}</b>` : '<span class="muted">—</span>')}
        ${info('Trocas registradas', `<b class="grande-num">${p.replacements_count}</b>`)}
        ${info('Último registro', p.last_event_at ? `<b>${fmtData(p.last_event_at)}</b>` : '<span class="muted">—</span>')}
      </div>
      ${p.notes ? `<p style="margin:14px 0 0;white-space:pre-wrap">${esc(p.notes)}</p>` : ''}
    </div></div>
    ${p.life_status === 'vencida' ? '<div class="alerta perigo secao"><i data-lucide="triangle-alert"></i><div>A vida útil das lâmpadas deste ponto já passou. Programe a troca para evitar queimas e falta de luz.</div></div>' : ''}
    ${p.life_status === 'vence_breve' ? '<div class="alerta aviso secao"><i data-lucide="clock"></i><div>A vida útil termina nos próximos 30 dias. Vale programar a troca.</div></div>' : ''}
    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="history"></i> Trocas e manutenções</h3></div><div id="hist-luz"></div></div>`;

  montarTabela(el.querySelector('#hist-luz'), {
    linhas: evs, busca: false, porPagina: 25,
    vazioHtml: vazio({ icone: 'history', titulo: 'Nada registrado ainda', texto: servico ? 'Use "Registrar troca" ou "Registrar manutenção".' : '' }),
    colunas: [
      { titulo: 'Data', valor: (e) => e.done_at, render: (e) => fmtData(e.done_at), primaria: true },
      { titulo: 'O que foi feito', valor: (e) => e.kind, render: descEvento },
      { titulo: 'Quem registrou', valor: (e) => e.created_by_name || '', render: (e) => esc(e.created_by_name || '—') },
    ],
  });
  el.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => abrirEvento(p, b.dataset.ev, { depois: recarregar })));
  el.querySelector('#btn-editar-luz')?.addEventListener('click', () => abrirPonto(p, { depois: recarregar }));
  icones();
}
