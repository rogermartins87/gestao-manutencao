// =====================================================================
// Inicialização, autenticação, layout e rotas
// =====================================================================
import { sb, configurado, chaveInsegura } from './supabase.js';
import { store, carregarPerfil, limparSessao, pode, ativo } from './store.js';
import { esc, icones, toast, traduzirErro, abrirModal, carregando } from './ui.js';
import { htmlSino, iniciarSino, pararSino } from './sino.js';

const raiz = document.getElementById('raiz');
const NOME_SISTEMA = 'Gestão de Manutenção';

// ---------- Menu (ordem da especificação) ----------
// etapa: número da etapa em que o módulo fica pronto (até lá a página avisa)
export const MENU = [
  { rota: 'dashboard', titulo: 'Dashboard', icone: 'layout-dashboard' },
  { rota: 'equipamentos', titulo: 'Equipamentos', icone: 'factory', etapa: 3, pronta: true },
  { rota: 'horimetros', titulo: 'Horímetros', icone: 'gauge', etapa: 4, pronta: true },
  { rota: 'ordens', titulo: 'Ordens de serviço', icone: 'clipboard-list', etapa: 5, pronta: true },
  { rota: 'preventiva', titulo: 'Planejamento preventivo', icone: 'calendar-check', etapa: 8, pronta: true },
  { rota: 'preditiva', titulo: 'Manutenção preditiva', icone: 'activity', etapa: 9, pronta: true },
  { rota: 'paradas', titulo: 'Paradas', icone: 'octagon-pause', etapa: 6, pronta: true },
  { rota: 'producao', titulo: 'Produção e OEE', icone: 'chart-pie', etapa: 13, pronta: true },
  { rota: 'pecas', titulo: 'Peças e componentes', icone: 'cog', etapa: 7, pronta: true },
  { rota: 'pendencias', titulo: 'Pendências', icone: 'list-todo', etapa: 10, pronta: true },
  { rota: 'relatorios', titulo: 'Relatórios', icone: 'file-bar-chart', etapa: 11, pronta: true },
  { rota: 'usuarios', titulo: 'Usuários e configurações', icone: 'users', etapa: 2, pronta: true, permAlguma: ['users.manage', 'settings.manage', 'audit.read', 'costs.read'] },
  { rota: 'ajuda', titulo: 'Ajuda', icone: 'circle-help' },
];

