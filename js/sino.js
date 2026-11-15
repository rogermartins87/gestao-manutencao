// =====================================================================
// Sininho de avisos no topo: número de não lidos (atualiza a cada minuto
// e ao trocar de tela) e painel com os últimos avisos.
// =====================================================================
import { esc, icones, toast, traduzirErro, fmtDataHora } from './ui.js';
import * as pe from './services/pendencias.js';

let timer = null;
let globais = false;

const quando = (ts) => {
  const min = Math.round((Date.now() - new Date(ts)) / 6e4);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return fmtDataHora(ts);
};

export function htmlSino() {
  return `<div class="sino-wrap">
    <button class="btn btn-icone btn-texto sino" id="btn-sino" title="Avisos" aria-label="Avisos" aria-expanded="false" aria-haspopup="true">
      <i data-lucide="bell"></i><span class="sino-n" hidden></span></button>
    <div class="painel-avisos" id="painel-avisos" hidden role="dialog" aria-label="Avisos"></div></div>`;
}

export async function atualizarSino() {
  const n = await pe.naoLidos().catch(() => null);
  const b = document.querySelector('#btn-sino .sino-n');
  if (!b || n == null) return;
  b.hidden = !n;
  b.textContent = n > 99 ? '99+' : String(n);
  document.getElementById('btn-sino').setAttribute('aria-label', n ? `Avisos: ${n} não lido${n === 1 ? '' : 's'}` : 'Avisos');
}

export function iniciarSino() {
  const btn = document.getElementById('btn-sino');
  const painel = document.getElementById('painel-avisos');
  if (!btn) return;
  clearInterval(timer);
  timer = setInterval(atualizarSino, 60000);
  atualizarSino();

  const fechar = () => { painel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const desenhar = async () => {
    painel.innerHTML = '<div class="painel-avisos-cab"><b>Avisos</b></div><div class="muted small" style="padding:14px">Carregando…</div>';
    let lista;
    try { lista = await pe.avisos(30); } catch (err) { painel.innerHTML = `<div class="alerta perigo" style="margin:10px">${esc(traduzirErro(err))}</div>`; return; }
    const naoLidos = lista.filter((a) => !a.read_at).length;
    painel.innerHTML = `
      <div class="painel-avisos-cab"><b>Avisos</b>
        ${naoLidos ? '<button class="btn btn-sm btn-texto" data-todas>Marcar todos como lidos</button>' : ''}</div>
      ${lista.length ? `<ul class="lista-sino">${lista.map((a) => `
        <li class="${a.read_at ? '' : 'nao-lido'}"><button type="button" data-aviso="${a.id}">
          <i data-lucide="${pe.ICONE_AVISO[a.kind] || 'bell'}"></i>
          <span><b>${esc(a.title)}</b>${a.body ? `<span class="small muted">${esc(a.body)}</span>` : ''}<span class="small muted">${quando(a.created_at)}</span></span>
        </button></li>`).join('')}</ul>`
        : '<div class="muted small" style="padding:18px 14px;text-align:center">Nenhum aviso. Você recebe avisos quando algo precisa da sua atenção: OS ou pendência para você, OS para aprovar, inspeção crítica.</div>'}
      ${lista.some((a) => a.read_at) ? '<div class="painel-avisos-rod"><button class="btn btn-sm btn-texto" data-apagar>Apagar os lidos</button></div>' : ''}`;
    icones();
  };

  btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (!painel.hidden) { fechar(); return; }
    painel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    await desenhar();
  });
  painel.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    try {
      const a = ev.target.closest('[data-aviso]');
      if (a) {
        const lista = await pe.avisos(30);
        const av = lista.find((x) => x.id === a.dataset.aviso);
        if (av && !av.read_at) await pe.marcarLidos([av.id]);
        fechar(); atualizarSino();
        if (av?.link) location.hash = av.link;
        return;
      }
      if (ev.target.closest('[data-todas]')) { await pe.marcarLidos(); await desenhar(); atualizarSino(); }
      if (ev.target.closest('[data-apagar]')) { await pe.apagarLidos(); await desenhar(); }
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
  if (globais) return;   // ouvintes da página: uma vez só (o topo pode ser redesenhado)
  globais = true;
  const fecharAtual = () => {
    const pn = document.getElementById('painel-avisos'); const bt = document.getElementById('btn-sino');
    if (pn && !pn.hidden) { pn.hidden = true; bt?.setAttribute('aria-expanded', 'false'); return bt; }
    return null;
  };
  document.addEventListener('click', fecharAtual);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharAtual()?.focus(); });
  window.addEventListener('hashchange', atualizarSino);
}

export function pararSino() { clearInterval(timer); timer = null; }
