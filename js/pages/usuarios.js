// =====================================================================
// Usuários e configurações (Etapa 2)
// Abas: Usuários · Perfis e permissões · Configurações · Histórico de alterações
// Cada aba só aparece para quem tem a permissão; o banco confere de novo.
// =====================================================================
import { store, pode, carregarPerfil } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, carregando, fmtDataHora, hojeISO, addDias, vazio, erroCarga, montarTabela, textoOuNulo } from '../ui.js';
import * as svc from '../services/usuarios.js';
import * as osSvc from '../services/ordens.js';

const ABAS = [
  { id: 'usuarios', titulo: 'Usuários', icone: 'users', perm: 'users.manage', desenhar: abaUsuarios },
  { id: 'permissoes', titulo: 'Perfis e permissões', icone: 'shield-check', perm: ['users.manage', 'settings.manage'], desenhar: abaPermissoes },
  { id: 'configuracoes', titulo: 'Configurações', icone: 'settings', perm: 'settings.manage', desenhar: abaConfiguracoes },
  { id: 'custos', titulo: 'Custo da mão de obra', icone: 'badge-dollar-sign', perm: 'costs.read', desenhar: abaCustos },
  { id: 'historico', titulo: 'Histórico de alterações', icone: 'history', perm: 'audit.read', desenhar: abaHistorico },
];
const permitida = (a) => [].concat(a.perm).some(pode);
export const temAcessoUsuarios = () => ABAS.some(permitida);

export async function render(el) {
  const abas = ABAS.filter(permitida);
  const pedida = new URLSearchParams(location.hash.split('?')[1] || '').get('aba');
  let atual = abas.find((a) => a.id === pedida) || abas[0];
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Usuários e configurações</h1>
      <p>Quem acessa o sistema, o que cada perfil pode fazer e o histórico de alterações.</p></div></div>
    <div class="abas" role="tablist">${abas.map((a) => `<button class="aba" role="tab" data-aba="${a.id}"><i data-lucide="${a.icone}" style="width:16px;height:16px;vertical-align:-3px"></i> ${esc(a.titulo)}</button>`).join('')}</div>
    <div id="aba-corpo"></div>`;
  const corpo = el.querySelector('#aba-corpo');
  const abrir = async (aba) => {
    atual = aba;
    el.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba.id));
    history.replaceState(null, '', `${location.pathname}${location.search}#/usuarios?aba=${aba.id}`);
    corpo.innerHTML = carregando();
    try { await aba.desenhar(corpo); } catch (e) { console.error(e); corpo.innerHTML = erroCarga(e); }
    icones();
  };
  el.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => abrir(abas.find((a) => a.id === b.dataset.aba))));
  await abrir(atual);
}

// ---------------------------------------------------------------------
// Aba Usuários
// ---------------------------------------------------------------------
const BADGE_SITUACAO = {
  pendente: '<span class="badge aviso">Aguardando liberação</span>',
  ativo: '<span class="badge ativo">Ativo</span>',
  inativo: '<span class="badge inativo">Desativado</span>',
};