const ROTAS = [
  { re: /^dashboard$/, pagina: () => import('./pages/dashboard.js'), titulo: 'Dashboard' },
  { re: /^minha-conta$/, pagina: () => import('./pages/minha-conta.js'), titulo: 'Minha conta' },
  { re: /^equipamentos$/, pagina: () => import('./pages/equipamentos.js'), titulo: 'Equipamentos' },
  { re: /^equipamentos\/novo$/, pagina: () => import('./pages/equipamento-form.js'), titulo: 'Novo equipamento', perm: 'equipment.write' },
  { re: /^equipamentos\/([0-9a-f-]{36})\/editar$/, pagina: () => import('./pages/equipamento-form.js'), titulo: 'Editar equipamento', perm: 'equipment.write' },
  { re: /^equipamentos\/([0-9a-f-]{36})$/, pagina: () => import('./pages/equipamento-ficha.js'), titulo: 'Equipamento' },
  { re: /^horimetros$/, pagina: () => import('./pages/horimetros.js'), titulo: 'Horímetros' },
  { re: /^ordens$/, pagina: () => import('./pages/ordens.js'), titulo: 'Ordens de serviço' },
  { re: /^ordens\/nova$/, pagina: () => import('./pages/ordem-form.js'), titulo: 'Nova ordem de serviço', permAlguma: ['work_order.manage', 'work_order.request'] },
  { re: /^ordens\/([0-9a-f-]{36})\/editar$/, pagina: () => import('./pages/ordem-form.js'), titulo: 'Editar ordem de serviço', perm: 'work_order.manage' },
  { re: /^ordens\/([0-9a-f-]{36})$/, pagina: () => import('./pages/ordem-ficha.js'), titulo: 'Ordem de serviço' },
  { re: /^paradas$/, pagina: () => import('./pages/paradas.js'), titulo: 'Paradas' },
  { re: /^paradas\/nova$/, pagina: () => import('./pages/parada-form.js'), titulo: 'Registrar parada', perm: 'downtime.write' },
  { re: /^paradas\/([0-9a-f-]{36})$/, pagina: () => import('./pages/parada-ficha.js'), titulo: 'Parada' },
  { re: /^preventiva$/, pagina: () => import('./pages/preventiva.js'), titulo: 'Planejamento preventivo' },
  { re: /^preventiva\/planos\/novo$/, pagina: () => import('./pages/plano-form.js'), titulo: 'Novo plano preventivo', perm: 'planning.write' },
  { re: /^preventiva\/planos\/([0-9a-f-]{36})\/editar$/, pagina: () => import('./pages/plano-form.js'), titulo: 'Editar plano preventivo', perm: 'planning.write' },
  { re: /^preventiva\/planos\/([0-9a-f-]{36})$/, pagina: () => import('./pages/plano-ficha.js'), titulo: 'Plano preventivo' },
  { re: /^preditiva$/, pagina: () => import('./pages/preditiva.js'), titulo: 'Manutenção preditiva' },
  { re: /^preditiva\/inspecoes\/nova$/, pagina: () => import('./pages/inspecao-form.js'), titulo: 'Registrar inspeção', perm: 'inspection.write' },
  { re: /^preditiva\/inspecoes\/([0-9a-f-]{36})$/, pagina: () => import('./pages/inspecao-ficha.js'), titulo: 'Inspeção' },
  { re: /^preditiva\/pontos\/([0-9a-f-]{36})$/, pagina: () => import('./pages/ponto-ficha.js'), titulo: 'Ponto de medição' },
  { re: /^pendencias$/, pagina: () => import('./pages/pendencias.js'), titulo: 'Pendências' },
  { re: /^pendencias\/([0-9a-f-]{36})$/, pagina: () => import('./pages/pendencia-ficha.js'), titulo: 'Pendência' },
  { re: /^pecas$/, pagina: () => import('./pages/pecas.js'), titulo: 'Peças e componentes' },
  { re: /^pecas\/([0-9a-f-]{36})$/, pagina: () => import('./pages/peca-ficha.js'), titulo: 'Peça' },
  { re: /^producao$/, pagina: () => import('./pages/producao.js'), titulo: 'Produção e OEE' },
  { re: /^relatorios$/, pagina: () => import('./pages/relatorios.js'), titulo: 'Relatórios' },
  { re: /^ajuda$/, pagina: () => import('./pages/ajuda.js'), titulo: 'Ajuda' },
  { re: /^usuarios$/, pagina: () => import('./pages/usuarios.js'), titulo: 'Usuários e configurações', permAlguma: ['users.manage', 'settings.manage', 'audit.read', 'costs.read'] },
  ...MENU.filter((m) => m.etapa && !m.pronta).map((m) => ({
    re: new RegExp(`^${m.rota}(?:/.*)?$`),
    pagina: () => import('./pages/em-breve.js'),
    titulo: m.titulo,
  })),
];

export function navegar(rota) { location.hash = `#/${rota}`; }

