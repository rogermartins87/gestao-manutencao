// =====================================================================
// Dica "Salvar como app" — só no celular, só no navegador (quem já abriu
// pelo ícone da tela de início não vê). "Agora não" esconde por 30 dias.
// iPhone: passo a passo pelo botão Compartilhar do Safari.
// Android: botão "Instalar" quando o Chrome oferece; senão, passo a passo pelo menu ⋮.
// =====================================================================
import { icones } from './ui.js';

const CHAVE = 'dica.app.ate';
const ua = navigator.userAgent || '';
const ehIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ehAndroid = /Android/.test(ua);
const jaEhApp = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const celular = () => (ehIOS || ehAndroid) && window.matchMedia?.('(max-width: 1024px)').matches;

let pedidoInstalar = null; // evento do Chrome (Android) para instalar com um toque
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; atualizar(); });
window.addEventListener('appinstalled', () => fechar(365));

function adiada() {
  try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch { return false; }
}
function fechar(dias = 30) {
  try { localStorage.setItem(CHAVE, String(Date.now() + dias * 864e5)); } catch { /* sem armazenamento */ }
  document.getElementById('dica-app')?.remove();
  document.body.classList.remove('com-dica-app');
}

function passos() {
  if (ehIOS) {
    return `<ol>
      <li>Abra este endereço no <b>Safari</b>.</li>
      <li>Toque em <b>Compartilhar</b> <i data-lucide="share"></i> (na barra de baixo).</li>
      <li>Role e toque em <b>Adicionar à Tela de Início</b> <i data-lucide="square-plus"></i>.</li>
      <li>Toque em <b>Adicionar</b>.</li></ol>`;
  }
  if (pedidoInstalar) return '<p>Instale o sistema no celular: ele abre pelo ícone, em tela cheia, como um aplicativo.</p>';
  return `<ol>
      <li>No <b>Chrome</b>, toque no menu <i data-lucide="ellipsis-vertical"></i> (canto de cima).</li>
      <li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
      <li>Confirme em <b>Instalar</b>.</li></ol>`;
}

function atualizar() {
  const el = document.getElementById('dica-app');
  if (!el) return;
  el.querySelector('.dica-app-corpo').innerHTML = passos();
  el.querySelector('.dica-app-instalar').hidden = !pedidoInstalar;
  icones();
}

export function mostrarDicaApp() {
  if (!celular() || jaEhApp() || adiada() || document.getElementById('dica-app')) return;
  const el = document.createElement('aside');
  el.id = 'dica-app';
  el.className = 'dica-app';
  el.setAttribute('aria-label', 'Salvar o sistema como app no celular');
  el.innerHTML = `
    <img src="img/icone-192.png" alt="" width="44" height="44">
    <div class="dica-app-txt">
      <b>Salve o sistema como app</b>
      <div class="dica-app-corpo"></div>
      <div class="dica-app-acoes">
        <button type="button" class="btn btn-primario btn-sm dica-app-instalar" hidden><i data-lucide="download"></i> Instalar</button>
        <button type="button" class="btn btn-sm dica-app-depois">Agora não</button>
      </div>
    </div>
    <button type="button" class="dica-app-x" aria-label="Fechar"><i data-lucide="x"></i></button>`;
  document.body.appendChild(el);
  document.body.classList.add('com-dica-app');
  el.querySelector('.dica-app-x').onclick = () => fechar();
  el.querySelector('.dica-app-depois').onclick = () => fechar();
  el.querySelector('.dica-app-instalar').onclick = async () => {
    if (!pedidoInstalar) return;
    pedidoInstalar.prompt();
    const r = await pedidoInstalar.userChoice.catch(() => null);
    pedidoInstalar = null;
    if (r?.outcome === 'accepted') fechar(365); else atualizar();
  };
  atualizar();
}