async function abaUsuarios(corpo) {
  const [usuarios, perfis] = await Promise.all([svc.listarUsuarios(), svc.listarPerfis()]);
  const pendentes = usuarios.filter((u) => u.status === 'pendente');
  corpo.innerHTML = `
    ${pendentes.length ? `<div class="card secao-pendentes"><div class="card-titulo"><h3><i data-lucide="user-plus"></i>
        ${pendentes.length} ${pendentes.length === 1 ? 'pessoa aguardando' : 'pessoas aguardando'} liberação</h3></div>
      <div class="card-corpo lista-pendentes">${pendentes.map((u) => `
        <div class="pendente-linha">
          <div><b>${esc(u.full_name)}</b><div class="muted small">${esc(u.email)} · conta criada em ${fmtDataHora(u.created_at)}
            ${u.email_confirmed ? '' : ' · <span title="Ao liberar, o e-mail é confirmado automaticamente">e-mail ainda não confirmado</span>'}</div></div>
          <button class="btn btn-primario btn-sm" data-editar="${u.id}"><i data-lucide="check"></i> Liberar</button>
        </div>`).join('')}</div></div>` : ''}
    <div class="alerta info" style="margin:16px 0"><i data-lucide="info"></i><div>
      <b>Como incluir uma pessoa:</b> peça para ela abrir o sistema e clicar em <b>Criar conta</b> com o próprio e-mail.
      Ela aparece aqui como "aguardando liberação"; ao liberar, você escolhe o perfil e o e-mail fica confirmado.
      Cada pessoa tem a sua conta — não compartilhe logins.</div></div>
    <div class="card"><div id="tabela-usuarios"></div></div>`;

  montarTabela(corpo.querySelector('#tabela-usuarios'), {
    linhas: usuarios,
    colunas: [
      { titulo: 'Nome', chave: 'full_name', primaria: true, render: (u) => `<b>${esc(u.full_name)}</b>${u.id === store.usuario.id ? ' <span class="muted small">(você)</span>' : ''}${u.job_title ? `<div class="muted small">${esc(u.job_title)}</div>` : ''}` },
      { titulo: 'E-mail', chave: 'email' },
      { titulo: 'Perfil', valor: (u) => u.role_name || '', render: (u) => esc(u.role_name || '—') },
      { titulo: 'Situação', valor: (u) => u.status, render: (u) => BADGE_SITUACAO[u.status] || esc(u.status) },
      { titulo: 'Horímetro', valor: (u) => (u.role_code === 'tecnico' ? (u.hour_meter_authorized ? 'Autorizado' : 'Não') : ''),
        render: (u) => (u.role_code === 'tecnico' ? (u.hour_meter_authorized ? '<span class="badge info">Autorizado</span>' : '<span class="muted small">Não</span>') : '<span class="muted small">—</span>') },
      { titulo: 'Último acesso', valor: (u) => u.last_access_at || '', render: (u) => (u.last_access_at ? fmtDataHora(u.last_access_at) : '<span class="muted small">Nunca</span>') },
      { titulo: 'Ações', classe: 'col-acoes', render: (u) => `<button class="btn btn-sm" data-editar="${u.id}">${u.status === 'pendente' ? '<i data-lucide="check"></i> Liberar' : '<i data-lucide="pencil"></i> Editar'}</button>` },
    ],
  });

  corpo.onclick = (e) => {
    const b = e.target.closest('[data-editar]');
    if (!b) return;
    const u = usuarios.find((x) => x.id === b.dataset.editar);
    abrirEdicao(u, perfis, () => abaUsuarios(corpo).then(icones));
  };
}