async function rotear() {
  // endereço com caracteres de HTML (<, >, aspas) é descartado: protege contra link malicioso
  let bruto = location.hash;
  try { bruto = decodeURIComponent(bruto); } catch { bruto = '<'; }
  if (/[<>"'`]/.test(bruto)) {
    const limpo = location.hash.replace(/^#\/?/, '').split('?')[0].replace(/[^A-Za-z0-9/_-]/g, '');
    history.replaceState(null, '', `${location.pathname}${location.search}#/${limpo}`);
  }
  const caminho = location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard';
  const rota = ROTAS.find((r) => r.re.test(caminho));
  const conteudo = document.getElementById('conteudo');
  if (!conteudo) return;
  document.querySelector('.app')?.classList.remove('menu-aberto');
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('ativo', caminho === a.dataset.rota || caminho.startsWith(`${a.dataset.rota}/`)));

  if (!rota) { conteudo.innerHTML = `<div class="alerta aviso">Página não encontrada. <a href="#/dashboard">Voltar ao dashboard</a></div>`; return; }
  if ((rota.perm && !pode(rota.perm)) || (rota.permAlguma && !rota.permAlguma.some(pode))) {
    conteudo.innerHTML = `<div class="alerta aviso"><i data-lucide="lock"></i><div>Você não tem permissão para acessar esta área. Fale com o administrador.</div></div>`;
    icones(); return;
  }
  const params = caminho.match(rota.re).slice(1);
  const item = MENU.find((m) => caminho === m.rota || caminho.startsWith(`${m.rota}/`));
  document.getElementById('titulo-pagina').textContent = rota.titulo;
  document.title = `${rota.titulo} · ${NOME_SISTEMA}`;
  conteudo.innerHTML = carregando();
  window.scrollTo({ top: 0 });
  try {
    const mod = await rota.pagina();
    await mod.render(conteudo, params, { caminho, item });
  } catch (e) {
    console.error(e);
    conteudo.innerHTML = `<div class="alerta perigo"><i data-lucide="alert-triangle"></i><div>${esc(traduzirErro(e))}</div></div>`;
  }
  icones();
}

// ---------- Layout ----------
function menuRecolhido() {
  try { return localStorage.getItem('menu.recolhido') === '1'; } catch { return false; }
}

function iniciaisDe(nome) {
  return nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function renderLayout() {
  const nome = store.perfil?.full_name || store.usuario.email;
  const empresa = store.empresa?.company_name || '';
  raiz.innerHTML = `
  <div class="app${menuRecolhido() ? ' lateral-recolhida' : ''}">
    <aside class="lateral" aria-label="Menu principal">
      <div class="marca">
        <div class="marca-logo icone-logo" role="img" aria-label="Fer Alvarez"></div>
        <div class="marca-texto"><div class="marca-nome">Manutenção</div><div class="marca-prop">${esc(empresa)}</div></div>
        <button type="button" class="btn-recolher" id="btn-recolher" title="Recolher menu" aria-label="Recolher menu"><i data-lucide="panel-left-close"></i></button>
      </div>
      <nav>
        ${MENU.filter((m) => !m.permAlguma || m.permAlguma.some(pode)).map((m) => `<a class="nav-item" href="#/${m.rota}" data-rota="${m.rota}" title="${esc(m.titulo)}"><i data-lucide="${m.icone}"></i>${esc(m.titulo)}${m.etapa && !m.pronta ? `<span class="etapa" title="Disponível na etapa ${m.etapa}">E${m.etapa}</span>` : ''}</a>`).join('')}
      </nav>
      <div class="rodape-lateral"><span style="color:#9aa8b8">${esc(store.perfil.role?.name || '')}</span></div>
    </aside>
    <div class="fundo-menu" data-fechar-menu></div>
    <div class="principal">
      <header class="topo">
        <button class="btn btn-icone btn-texto btn-menu" id="btn-menu" aria-label="Abrir menu"><i data-lucide="menu"></i></button>
        <div class="titulo" id="titulo-pagina"></div>
        <div class="usuario-menu">
          ${htmlSino()}
          <a class="avatar" href="#/minha-conta" title="Minha conta: ${esc(nome)}" style="text-decoration:none">${esc(iniciaisDe(nome) || '?')}</a>
          <a class="nome small" href="#/minha-conta" style="color:inherit;text-decoration:none">${esc(nome)}</a>
          <button class="btn btn-icone btn-texto" id="btn-sair" title="Sair" aria-label="Sair"><i data-lucide="log-out"></i></button>
        </div>
      </header>
      <main class="conteudo" id="conteudo"></main>
    </div>
  </div>`;
  icones();

  const btnRecolher = document.getElementById('btn-recolher');
  const marcarRecolher = () => {
    const rec = document.querySelector('.app').classList.contains('lateral-recolhida');
    btnRecolher.title = rec ? 'Abrir menu' : 'Recolher menu';
    btnRecolher.setAttribute('aria-label', btnRecolher.title);
    btnRecolher.innerHTML = `<i data-lucide="${rec ? 'panel-left-open' : 'panel-left-close'}"></i>`;
    icones();
  };
  btnRecolher.onclick = () => {
    const rec = document.querySelector('.app').classList.toggle('lateral-recolhida');
    try { localStorage.setItem('menu.recolhido', rec ? '1' : '0'); } catch { /* sem armazenamento */ }
    marcarRecolher();
    window.dispatchEvent(new Event('resize'));
  };
  marcarRecolher();
  document.getElementById('btn-menu').onclick = () => (window.innerWidth > 960 ? btnRecolher.click() : document.querySelector('.app').classList.add('menu-aberto'));
  document.querySelector('[data-fechar-menu]').onclick = () => document.querySelector('.app').classList.remove('menu-aberto');
  document.getElementById('btn-sair').onclick = async () => { pararSino(); await sb.auth.signOut(); };
  iniciarSino();
}

// ---------- Telas sem sessão ----------
function telaConfiguracao(msg) {
  raiz.innerHTML = `<div class="acesso-form" style="min-height:100vh"><div class="card acesso-caixa" style="max-width:620px"><div class="card-corpo">
    <h1>Configuração necessária</h1>
    ${msg}
  </div></div></div>`;
  icones();
}

function marcaAcesso() {
  return `<div class="acesso-marca"><span class="acesso-logo icone-logo" role="img" aria-label="Fer Alvarez"></span><h1>${NOME_SISTEMA}</h1></div>`;
}

function telaLogin(modo = 'entrar') {
  raiz.innerHTML = `
  <div class="tela-acesso">
    <section class="acesso-form">
      ${marcaAcesso()}
      <div class="card acesso-caixa"><div class="card-corpo">
        <div class="abas-acesso" role="tablist">
          <button data-modo="entrar" class="${modo === 'entrar' ? 'ativa' : ''}">Entrar</button>
          <button data-modo="cadastrar" class="${modo === 'cadastrar' ? 'ativa' : ''}">Criar conta</button>
        </div>
        <form id="form-acesso" class="grade" style="gap:12px">
          ${modo === 'cadastrar' ? `<div class="campo"><label for="nome">Seu nome completo</label><input id="nome" name="nome" required minlength="2" maxlength="120" autocomplete="name"></div>` : ''}
          <div class="campo"><label for="email">E-mail</label><input id="email" name="email" type="email" required autocomplete="email"></div>
          ${modo !== 'recuperar' ? `<div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" required minlength="8" autocomplete="${modo === 'cadastrar' ? 'new-password' : 'current-password'}">
            ${modo === 'cadastrar' ? '<span class="ajuda">Mínimo de 8 caracteres. Cada pessoa usa a sua própria conta.</span>' : ''}</div>` : ''}
          <div id="msg-acesso"></div>
          <button class="btn btn-primario btn-bloco" type="submit">${{ entrar: 'Entrar', cadastrar: 'Criar conta', recuperar: 'Enviar link de recuperação' }[modo]}</button>
          ${modo === 'entrar' ? '<button type="button" class="btn btn-texto" data-modo="recuperar">Esqueci minha senha</button>' : ''}
          ${modo === 'recuperar' ? '<button type="button" class="btn btn-texto" data-modo="entrar">Voltar para o login</button>' : ''}
        </form>
        ${modo === 'cadastrar' ? '<div class="alerta small"><i data-lucide="info"></i><div>Depois de criar a conta, o <b>administrador</b> precisa liberar o seu acesso e definir o seu perfil.</div></div>' : ''}
      </div></div>
    </section>
  </div>`;
  raiz.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => telaLogin(b.dataset.modo)));
  icones();
  const form = document.getElementById('form-acesso');
  const msg = document.getElementById('msg-acesso');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    msg.innerHTML = '';
    const d = Object.fromEntries(new FormData(form));
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email: d.email.trim(), password: d.senha });
        if (error) throw error;
      } else if (modo === 'cadastrar') {
        const { data, error } = await sb.auth.signUp({
          email: d.email.trim(), password: d.senha,
          options: { data: { nome: d.nome.trim() }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (!data.session) msg.innerHTML = '<div class="alerta sucesso">Conta criada! Agora o administrador precisa liberar o seu acesso. Se chegar um e-mail de confirmação, clique no link; se não chegar, tudo bem: ao liberar, o administrador confirma o seu e-mail.</div>';
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(d.email.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        msg.innerHTML = '<div class="alerta sucesso">Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.</div>';
      }
    } catch (err) {
      msg.innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
    } finally {
      btn.disabled = false;
    }
  });
}

