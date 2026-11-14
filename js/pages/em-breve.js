// Módulo ainda não implementado: avisa em qual etapa ele entra (sem dados de exemplo).
import { esc } from '../ui.js';

export async function render(el, _params, { item }) {
  el.innerHTML = `<div class="card"><div class="card-corpo" style="text-align:center;padding:40px 20px">
    <i data-lucide="${esc(item?.icone || 'hammer')}" style="width:40px;height:40px;color:var(--texto-3)"></i>
    <h2 style="margin-top:12px">${esc(item?.titulo || 'Módulo')}</h2>
    <p class="muted">Este módulo será construído na <b>Etapa ${esc(item?.etapa ?? '?')}</b>.
      Ele só aparece funcionando depois de ligado ao banco de dados e testado.</p>
    <a class="btn" href="#/dashboard">Voltar ao dashboard</a>
  </div></div>`;
}