function abrirEdicao(u, perfis, aoSalvar) {
  const liberando = u.status === 'pendente';
  const ehVoce = u.id === store.usuario.id;
  const { el, fechar } = abrirModal({
    titulo: liberando ? `Liberar acesso — ${u.full_name}` : `Acesso de ${u.full_name}`,
    largo: true,
    html: `
      <form id="f-acesso" class="grade" style="gap:16px">
        <div class="muted small">${esc(u.email)}${u.approved_at ? ` · liberado em ${fmtDataHora(u.approved_at)}${u.approved_by_name ? ` por ${esc(u.approved_by_name)}` : ''}` : ''}</div>
        <fieldset class="campo"><legend>Perfil de acesso</legend>
          <div class="opcoes-perfil">${perfis.map((p) => `
            <label class="opcao-perfil"><input type="radio" name="perfil" value="${p.code}" ${u.role_code === p.code ? 'checked' : ''} required>
              <span><b>${esc(p.name)}</b><span class="muted small">${esc(p.description || '')}</span></span></label>`).join('')}</div>
        </fieldset>
        <label class="check-linha" id="linha-horimetro"><input type="checkbox" name="horimetro" ${u.hour_meter_authorized ? 'checked' : ''}>
          Autorizado a registrar leituras de horímetro</label>
        ${liberando ? '' : `
        <fieldset class="campo"><legend>Situação</legend>
          <label class="check-linha"><input type="radio" name="situacao" value="ativo" ${u.status !== 'inativo' ? 'checked' : ''}> Ativo — pode entrar no sistema</label>
          <label class="check-linha"><input type="radio" name="situacao" value="inativo" ${u.status === 'inativo' ? 'checked' : ''} ${ehVoce ? 'disabled' : ''}> Desativado — não consegue mais entrar (o histórico dele é mantido)</label>
          ${ehVoce ? '<span class="ajuda">Você não pode desativar a sua própria conta.</span>' : ''}
        </fieldset>`}
        <div class="campo" id="campo-motivo"><label for="motivo">Motivo <span id="motivo-obrig"></span></label>
          <textarea id="motivo" name="motivo" rows="2" maxlength="300" placeholder="Ex.: mudou de função, saiu da empresa"></textarea>
          <span class="ajuda">Fica registrado no histórico de alterações.</span></div>
        ${liberando && !u.email_confirmed ? '<div class="alerta small"><i data-lucide="mail-check"></i><div>Ao liberar, o e-mail desta pessoa fica confirmado. Confira se o e-mail é mesmo dela antes de liberar.</div></div>' : ''}
        <div id="msg-acesso"></div>
      </form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button>
      <button class="btn btn-primario" type="submit" form="f-acesso">${liberando ? '<i data-lucide="check"></i> Liberar acesso' : 'Salvar'}</button>`,
  });
  const form = el.querySelector('form');
  const atualizarCampos = () => {
    const perfil = form.perfil.value;
    el.querySelector('#linha-horimetro').classList.toggle('oculto', perfil !== 'tecnico');
    const desativando = form.situacao?.value === 'inativo' && u.status !== 'inativo';
    el.querySelector('#motivo-obrig').textContent = desativando ? '(obrigatório)' : '(opcional)';
    form.motivo.required = desativando;
    form.motivo.minLength = desativando ? 5 : 0;
  };
  form.addEventListener('change', atualizarCampos);
  atualizarCampos();
  icones();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await svc.atualizarAcesso({
        usuario: u.id,
        perfil: form.perfil.value,
        situacao: liberando ? 'ativo' : form.situacao.value,
        horimetro: form.perfil.value === 'tecnico' && form.horimetro.checked,
        justificativa: textoOuNulo(form.motivo.value),
      });
      toast(liberando ? `Acesso de ${u.full_name} liberado.` : 'Acesso atualizado.');
      fechar();
      if (ehVoce) await carregarPerfil();
      aoSalvar();
    } catch (err) {
      el.querySelector('#msg-acesso').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Aba Perfis e permissões (matriz)
// ---------------------------------------------------------------------
async function abaPermissoes(corpo) {
  const [perfis, permissoes, matriz] = await Promise.all([svc.listarPerfis(), svc.listarPermissoes(), svc.listarMatriz()]);
  const editavel = pode('settings.manage');
  const tem = new Set(matriz.map((m) => `${m.role_id}|${m.permission_id}`));
  const modulos = [...new Set(permissoes.map((p) => p.module))];
  corpo.innerHTML = `
    <div class="alerta info" style="margin-bottom:16px"><i data-lucide="info"></i><div>
      ${editavel ? 'Marque ou desmarque para mudar o que cada perfil pode fazer. A mudança vale na hora e fica no histórico.' : 'Somente o administrador altera as permissões.'}
      O <b>Administrador</b> sempre tem todas as permissões. Todos os usuários liberados podem <b>consultar</b> equipamentos e históricos.
      O técnico só registra horímetro se também estiver autorizado no cadastro dele.</div></div>
    <div class="card"><div class="tabela-wrap"><table class="tabela matriz">
      <thead><tr><th>Permissão</th>${perfis.map((p) => `<th class="centro" title="${esc(p.description || '')}">${esc(p.name)}</th>`).join('')}</tr></thead>
      <tbody>${modulos.map((m) => `
        <tr class="grupo-matriz"><td colspan="${perfis.length + 1}">${esc(m)}</td></tr>
        ${permissoes.filter((p) => p.module === m).map((p) => `<tr>
          <td>${esc(p.description)}<div class="muted small"><code>${esc(p.code)}</code></div></td>
          ${perfis.map((r) => {
            const admin = r.code === 'admin';
            const marcado = admin || tem.has(`${r.id}|${p.id}`);
            return `<td class="centro"><input type="checkbox" aria-label="${esc(r.name)}: ${esc(p.description)}"
              data-r="${r.id}" data-p="${p.id}" ${marcado ? 'checked' : ''} ${admin || !editavel ? 'disabled' : ''}></td>`;
          }).join('')}
        </tr>`).join('')}`).join('')}
      </tbody></table></div></div>`;

  if (!editavel) return;
  corpo.querySelector('tbody').onchange = async (e) => {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb) return;
    cb.disabled = true;
    try {
      if (cb.checked) await svc.concederPermissao(cb.dataset.r, cb.dataset.p);
      else await svc.retirarPermissao(cb.dataset.r, cb.dataset.p);
      toast(cb.checked ? 'Permissão concedida.' : 'Permissão retirada.');
    } catch (err) {
      cb.checked = !cb.checked;
      toast(traduzirErro(err), 'erro');
    } finally {
      cb.disabled = false;
    }
  };
}

