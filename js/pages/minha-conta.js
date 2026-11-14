// Minha conta: nome, cargo e senha do próprio usuário.
// Perfil e situação só o administrador altera (o banco bloqueia).
import { sb } from '../supabase.js';
import { store, pode } from '../store.js';
import { esc, toast, traduzirErro, fmtDataHora, textoOuNulo } from '../ui.js';
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