function telaNovaSenha() {
  const { el, fechar } = abrirModal({
    titulo: 'Definir nova senha',
    html: `<form id="f-senha" class="grade" style="gap:12px"><div class="campo"><label for="ns">Nova senha</label>
      <input id="ns" type="password" minlength="8" required autocomplete="new-password"></div></form>`,
    rodape: '<button class="btn btn-primario" form="f-senha" type="submit">Salvar senha</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: el.querySelector('#ns').value });
    if (error) return toast(traduzirErro(error), 'erro');
    toast('Senha alterada com sucesso.');
    fechar();
  });
}

let verificador = null;
function telaAguardando() {
  const inativo = store.perfil?.status === 'inativo';
  raiz.innerHTML = `<div class="acesso-form tela-acesso" style="min-height:100vh">
    ${marcaAcesso()}
    <div class="card acesso-caixa" style="max-width:480px"><div class="card-corpo">
    <h2>${inativo ? 'Acesso desativado' : 'Aguardando liberação'}</h2>
    <p style="margin:0">${inativo
      ? 'Sua conta foi desativada pelo administrador.'
      : 'Sua conta foi criada, mas o acesso ao sistema ainda não foi liberado.'}</p>
    <div class="alerta"><i data-lucide="info"></i><div>Peça ao administrador para ${inativo ? 'reativar' : 'liberar'} o e-mail <b>${esc(store.usuario.email)}</b> em <b>Usuários e configurações</b>.${inativo ? '' : ' Assim que for liberado, você entra automaticamente.'}</div></div>
    <button class="btn btn-primario" id="btn-conferir"><i data-lucide="refresh-cw"></i> Já fui liberado(a) — entrar</button>
    <button class="btn btn-texto" id="btn-sair2"><i data-lucide="log-out"></i> Sair</button>
  </div></div></div>`;
  icones();
  document.getElementById('btn-sair2').onclick = () => { clearInterval(verificador); sb.auth.signOut(); };
  document.getElementById('btn-conferir').onclick = () => { clearInterval(verificador); iniciarSessao(); };
  clearInterval(verificador);
  verificador = setInterval(async () => {
    if (!navigator.onLine) return;
    const { data } = await sb.from('profiles').select('status').eq('id', store.usuario.id).maybeSingle();
    if (data?.status === 'ativo') { clearInterval(verificador); iniciarSessao(); }
  }, 30000);
}