// ---------------------------------------------------------------------
// Aba Configurações
// ---------------------------------------------------------------------
const PARAMETROS = [
  { chave: 'hour_meter_stale_days', titulo: 'Alerta de horímetro sem atualização (dias)', padrao: 7, min: 1, max: 90,
    ajuda: 'Depois de quantos dias sem nova leitura o equipamento aparece em Pendências (usado a partir da Etapa 4).' },
];

async function abaConfiguracoes(corpo) {
  const cfg = await svc.lerConfiguracoes();
  const par = cfg?.parameters || {};
  corpo.innerHTML = `
    <div class="card" style="max-width:720px"><div class="card-corpo">
      <form id="f-config" class="grade" style="gap:14px">
        <div class="campo"><label for="cfg-empresa">Nome da empresa</label>
          <input id="cfg-empresa" name="company_name" required maxlength="120" value="${esc(cfg?.company_name || '')}"></div>
        <div class="campo"><label for="cfg-planta">Unidade / planta</label>
          <input id="cfg-planta" name="plant_name" maxlength="120" value="${esc(cfg?.plant_name || '')}" placeholder="Ex.: Usina de Divinópolis"></div>
        ${PARAMETROS.map((p) => `<div class="campo"><label for="par-${p.chave}">${esc(p.titulo)}</label>
          <input id="par-${p.chave}" name="par:${p.chave}" type="number" min="${p.min}" max="${p.max}" step="1" required value="${esc(par[p.chave] ?? p.padrao)}">
          <span class="ajuda">${esc(p.ajuda)}</span></div>`).join('')}
        <div class="muted small">${cfg?.updated_at ? `Última alteração: ${fmtDataHora(cfg.updated_at)}` : ''}</div>
        <div><button class="btn btn-primario" type="submit"><i data-lucide="save"></i> Salvar configurações</button></div>
      </form>
    </div></div>`;
  corpo.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const parameters = { ...par };
      PARAMETROS.forEach((p) => { parameters[p.chave] = Number(f[`par:${p.chave}`].value); });
      store.empresa = await svc.salvarConfiguracoes({
        company_name: f.company_name.value.trim(),
        plant_name: textoOuNulo(f.plant_name.value),
        parameters,
      });
      document.querySelector('.marca-prop')?.replaceChildren(document.createTextNode(store.empresa.company_name));
      toast('Configurações salvas.');
    } catch (err) {
      toast(traduzirErro(err), 'erro');
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Aba Custo da mão de obra (R$/hora) — só quem vê custos; edita quem tem costs.write
// ---------------------------------------------------------------------
async function abaCustos(corpo) {
  const [taxas, pessoas] = await Promise.all([osSvc.taxas(), osSvc.responsaveis()]);
  const podeEditar = pode('costs.write');
  const padrao = taxas.find((t) => !t.profile_id);
  const porPessoa = Object.fromEntries(taxas.filter((t) => t.profile_id).map((t) => [t.profile_id, t]));
  const moeda = (v) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const campo = (chave, t) => (podeEditar
    ? `<form class="form-ronda form-taxa" data-chave="${chave}"><input name="valor" inputmode="decimal" autocomplete="off" value="${t ? String(t.hourly_cost).replace('.', ',') : ''}" placeholder="${chave === 'padrao' ? '0,00' : 'Usa o padrão'}" aria-label="Valor da hora">
       <button class="btn btn-sm btn-primario" type="submit" title="Salvar"><i data-lucide="check"></i></button></form>`
    : esc(t ? moeda(t.hourly_cost) : 'Usa o padrão'));
  corpo.innerHTML = `
    <div class="alerta info secao"><i data-lucide="info"></i><div>Valor da hora usado para calcular o custo de mão de obra das ordens de serviço.
      O valor é copiado no momento de cada lançamento: mudar aqui não altera lançamentos antigos. Só administrador e gestor veem estes valores.</div></div>
    <div class="card" style="max-width:760px"><div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th>Quem</th><th>Valor da hora (R$)</th></tr></thead><tbody>
      <tr><td data-rotulo="Quem"><b>Valor padrão</b><div class="small muted">vale para quem não tem valor próprio</div></td><td data-rotulo="Valor da hora">${campo('padrao', padrao)}</td></tr>
      ${pessoas.map((p) => `<tr><td data-rotulo="Quem">${esc(p.full_name)}<div class="small muted">${esc(p.role_name)}</div></td>
        <td data-rotulo="Valor da hora">${campo(p.id, porPessoa[p.id])}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  corpo.onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target.closest('.form-taxa'); if (!f) return;
    const txt = f.valor.value.trim().replace(/\./g, '').replace(',', '.');
    const valor = Number(txt);
    if (txt === '' || !Number.isFinite(valor) || valor < 0) { toast('Informe um valor válido (ex.: 45,00).', 'erro'); return; }
    const chave = f.dataset.chave;
    const atual = chave === 'padrao' ? padrao : porPessoa[chave];
    try {
      if (atual) await osSvc.salvarTaxa(atual.id, valor);
      else await osSvc.criarTaxa(chave === 'padrao' ? null : chave, valor);
      toast('Valor da hora salvo.');
      await abaCustos(corpo); icones();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  };
}

// ---------------------------------------------------------------------
// Aba Histórico de alterações (auditoria)
// ---------------------------------------------------------------------
const NOME_TABELA = {
  profiles: 'Usuário', role_permissions: 'Permissão de perfil', company_settings: 'Configurações',
  equipment: 'Equipamento', equipment_categories: 'Categoria', equipment_documents: 'Documento de equipamento',
  hour_meter_readings: 'Leitura de horímetro', work_orders: 'Ordem de serviço', work_order_labor: 'Mão de obra',
  work_order_attachments: 'Anexo de OS', labor_rates: 'Valor da hora',
};
const NOME_ACAO = {
  insert: 'Inclusão', update: 'Alteração', delete: 'Exclusão', status: 'Mudança de situação',
  liberacao: 'Liberação de acesso', desativacao: 'Desativação', reativacao: 'Reativação', alteracao_acesso: 'Alteração de acesso',
  correcao: 'Correção', cancelamento: 'Cancelamento', aprovacao: 'Aprovação', anulacao: 'Anulação',
};
const NOME_CAMPO = {
  full_name: 'Nome', email: 'E-mail', role_id: 'Perfil', status: 'Situação', hour_meter_authorized: 'Registra horímetro',
  job_title: 'Cargo', approved_by: 'Liberado por', approved_at: 'Liberado em', company_name: 'Empresa', plant_name: 'Unidade',
  parameters: 'Parâmetros', role_id_permission: 'Permissão',
};
const CAMPOS_OCULTOS = new Set(['approved_at', 'created_at', 'created_by', 'updated_at', 'updated_by', 'id', 'last_access_at']);
const SITUACAO = { pendente: 'Aguardando liberação', ativo: 'Ativo', inativo: 'Desativado' };

async function abaHistorico(corpo) {
  const [perfis, permissoes, nomes] = await Promise.all([svc.listarPerfis(), svc.listarPermissoes(), svc.listarNomesUsuarios()]);
  const nomePerfil = Object.fromEntries(perfis.map((p) => [p.id, p.name]));
  const nomePerm = Object.fromEntries(permissoes.map((p) => [p.id, p.description]));
  const nomeUsuario = Object.fromEntries(nomes.map((p) => [p.id, p.full_name]));
  const filtros = { de: addDias(hojeISO(), -30), ate: hojeISO(), tabela: '', usuario: '', acao: '' };
  let pagina = 0;
  let linhas = [];

  corpo.innerHTML = `
    <div class="card" style="margin-bottom:16px"><div class="card-corpo">
      <form id="f-hist" class="filtros-hist">
        <div class="campo"><label for="h-de">De</label><input id="h-de" name="de" type="date" value="${filtros.de}"></div>
        <div class="campo"><label for="h-ate">Até</label><input id="h-ate" name="ate" type="date" value="${filtros.ate}"></div>
        <div class="campo"><label for="h-tab">Assunto</label><select id="h-tab" name="tabela"><option value="">Todos</option>
          ${Object.entries(NOME_TABELA).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        <div class="campo"><label for="h-usu">Quem fez</label><select id="h-usu" name="usuario"><option value="">Todos</option>
          ${nomes.map((n) => `<option value="${n.id}">${esc(n.full_name)}</option>`).join('')}</select></div>
        <div class="campo"><label for="h-acao">Ação</label><select id="h-acao" name="acao"><option value="">Todas</option>
          ${Object.entries(NOME_ACAO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      </form>
    </div></div>
    <div class="card"><div id="lista-hist"></div><div id="mais-hist" style="padding:12px 18px"></div></div>`;

  const lista = corpo.querySelector('#lista-hist');
  const mais = corpo.querySelector('#mais-hist');

  const valorLegivel = (campo, v) => {
    if (v == null || v === '') return '—';
    if (campo === 'role_id') return nomePerfil[v] || v;
    if (campo === 'approved_by' || campo === 'user_id') return nomeUsuario[v] || v;
    if (campo === 'status') return SITUACAO[v] || v;
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(', ');
    return String(v);
  };

  const descreverRegistro = (l) => {
    const d = l.new_data || l.old_data || {};
    if (l.table_name === 'profiles') return d.full_name || '';
    if (l.table_name === 'role_permissions') return `${nomePerfil[d.role_id] || '?'} — ${nomePerm[d.permission_id] || '?'}`;
    if (l.table_name === 'company_settings') return d.company_name || '';
    return l.record_id || '';
  };

  const descreverMudancas = (l) => {
    if (l.table_name === 'role_permissions') return l.action === 'insert' ? 'Permissão concedida' : l.action === 'delete' ? 'Permissão retirada' : '';
    if (l.action === 'insert') return l.table_name === 'profiles' ? 'Conta criada' : 'Registro criado';
    const campos = (l.changed_fields || []).filter((c) => !CAMPOS_OCULTOS.has(c));
    return campos.map((c) => `<div><span class="muted">${esc(NOME_CAMPO[c] || c)}:</span>
      <s class="valor-antigo">${esc(valorLegivel(c, l.old_data?.[c]))}</s> → <b>${esc(valorLegivel(c, l.new_data?.[c]))}</b></div>`).join('');
  };

  const desenhar = () => {
    if (!linhas.length) { lista.innerHTML = vazio({ icone: 'history', titulo: 'Nenhuma alteração no período', texto: 'Mude os filtros para ver outros períodos.' }); return; }
    lista.innerHTML = `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
      <th>Data e hora</th><th>Quem fez</th><th>Ação</th><th>Assunto</th><th>O que mudou</th><th>Justificativa</th></tr></thead><tbody>
      ${linhas.map((l) => `<tr>
        <td data-rotulo="Data e hora" class="num">${fmtDataHora(l.created_at)}</td>
        <td data-rotulo="Quem fez">${esc(l.user_name || (l.user_id ? nomeUsuario[l.user_id] : '') || 'Sistema / SQL Editor')}</td>
        <td data-rotulo="Ação">${esc(NOME_ACAO[l.action] || l.action)}</td>
        <td data-rotulo="Assunto"><b>${esc(NOME_TABELA[l.table_name] || l.table_name)}</b><div class="muted small">${esc(descreverRegistro(l))}</div></td>
        <td data-rotulo="O que mudou" class="small">${descreverMudancas(l) || '—'}</td>
        <td data-rotulo="Justificativa" class="small">${esc(l.justification || '—')}</td>
      </tr>`).join('')}</tbody></table></div>`;
  };

  const POR_PAGINA = 50;
  const carregar = async (acumular = false) => {
    if (!acumular) { pagina = 0; linhas = []; lista.innerHTML = carregando(); }
    mais.innerHTML = '';
    try {
      const r = await svc.listarAuditoria({ ...filtros, pagina, porPagina: POR_PAGINA });
      const temMais = r.length > POR_PAGINA;
      linhas = linhas.concat(r.slice(0, POR_PAGINA));
      desenhar();
      mais.innerHTML = temMais ? '<button class="btn btn-sm" data-mais>Carregar mais</button>'
        : linhas.length ? `<span class="muted small">${linhas.length} registro${linhas.length === 1 ? '' : 's'}</span>` : '';
    } catch (e) {
      lista.innerHTML = erroCarga(e);
    }
    icones();
  };

  corpo.querySelector('#f-hist').addEventListener('change', (e) => {
    filtros[e.target.name] = e.target.value;
    carregar();
  });
  mais.addEventListener('click', (e) => { if (e.target.closest('[data-mais]')) { pagina += 1; carregar(true); } });
  await carregar();
}
