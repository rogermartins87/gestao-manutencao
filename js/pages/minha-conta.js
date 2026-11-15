// Minha conta: nome, cargo e senha do próprio usuário.
// Perfil e situação só o administrador altera (o banco bloqueia).
import { sb } from '../supabase.js';
import { store, pode } from '../store.js';
import { esc, toast, traduzirErro, fmtDataHora, textoOuNulo, icones } from '../ui.js';
import { plantasAtivas } from '../plantas.js';
import { suportaAvisos, ehIphone, comoApp, inscricaoAtual, ativarAvisos, salvarPlantasAviso, desativarAvisos } from '../avisos.js';
import { recarregarSessao } from '../app.js';

export async function render(el) {
  const p = store.perfil;
  const perms = [...store.permissoes].sort();
  const { data: lista } = await sb.from('permissions').select('code, description, module').order('module');
  const desc = Object.fromEntries((lista || []).map((x) => [x.code, x.description]));
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Minha conta</h1><p>Seus dados de acesso. Perfil e permissões são definidos pelo administrador.</p></div></div>
    <div class="grade grade-2">
      <div class="card"><div class="card-titulo"><h3><i data-lucide="user"></i> Dados pessoais</h3></div>
        <div class="card-corpo">
          <form id="f-conta" class="grade" style="gap:12px">
            <div class="campo"><label for="c-nome">Nome completo</label><input id="c-nome" name="full_name" required minlength="2" maxlength="120" value="${esc(p.full_name)}"></div>
            <div class="campo"><label for="c-cargo">Cargo / função</label><input id="c-cargo" name="job_title" maxlength="80" value="${esc(p.job_title || '')}" placeholder="Ex.: Mecânico, Eletricista, Supervisor"></div>
            <div class="campo"><label>E-mail</label><input value="${esc(p.email)}" disabled></div>
            <div><button class="btn btn-primario" type="submit"><i data-lucide="save"></i> Salvar</button></div>
          </form>
        </div></div>
      <div class="card"><div class="card-titulo"><h3><i data-lucide="key-round"></i> Senha</h3></div>
        <div class="card-corpo">
          <form id="f-senha" class="grade" style="gap:12px">
            <div class="campo"><label for="c-senha">Nova senha</label><input id="c-senha" type="password" minlength="8" required autocomplete="new-password"></div>
            <div class="campo"><label for="c-senha2">Repita a nova senha</label><input id="c-senha2" type="password" minlength="8" required autocomplete="new-password"></div>
            <div><button class="btn" type="submit">Alterar senha</button></div>
          </form>
        </div></div>
    </div>
    <div class="card secao" id="card-avisos"><div class="card-titulo"><h3><i data-lucide="bell-ring"></i> Avisos no celular</h3></div>
      <div class="card-corpo" id="avisos-corpo"><p class="muted">Carregando…</p></div></div>
    <div class="card secao"><div class="card-titulo"><h3><i data-lucide="shield-check"></i> Acesso</h3></div>
      <div class="card-corpo">
        <dl class="dados-conta">
          <dt>Perfil</dt><dd>${esc(p.role?.name || '—')}</dd>
          <dt>Liberado em</dt><dd>${p.approved_at ? fmtDataHora(p.approved_at) : '—'}</dd>
          ${p.role?.code === 'tecnico' ? `<dt>Registro de horímetro</dt><dd>${pode('hour_meter.write') ? 'Autorizado' : 'Não autorizado'}</dd>` : ''}
        </dl>
        <h4 style="margin:16px 0 8px">O que você pode fazer</h4>
        <ul class="lista-perm">${perms.map((c) => `<li title="${esc(c)}">${esc(desc[c] || c)}</li>`).join('') || '<li>Somente consulta</li>'}</ul>
        <p class="muted small" style="margin-top:12px">Todos os usuários liberados podem consultar equipamentos e históricos.</p>
      </div></div>`;

  montarAvisos(el.querySelector('#avisos-corpo'));

  el.querySelector('#f-conta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    const { error } = await sb.from('profiles')
      .update({ full_name: d.full_name.trim(), job_title: textoOuNulo(d.job_title) })
      .eq('id', p.id);
    btn.disabled = false;
    if (error) return toast(traduzirErro(error), 'erro');
    toast('Dados salvos.');
    await recarregarSessao();
    location.hash = '#/minha-conta';
  });

  el.querySelector('#f-senha').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s1 = el.querySelector('#c-senha').value, s2 = el.querySelector('#c-senha2').value;
    if (s1 !== s2) return toast('As duas senhas não são iguais.', 'erro');
    const { error } = await sb.auth.updateUser({ password: s1 });
    if (error) return toast(traduzirErro(error), 'erro');
    e.target.reset();
    toast('Senha alterada.');
  });
}

// ---------------------------------------------------------------------
// Avisos no celular: recebe aviso quando alguém registra uma parada
// ---------------------------------------------------------------------
async function montarAvisos(box) {
  const plantas = plantasAtivas();
  const explica = '<p class="muted small">Quando alguém registrar uma <b>parada de equipamento</b>, este aparelho recebe um aviso na hora (mesmo com o sistema fechado). Quem registrou a parada não recebe.</p>';
  if (ehIphone() && !comoApp()) {
    box.innerHTML = `${explica}
      <div class="aviso-iphone"><i data-lucide="smartphone"></i><div><b>No iPhone, primeiro salve o sistema como app:</b>
        <ol><li>Abra este site no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> <i data-lucide="share"></i> e depois em <b>Adicionar à Tela de Início</b>.</li>
        <li>Abra o sistema pelo <b>ícone</b> que apareceu na tela e volte aqui em Minha conta.</li></ol>
        <span class="muted small">Precisa do iOS 16.4 ou mais novo.</span></div></div>`;
    return icones();
  }
  if (!suportaAvisos()) {
    box.innerHTML = `${explica}<p class="muted">Este navegador não aceita avisos. No Android use o <b>Chrome</b>; no iPhone, o <b>Safari</b>.</p>`;
    return;
  }
  let atual = null;
  try { atual = await inscricaoAtual(); } catch { atual = null; }
  const todas = !atual || atual.plant_ids == null;
  const marcadas = new Set(atual?.plant_ids || []);
  const escolha = plantas.length > 1 ? `
      <fieldset class="avisos-plantas"><legend>Receber avisos de</legend>
        <label class="check"><input type="checkbox" id="av-todas" ${todas ? 'checked' : ''}> Todas as plantas</label>
        <div id="av-lista" ${todas ? 'hidden' : ''}>
          ${plantas.map((pl) => `<label class="check"><input type="checkbox" name="av-planta" value="${pl.id}" ${marcadas.has(pl.id) ? 'checked' : ''}> ${esc(pl.name)}</label>`).join('')}
        </div>
      </fieldset>` : '';
  box.innerHTML = `${explica}
    <p class="avisos-situacao ${atual ? 'ligado' : ''}"><i data-lucide="${atual ? 'bell-ring' : 'bell-off'}"></i>
      <span>${atual ? 'Avisos <b>ativados</b> neste aparelho.' : 'Avisos <b>desativados</b> neste aparelho.'}</span></p>
    ${escolha}
    ${atual ? `<details class="dica-bloqueio"><summary><i data-lucide="lock"></i> Não aparece com o celular bloqueado?</summary>
      ${ehIphone() ? `<p><b>iPhone:</b> Ajustes → Notificações → <b>Manutenção</b> → ligue <b>Permitir Notificações</b> e marque <b>Tela Bloqueada</b>, <b>Central de Notificações</b> e <b>Faixas</b>. Em <b>Sons</b>, deixe ligado.</p>
        <p class="muted small">Se o modo Foco (Não Perturbe) estiver ativo, inclua o app Manutenção nas exceções.</p>`
      : `<p><b>Android:</b> Configurações → Notificações → <b>Chrome</b> (ou o app Manutenção) → ligue as notificações e em <b>Tela de bloqueio</b> escolha <b>Mostrar todo o conteúdo</b>.</p>
        <p class="muted small">Se tiver economia de bateria agressiva (Xiaomi, Samsung, Motorola), coloque o Chrome como <b>Sem restrições</b> em Bateria.</p>`}
    </details>` : ''}
    <div class="acoes-avisos">
      ${atual ? `<button class="btn btn-primario" id="av-salvar"><i data-lucide="save"></i> Salvar plantas</button>
                 <button class="btn" id="av-desligar"><i data-lucide="bell-off"></i> Desativar avisos</button>`
              : `<button class="btn btn-primario" id="av-ligar"><i data-lucide="bell-ring"></i> Ativar avisos neste aparelho</button>`}
    </div>`;
  icones();

  const lerPlantas = () => {
    if (plantas.length <= 1 || box.querySelector('#av-todas').checked) return null;
    return [...box.querySelectorAll('[name=av-planta]:checked')].map((c) => c.value);
  };
  box.querySelector('#av-todas')?.addEventListener('change', (e) => { box.querySelector('#av-lista').hidden = e.target.checked; });
  const executar = async (btn, fn, msg) => {
    const pl = lerPlantas();
    if (pl && !pl.length && btn.id !== 'av-desligar') return toast('Marque pelo menos uma planta (ou "Todas as plantas").', 'erro');
    btn.disabled = true;
    try { await fn(pl); toast(msg); await montarAvisos(box); }
    catch (err) { btn.disabled = false; toast(err?.message?.startsWith('Os avisos') || err?.message?.startsWith('Este') ? err.message : traduzirErro(err), 'erro'); }
  };
  box.querySelector('#av-ligar')?.addEventListener('click', (e) => executar(e.currentTarget, ativarAvisos, 'Avisos ativados neste aparelho.'));
  box.querySelector('#av-salvar')?.addEventListener('click', (e) => executar(e.currentTarget, (pl) => salvarPlantasAviso(atual.id, pl), 'Plantas dos avisos salvas.'));
  box.querySelector('#av-desligar')?.addEventListener('click', (e) => executar(e.currentTarget, () => desativarAvisos(), 'Avisos desativados neste aparelho.'));
}