// ---------- Sessão ----------
let sessaoIniciada; // undefined até o primeiro evento de autenticação
async function iniciarSessao() {
  raiz.innerHTML = carregando('Carregando…');
  try {
    await carregarPerfil();
    if (!store.perfil) throw new Error('Cadastro do usuário não encontrado. Saia e entre novamente.');
    if (!ativo()) { telaAguardando(); return; }
    renderLayout();
    rotear();
  } catch (e) {
    raiz.innerHTML = `<div class="conteudo"><div class="alerta perigo"><i data-lucide="alert-triangle"></i><div>
      <b>Não foi possível carregar o sistema.</b><br>${esc(traduzirErro(e))}<br><br>
      <button class="btn" onclick="location.reload()">Tentar novamente</button>
      <button class="btn btn-texto" id="btn-sair-erro">Sair</button></div></div></div>`;
    document.getElementById('btn-sair-erro').onclick = () => sb.auth.signOut();
    icones();
  }
}

export async function recarregarSessao() {
  await carregarPerfil();
  if (!ativo()) { telaAguardando(); return; }
  renderLayout();
  rotear();
}

async function iniciar() {
  if (!configurado) {
    telaConfiguracao(`<p>Informe a URL do projeto e a chave pública do Supabase no arquivo <code>js/config.js</code>.
      O passo a passo completo está no arquivo <code>README.md</code>.</p>`);
    return;
  }
  if (chaveInsegura) {
    telaConfiguracao(`<div class="alerta perigo"><i data-lucide="shield-alert"></i><div><b>Chave secreta detectada.</b>
      O arquivo <code>js/config.js</code> contém a chave <i>secret/service_role</i>, que dá acesso total ao banco e
      <b>nunca</b> pode ficar no navegador. Substitua pela chave <i>publishable</i> e gere uma nova chave secreta no painel do Supabase.</div></div>`);
    return;
  }
  window.addEventListener('hashchange', rotear);

  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') { setTimeout(telaNovaSenha, 300); }
    const uid = sessao?.user?.id || null;
    if (uid === sessaoIniciada) return;
    sessaoIniciada = uid;
    clearInterval(verificador);
    if (!uid) limparSessao();
    store.sessao = sessao;
    store.usuario = sessao?.user || null;
    // Executa fora do callback para não travar o cliente de autenticação
    setTimeout(() => (uid ? iniciarSessao() : telaLogin()), 0);
  });
}

iniciar();
