// =====================================================================
// Avisos no celular (Web Push): cada pessoa ativa no próprio aparelho
// e escolhe de quais plantas quer receber aviso de parada.
// Inscrição guardada em push_subscriptions (cada um só vê a sua).
// =====================================================================
import { sb } from './supabase.js';
import { VAPID_PUBLICA } from './config.js';

export const suportaAvisos = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const comoApp = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function chaveBytes(b64) {
  const p = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registro() {
  return navigator.serviceWorker.register('sw.js', { scope: './' }).then(() => navigator.serviceWorker.ready);
}

// Inscrição deste aparelho (ou null)
export async function inscricaoAtual() {
  if (!suportaAvisos()) return null;
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return null;
  const { data } = await sb.from('push_subscriptions').select('id, plant_ids').eq('endpoint', sub.endpoint).maybeSingle();
  return data ? { ...data, sub } : null;
}

const aparelho = () => (ehIphone() ? 'iPhone' : /android/i.test(navigator.userAgent) ? 'Android' : 'Computador');

// plantas: null = todas; [] não é permitido (use desativar)
export async function ativarAvisos(plantas) {
  if (!suportaAvisos()) throw new Error('Este aparelho/navegador não aceita avisos.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Os avisos foram bloqueados. Libere as notificações deste site nas configurações do celular.');
  const reg = await registro();
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(VAPID_PUBLICA) });
  const j = sub.toJSON();
  // remove inscrição antiga deste aparelho (se existir) e grava de novo
  await sb.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const { error } = await sb.from('push_subscriptions').insert({
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, plant_ids: plantas, device: aparelho(),
  });
  if (error) throw error;
}

export async function salvarPlantasAviso(id, plantas) {
  const { error } = await sb.from('push_subscriptions').update({ plant_ids: plantas }).eq('id', id);
  if (error) throw error;
}

export async function desativarAvisos() {
  const reg = suportaAvisos() ? await navigator.serviceWorker.getRegistration('./') : null;
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}
