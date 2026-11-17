// =====================================================================
// Ficha do equipamento: dados, status (com motivo), histórico de status,
// documentos, horímetro (leituras, gráfico, correção) e alterações (auditoria).
// =====================================================================
import { pode } from '../store.js';
import { temPlantas, plantaDoEquipamento, nomePlanta } from '../plantas.js';
import { esc, icones, toast, traduzirErro, abrirModal, carregando, vazio, erroCarga, fmtData, fmtDataHora, fmtNum, fmtMoeda, comprimirImagem, montarTabela } from '../ui.js';
import * as svc from '../services/equipamentos.js';
import { badgeStatus, fmtHorimetro } from './equipamentos.js';
import * as hm from '../services/horimetros.js';
import { abrirRegistro, grafico, badgeSituacao, fmtH } from './horimetros.js';
import { listarDoEquipamento as osDoEquipamento, ENCERRADAS } from '../services/ordens.js';
import { tabelaOS, podeAbrirOS } from './ordens.js';
import { doEquipamento as paradasDoEquipamento, fmtDuracao, ligacoes, ligarMaquinas, desligarMaquinas } from '../services/paradas.js';
import { tabelaParadas } from './paradas.js';
import { historicoEquipamento as pecasDoEquipamento, fmtQtd } from '../services/pecas.js';
import { planosDoEquipamento } from '../services/preventiva.js';
import { tabelaPlanos } from './preventiva.js';
import { pontosDoEquipamento, inspecoesDoEquipamento } from '../services/preditiva.js';
import { tabelaPontos, tabelaInspecoes, abrirPonto } from './preditiva.js';
import { doEquipamento as pendenciasDoEquipamento, ESPECIALIDADE, ABERTAS } from '../services/pendencias.js';
import { badgePend, badgePri, prazo, abrirPendencia } from './pendencias.js';

export async function render(el, [id]) {
  const e = await svc.lerEquipamento(id);
  if (!e) { el.innerHTML = '<div class="alerta aviso">Equipamento não encontrado. <a href="#/equipamentos">Voltar</a></div>'; return; }
  document.getElementById('titulo-pagina').textContent = `${e.tag} — ${e.name}`;
  const st = svc.STATUS[e.status];
  const abas = [
    { id: 'dados', titulo: 'Dados', icone: 'info', fn: abaDados },
    { id: 'status', titulo: 'Histórico de status', icone: 'history', fn: abaStatus },
    { id: 'documentos', titulo: `Documentos${e.documents_count ? ` (${e.documents_count})` : ''}`, icone: 'paperclip', fn: abaDocumentos },
    { id: 'horimetro', titulo: 'Horímetro', icone: 'gauge', fn: abaHorimetro },
    { id: 'ordens', titulo: 'Ordens de serviço', icone: 'clipboard-list', fn: abaOrdens },
    { id: 'pendencias', titulo: 'Pendências', icone: 'list-todo', fn: abaPendencias },
    { id: 'paradas', titulo: 'Paradas', icone: 'octagon-pause', fn: abaParadas },
    { id: 'preventiva', titulo: 'Preventiva', icone: 'calendar-check', fn: abaPreventiva },
    { id: 'preditiva', titulo: 'Preditiva', icone: 'activity', fn: abaPreditiva },
    { id: 'pecas', titulo: 'Peças trocadas', icone: 'package', fn: abaPecas },
    ...(pode('audit.read') ? [{ id: 'alteracoes', titulo: 'Alterações', icone: 'file-clock', fn: abaAlteracoes }] : []),
  ];
  e._recarregar = () => render(el, [id]).then(icones);
  const pedida = new URLSearchParams(location.hash.split('?')[1] || '').get('aba');

  el.innerHTML = `
    <a class="voltar" href="#/equipamentos"><i data-lucide="arrow-left"></i> Equipamentos</a>
    <div class="card ficha-topo st-${st?.cor}"><div class="card-corpo">
      <div class="ficha-cab">
        <div><div class="equip-tag grande">${esc(e.tag)}</div><h1>${esc(e.name)}</h1>
          <div class="muted">${esc([temPlantas() ? plantaDoEquipamento(e.id) : null, e.category_name, e.sector, e.location].filter(Boolean).join(' · ') || 'Sem categoria')}</div></div>
        <div class="acoes">
          ${pode('equipment.status') ? '<button class="btn" id="btn-status"><i data-lucide="refresh-cw"></i> Alterar status</button>' : ''}
          ${pode('equipment.write') ? `<a class="btn" href="#/equipamentos/${e.id}/editar"><i data-lucide="pencil"></i> Editar</a>` : ''}
        </div>
      </div>
      <div class="ficha-indicadores">
        <div><span class="rotulo">Status</span>${badgeStatus(e.status)}<span class="small muted">desde ${fmtDataHora(e.status_changed_at)}</span></div>
        <div><span class="rotulo">Criticidade</span><span><span class="crit crit-${e.criticality}">${e.criticality}</span> ${esc(svc.CRITICIDADE[e.criticality].split(' — ')[1])}</span></div>
        <div><span class="rotulo">Horímetro atual</span><b>${esc(fmtHorimetro(e))}</b>${e.current_hour_meter_at ? `<span class="small muted">lido em ${fmtDataHora(e.current_hour_meter_at)}</span>` : ''}</div>
      </div>
    </div></div>
    <div class="abas" role="tablist">${abas.map((a) => `<button class="aba" data-aba="${a.id}"><i data-lucide="${a.icone}" style="width:16px;height:16px;vertical-align:-3px"></i> ${esc(a.titulo)}</button>`).join('')}</div>
    <div id="aba-corpo"></div>`;

  const corpo = el.querySelector('#aba-corpo');
  const abrir = async (a) => {
    el.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === a.id));
    history.replaceState(null, '', `${location.pathname}${location.search}#/equipamentos/${e.id}?aba=${a.id}`);
    corpo.innerHTML = carregando();
    try { await a.fn(corpo, e); } catch (err) { console.error(err); corpo.innerHTML = erroCarga(err); }
    icones();
  };
  el.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => abrir(abas.find((a) => a.id === b.dataset.aba))));
  el.querySelector('#btn-status')?.addEventListener('click', () => abrirStatus(e, () => render(el, [id]).then(icones)));
  await abrir(abas.find((a) => a.id === pedida) || abas[0]);
}

function abaDados(corpo, e) {
  const linha = (rot, v) => `<dt>${esc(rot)}</dt><dd>${v == null || v === '' ? '<span class="muted">—</span>' : esc(v)}</dd>`;
  corpo.innerHTML = `<div class="grade grade-2">
    <div class="card"><div class="card-titulo"><h3><i data-lucide="factory"></i> Identificação</h3></div><div class="card-corpo"><dl class="dados-conta">
      ${linha('TAG', e.tag)}${linha('Nome', e.name)}${temPlantas() ? linha('Planta', plantaDoEquipamento(e.id)) : ''}${linha('Categoria', e.category_name)}${linha('Setor', e.sector)}${linha('Localização', e.location)}
      ${linha('Criticidade', svc.CRITICIDADE[e.criticality])}
    </dl></div></div>
    <div class="card"><div class="card-titulo"><h3><i data-lucide="cog"></i> Dados técnicos</h3></div><div class="card-corpo"><dl class="dados-conta">
      ${linha('Fabricante', e.manufacturer)}${linha('Modelo', e.model)}${linha('Nº de série', e.serial_number)}
      ${linha('Ano de fabricação', e.manufacture_year)}${linha('Instalado em', e.installed_at ? fmtData(e.installed_at) : '')}
      ${linha('Potência', e.power_kw != null ? `${Number(e.power_kw).toLocaleString('pt-BR')} kW (${(e.power_kw / 0.7355).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} CV)` : '')}
      ${linha('Horímetro', e.has_hour_meter ? `Sim — alerta após ${e.stale_days_effective} dias sem leitura${e.hour_meter_stale_days ? '' : ' (padrão da empresa)'}` : 'Não possui')}
    </dl></div></div>
  </div>
  ${e.notes ? `<div class="card secao"><div class="card-titulo"><h3><i data-lucide="sticky-note"></i> Observações</h3></div><div class="card-corpo" style="white-space:pre-wrap">${esc(e.notes)}</div></div>` : ''}
  <p class="muted small secao">Cadastrado em ${fmtDataHora(e.created_at)} · última alteração em ${fmtDataHora(e.updated_at)}</p>`;
}

async function abaStatus(corpo, e) {
  const h = await svc.historicoStatus(e.id);
  corpo.innerHTML = `<div class="card"><div class="card-corpo">${h.length ? `<ul class="linha-tempo">${h.map((x) => `<li>
      <div>${x.old_status ? `${badgeStatus(x.old_status)} → ` : ''}${badgeStatus(x.new_status)}</div>
      ${x.reason ? `<div style="margin-top:4px">${esc(x.reason)}</div>` : ''}
      <div class="quando">${fmtDataHora(x.changed_at)} · ${esc(x.autor?.full_name || 'Sistema / SQL Editor')}</div></li>`).join('')}</ul>`
    : vazio({ icone: 'history', titulo: 'Sem histórico' })}</div></div>`;
}

async function abaDocumentos(corpo, e) {
  const docs = await svc.listarDocumentos(e.id);
  const podeEnviar = pode('equipment.write');
  corpo.innerHTML = `
    ${podeEnviar ? `<div class="card" style="margin-bottom:16px"><div class="card-corpo">
      <form id="f-doc" class="form-doc">
        <div class="campo"><label for="d-arq">Arquivo (PDF ou imagem, até 20 MB)</label><input id="d-arq" name="arq" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required></div>
        <div class="campo"><label for="d-tit">Título</label><input id="d-tit" name="titulo" required minlength="2" maxlength="160" placeholder="Ex.: Manual de operação"></div>
        <div class="campo"><label for="d-tipo">Tipo</label><select id="d-tipo" name="tipo">${Object.entries(svc.TIPO_DOC).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><button class="btn btn-primario" type="submit"><i data-lucide="upload"></i> Enviar</button></div>
      </form></div></div>` : ''}
    <div class="card"><div class="card-corpo">${docs.length ? `<ul class="lista-docs">${docs.map((d) => `<li>
        <i data-lucide="${d.mime_type === 'application/pdf' ? 'file-text' : 'image'}"></i>
        <div class="doc-info"><b>${esc(d.title)}</b><div class="muted small">${esc(svc.TIPO_DOC[d.doc_type] || d.doc_type)} · ${esc(d.file_name || '')}${d.size_bytes ? ` · ${fmtNum(d.size_bytes / 1048576, 1)} MB` : ''} · enviado em ${fmtDataHora(d.created_at)} por ${esc(d.autor?.full_name || '—')}</div></div>
        <span class="acoes"><button class="btn btn-sm" data-abrir="${esc(d.storage_path)}"><i data-lucide="external-link"></i> Abrir</button>
        ${podeEnviar ? `<button class="btn btn-sm btn-texto" data-remover="${d.id}" title="Remover da lista"><i data-lucide="trash-2"></i></button>` : ''}</span>
      </li>`).join('')}</ul>` : vazio({ icone: 'paperclip', titulo: 'Nenhum documento', texto: podeEnviar ? 'Envie manuais, desenhos, laudos e fotos deste equipamento.' : '' })}</div></div>`;

  corpo.querySelector('#f-doc')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector('[type=submit]');
    let arq = f.arq.files[0];
    if (!arq) return;
    if (arq.size > 20 * 1048576) return toast('O arquivo passa de 20 MB.', 'erro');
    btn.disabled = true; btn.innerHTML = 'Enviando…';
    try {
      if (arq.type.startsWith('image/')) arq = await comprimirImagem(arq);
      await svc.enviarDocumento(e.id, arq, { titulo: f.titulo.value.trim(), tipo: f.tipo.value });
      toast('Documento enviado.');
      await abaDocumentos(corpo, e); icones();
    } catch (err) {
      toast(traduzirErro(err), 'erro');
      btn.disabled = false; btn.innerHTML = '<i data-lucide="upload"></i> Enviar'; icones();
    }
  });
  corpo.onclick = async (ev) => {
    const ab = ev.target.closest('[data-abrir]');
    const rm = ev.target.closest('[data-remover]');
    try {
      if (ab) window.open(await svc.linkDocumento(ab.dataset.abrir), '_blank', 'noopener');
      if (rm && confirm('Remover este documento da lista? O arquivo continua guardado no histórico.')) {
        await svc.removerDocumento(rm.dataset.remover);
        toast('Documento removido da lista.');
        await abaDocumentos(corpo, e); icones();
      }
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  };
}

async function abaHorimetro(corpo, e) {
  if (!e.has_hour_meter) {
    corpo.innerHTML = `<div class="card"><div class="card-corpo">${vazio({ icone: 'gauge', titulo: 'Equipamento sem horímetro',
      texto: 'Este equipamento está cadastrado como "sem horímetro". Para registrar leituras, edite o cadastro e marque "possui horímetro".' })}</div></div>`;
    return;
  }
  const [lista, sit] = await Promise.all([hm.leituras(e.id), hm.situacaoEquipamento(e.id)]);
  const podeLancar = pode('hour_meter.write') && e.status !== 'desativado';
  const podeCorrigir = pode('hour_meter.correct');
  const validas = lista.filter((l) => l.status === 'valida');
  const outras = lista.length - validas.length;
  let verTodas = false;
  const anterior = Object.fromEntries(lista.map((l) => [l.id, l]));
  const decorrido = (l) => {
    const a = anterior[l.previous_reading_id];
    if (!a || l.status !== 'valida') return '';
    const h = (new Date(l.read_at) - new Date(a.read_at)) / 36e5;
    return `<div class="small muted">em ${h >= 48 ? `${fmtNum(h / 24, 1)} dias` : `${fmtNum(h, 1)} h`}</div>`;
  };

  const desenhar = () => {
    const mostrar = verTodas ? lista : validas;
    corpo.innerHTML = `
      <div class="resumo-hm">
        <div class="card"><div class="card-corpo"><span class="rotulo">Horímetro atual</span><b class="grande">${fmtH(e.current_hour_meter)}</b>
          <span class="small muted">${e.current_hour_meter_at ? `lido em ${fmtDataHora(e.current_hour_meter_at)}` : 'nenhuma leitura ainda'}</span></div></div>
        <div class="card"><div class="card-corpo"><span class="rotulo">Situação</span>${sit ? badgeSituacao(sit.situacao) : '<span class="muted">—</span>'}
          <span class="small muted">alerta após ${e.stale_days_effective} dias sem leitura</span></div></div>
        <div class="card"><div class="card-corpo"><span class="rotulo">Média de uso (30 dias)</span><b class="grande">${sit?.media_h_dia == null ? '—' : `${fmtNum(sit.media_h_dia, 1)} h/dia`}</b>
          <span class="small muted">${validas.length} leitura${validas.length === 1 ? '' : 's'} válida${validas.length === 1 ? '' : 's'}</span></div></div>
      </div>
      ${podeLancar ? '<div class="acoes" style="margin:0 0 16px"><button class="btn btn-primario" id="btn-leitura"><i data-lucide="plus"></i> Registrar leitura</button></div>' : ''}
      ${validas.length >= 2 ? `<div class="card secao"><div class="card-titulo"><h3><i data-lucide="trending-up"></i> Evolução do horímetro</h3></div>
        <div class="card-corpo">${grafico(validas)}</div></div>` : ''}
      <div class="card secao">
        <div class="card-titulo"><h3><i data-lucide="list"></i> Leituras</h3>
          ${outras ? `<label class="check-linha small"><input type="checkbox" id="ver-todas" ${verTodas ? 'checked' : ''}> Mostrar corrigidas e anuladas (${outras})</label>` : ''}</div>
        ${mostrar.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
          <th>Data e hora</th><th>Valor</th><th>Horas desde a anterior</th><th>Tipo</th><th>Quem registrou</th><th>Observação</th>${podeCorrigir ? '<th></th>' : ''}
        </tr></thead><tbody>${mostrar.map((l) => `<tr class="${l.status !== 'valida' ? 'linha-inativa' : ''}">
          <td data-rotulo="Data e hora" class="num">${fmtDataHora(l.read_at)}</td>
          <td data-rotulo="Valor" class="num"><b>${l.status !== 'valida' ? `<s>${fmtH(l.value)}</s>` : fmtH(l.value)}</b></td>
          <td data-rotulo="Horas desde a anterior" class="num">${l.delta_hours == null ? '—' : `+${fmtNum(l.delta_hours, 1)} h`}${decorrido(l)}</td>
          <td data-rotulo="Tipo">${esc(hm.TIPO[l.kind] || l.kind)}${l.status !== 'valida' ? ` <span class="badge ${l.status === 'anulada' ? 'perigo' : 'inativo'}">${esc(hm.STATUS_LEITURA[l.status])}</span>` : ''}
            ${l.justification ? `<div class="small muted">Motivo: ${esc(l.justification)}</div>` : ''}
            ${l.replaced_at ? `<div class="small muted">${l.status === 'anulada' ? 'Anulada' : 'Corrigida'} em ${fmtDataHora(l.replaced_at)} por ${esc(l.quem_corrigiu?.full_name || '—')}</div>` : ''}</td>
          <td data-rotulo="Quem registrou">${esc(l.autor?.full_name || 'Importação / SQL')}<div class="small muted">${fmtDataHora(l.created_at)}</div></td>
          <td data-rotulo="Observação" class="small">${esc(l.notes || '')}${l.attachment_path ? ` <button class="btn btn-sm btn-texto" data-foto="${esc(l.attachment_path)}"><i data-lucide="image"></i> Foto</button>` : ''}${!l.notes && !l.attachment_path ? '—' : ''}</td>
          ${podeCorrigir ? `<td class="acoes-linha">${l.status === 'valida' ? `<button class="btn btn-sm" data-corrigir="${l.id}"><i data-lucide="pencil"></i> Corrigir</button>
            <button class="btn btn-sm btn-texto" data-anular="${l.id}" title="Anular (ex.: lançada no equipamento errado)"><i data-lucide="ban"></i></button>` : ''}</td>` : ''}
        </tr>`).join('')}</tbody></table></div>`
        : `<div class="card-corpo">${vazio({ icone: 'gauge', titulo: 'Nenhuma leitura registrada',
            texto: podeLancar ? 'Registre a leitura inicial do horímetro deste equipamento.' : '' })}</div>`}
      </div>
      <p class="muted small secao">Leituras não podem ser apagadas nem editadas. Se houver erro, o administrador corrige ou anula com justificativa, e o histórico fica guardado.</p>`;
    icones();
  };

  corpo.onclick = async (ev) => {
    const alvo = (s) => ev.target.closest(s);
    try {
      if (alvo('#btn-leitura')) abrirRegistro(e, e._recarregar);
      else if (alvo('#ver-todas')) { verTodas = !verTodas; desenhar(); }
      else if (alvo('[data-foto]')) window.open(await hm.linkFoto(alvo('[data-foto]').dataset.foto), '_blank', 'noopener');
      else if (alvo('[data-corrigir]')) abrirCorrecao(e, anterior[alvo('[data-corrigir]').dataset.corrigir], 'corrigir');
      else if (alvo('[data-anular]')) abrirCorrecao(e, anterior[alvo('[data-anular]').dataset.anular], 'anular');
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  };
  desenhar();
}

async function abaOrdens(corpo, e) {
  const lista = await osDoEquipamento(e.id);
  const abertas = lista.filter((o) => !ENCERRADAS.includes(o.status)).length;
  const podeAbrir = podeAbrirOS() && e.status !== 'desativado';
  corpo.innerHTML = `
    <div class="acoes" style="margin:0 0 12px;justify-content:space-between;align-items:center">
      <span class="muted">${lista.length ? `${lista.length} ordem${lista.length === 1 ? '' : 's'} · ${abertas} em andamento` : ''}</span>
      ${podeAbrir ? `<a class="btn btn-primario" href="#/ordens/nova?equipamento=${e.id}"><i data-lucide="plus"></i> Abrir OS</a>` : ''}</div>
    <div class="card" id="tab-os-equip"></div>`;
  if (lista.length) tabelaOS(corpo.querySelector('#tab-os-equip'), lista, { semEquipamento: true });
  else corpo.querySelector('#tab-os-equip').innerHTML = `<div class="card-corpo">${vazio({ icone: 'clipboard-list', titulo: 'Nenhuma ordem de serviço para este equipamento' })}</div>`;
}

async function abaPendencias(corpo, e) {
  const lista = await pendenciasDoEquipamento(e.id);
  const ordemPri = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  const abertas = lista.filter((p) => ABERTAS.includes(p.status));
  // abertas primeiro (atrasadas, depois por prioridade e prazo); concluídas/canceladas no fim, mais recentes antes
  const ordenada = [...abertas.sort((a, b) => (b.overdue - a.overdue) || (ordemPri[a.priority] - ordemPri[b.priority]) || String(a.due_date || '9').localeCompare(String(b.due_date || '9'))),
    ...lista.filter((p) => !ABERTAS.includes(p.status)).sort((a, b) => String(b.done_at || b.updated_at).localeCompare(String(a.done_at || a.updated_at)))];
  const podeCriar = pode('pending.write') && e.status !== 'desativado';
  corpo.innerHTML = `
    <div class="acoes" style="margin:0 0 12px;justify-content:space-between;align-items:center">
      <span class="muted">${lista.length ? `${abertas.length} em aberto · ${lista.length - abertas.length} encerrada${lista.length - abertas.length === 1 ? '' : 's'}` : ''}</span>
      ${podeCriar ? '<button class="btn btn-primario" id="btn-pend-eq"><i data-lucide="plus"></i> Nova pendência</button>' : ''}</div>
    <div class="card" id="tab-pend-equip"></div>`;
  corpo.querySelector('#btn-pend-eq')?.addEventListener('click', () => abrirPendencia({ equipamentoId: e.id, depois: () => abaPendencias(corpo, e).then(icones) }));
  const alvo = corpo.querySelector('#tab-pend-equip');
  if (!lista.length) { alvo.innerHTML = `<div class="card-corpo">${vazio({ icone: 'list-todo', titulo: 'Nenhuma pendência para este equipamento' })}</div>`; return; }
  montarTabela(alvo, {
    linhas: ordenada, busca: false, porPagina: 50,
    aoClicar: (id) => { location.hash = `#/pendencias/${id}`; },
    colunas: [
      { titulo: 'Pendência', valor: (p) => p.title, primaria: true, render: (p) => `<b>${esc(p.title)}</b>` },
      { titulo: 'Situação', valor: (p) => p.status, render: (p) => badgePend(p.status) },
      { titulo: 'Prioridade', valor: (p) => ordemPri[p.priority], render: (p) => badgePri(p.priority) },
      { titulo: 'Especialidade', valor: (p) => ESPECIALIDADE[p.specialty]?.nome || '', render: (p) => esc(ESPECIALIDADE[p.specialty]?.nome || '—') },
      { titulo: 'Programação', valor: (p) => p.next_schedule_date || '9999', render: (p) => (p.next_schedule_date && ABERTAS.includes(p.status) ? `<span class="small nowrap">${fmtData(p.next_schedule_date).slice(0, 5)} · ${esc(p.next_schedule_staff)}</span>` : '<span class="muted small">—</span>') },
      { titulo: 'Prazo', valor: (p) => p.due_date || '9999', classe: 'num', render: prazo },
      { titulo: 'Responsável', valor: (p) => p.assigned_to_name || '', render: (p) => esc(p.assigned_to_name || '—') },
    ],
  });
}

async function abaParadas(corpo, e) {
  const lista = await paradasDoEquipamento(e.id);
  const aberta = lista.find((p) => p.is_open);
  const total = lista.reduce((s, p) => s + Number(p.duration_hours), 0);
  const podeReg = pode('downtime.write') && e.status !== 'desativado' && !aberta;
  corpo.innerHTML = `
    ${aberta ? `<div class="alerta perigo secao"><i data-lucide="octagon-alert"></i><div>Parada em aberto desde ${fmtDataHora(aberta.started_at)} (${esc(aberta.reason_name)}).
      <a href="#/paradas/${aberta.id}"><b>Abrir a parada</b></a> para mudar a fase ou confirmar o retorno.</div></div>` : ''}
    <div class="acoes" style="margin:0 0 12px;justify-content:space-between;align-items:center">
      <span class="muted">${lista.length ? `${lista.length} parada${lista.length === 1 ? '' : 's'} · ${fmtDuracao(total)} no total` : ''}</span>
      ${podeReg ? `<a class="btn btn-primario" href="#/paradas/nova?equipamento=${e.id}"><i data-lucide="plus"></i> Registrar parada</a>` : ''}</div>
    <div class="card" id="tab-par-equip"></div>
    <div id="maq-ligadas"></div>`;
  tabelaParadas(corpo.querySelector('#tab-par-equip'), lista, { semEquipamento: true });
  await cardLigadas(corpo.querySelector('#maq-ligadas'), e);
}

// "Quando esta máquina para, também param: …" — usado no registro da parada
async function cardLigadas(box, e) {
  const [links, todos] = await Promise.all([ligacoes().catch(() => null), svc.listarEquipamentos()]);
  if (!links) { box.innerHTML = ''; return; }
  const podeLigar = pode('equipment.write');
  const minhas = links.filter((l) => l.equipment_id === e.id);
  if (!minhas.length && !podeLigar) { box.innerHTML = ''; return; }
  const eq = (id) => todos.find((x) => x.id === id) || { tag: '?', name: '' };
  const ja = new Set(minhas.map((l) => l.stops_equipment_id));
  const opcoes = todos.filter((x) => x.id !== e.id && !ja.has(x.id) && x.status !== 'desativado')
    .sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR', { numeric: true }));
  box.innerHTML = `<div class="card secao"><div class="card-titulo"><h3><i data-lucide="link"></i> Máquinas ligadas</h3>
      <span class="muted small">quando a ${esc(e.tag)} para, estas param junto</span></div>
    <div class="card-corpo grade" style="gap:12px">
      ${minhas.length ? `<ul class="lista-ligadas">${minhas.map((l) => `<li><a href="#/equipamentos/${l.stops_equipment_id}?aba=paradas"><b>${esc(eq(l.stops_equipment_id).tag)}</b> — ${esc(eq(l.stops_equipment_id).name)}</a>
        ${podeLigar ? `<span class="acoes"><button class="btn btn-sm btn-texto" data-desligar="${l.id}" title="Desfazer a ligação"><i data-lucide="unlink"></i> Desligar</button></span>` : ''}</li>`).join('')}</ul>`
        : '<p class="muted" style="margin:0">Nenhuma. Se outra máquina para quando esta para, ligue aqui: ao registrar a parada, a outra já vem marcada.</p>'}
      ${podeLigar ? `<form id="f-ligar" class="linha-form">
        <select name="outra" required aria-label="Máquina que para junto"><option value="">Também para junto…</option>
          ${opcoes.map((x) => `<option value="${x.id}">${esc(x.tag)} — ${esc(x.name)}</option>`).join('')}</select>
        <label class="check-linha small" style="white-space:nowrap"><input type="checkbox" name="volta" checked> nos dois sentidos</label>
        <button class="btn" type="submit"><i data-lucide="link"></i> Ligar</button></form>` : ''}
    </div></div>`;
  const recarregar = () => cardLigadas(box, e).then(icones);
  box.querySelector('#f-ligar')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const outra = ev.target.outra.value; if (!outra) return;
    try {
      await ligarMaquinas(e.id, outra);
      if (ev.target.volta.checked && !links.some((l) => l.equipment_id === outra && l.stops_equipment_id === e.id)) await ligarMaquinas(outra, e.id);
      toast(`Ligado: quando a ${e.tag} parar, a ${eq(outra).tag} já vem marcada.`); recarregar();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
  box.querySelector('.lista-ligadas')?.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-desligar]'); if (!b) return;
    const l = minhas.find((x) => x.id === b.dataset.desligar);
    if (!confirm(`Desfazer a ligação ${e.tag} → ${eq(l.stops_equipment_id).tag}? As paradas já registradas não mudam.`)) return;
    try { await desligarMaquinas(l.id); toast('Ligação desfeita.'); recarregar(); } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
}

async function abaPreventiva(corpo, e) {
  const lista = await planosDoEquipamento(e.id);
  const ativos = lista.filter((p) => p.active);
  const podeCriar = pode('planning.write') && e.status !== 'desativado';
  corpo.innerHTML = `
    <div class="acoes" style="margin:0 0 12px;justify-content:space-between;align-items:center">
      <span class="muted">${lista.length ? `${ativos.length} plano${ativos.length === 1 ? '' : 's'} ativo${ativos.length === 1 ? '' : 's'}${lista.length > ativos.length ? ` · ${lista.length - ativos.length} desativado${lista.length - ativos.length === 1 ? '' : 's'}` : ''}` : ''}</span>
      ${podeCriar ? `<a class="btn btn-primario" href="#/preventiva/planos/novo?equipamento=${e.id}"><i data-lucide="plus"></i> Novo plano</a>` : ''}</div>
    <div class="card" id="tab-planos-equip"></div>`;
  tabelaPlanos(corpo.querySelector('#tab-planos-equip'), lista, { semEquipamento: true });
}

async function abaPreditiva(corpo, e) {
  const [pontos, insps] = await Promise.all([pontosDoEquipamento(e.id), inspecoesDoEquipamento(e.id)]);
  const ordem = { critico: 0, alerta: 1, sem_medicao: 2, normal: 3, inativo: 4 };
  pontos.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.name.localeCompare(b.name, 'pt-BR'));
  const ativos = pontos.filter((p) => p.active);
  const ok = e.status !== 'desativado';
  corpo.innerHTML = `
    <div class="acoes" style="margin:0 0 12px;justify-content:space-between;align-items:center">
      <span class="muted">${ativos.length ? `${ativos.length} ponto${ativos.length === 1 ? '' : 's'} de medição` : ''}</span>
      <span class="acoes">${pode('planning.write') && ok ? '<button class="btn" id="btn-ponto-eq"><i data-lucide="plus"></i> Novo ponto</button>' : ''}
        ${pode('inspection.write') && ok ? `<a class="btn btn-primario" href="#/preditiva/inspecoes/nova?equipamento=${e.id}"><i data-lucide="clipboard-plus"></i> Registrar inspeção</a>` : ''}</span></div>
    <div class="card" id="tab-pontos-equip"></div>
    <h3 class="secao"><i data-lucide="clipboard-check" style="width:18px;height:18px;vertical-align:-3px"></i> Inspeções</h3>
    <div class="card" id="tab-insp-equip"></div>`;
  tabelaPontos(corpo.querySelector('#tab-pontos-equip'), pontos, { semEquipamento: true });
  tabelaInspecoes(corpo.querySelector('#tab-insp-equip'), insps, { semEquipamento: true });
  corpo.querySelector('#btn-ponto-eq')?.addEventListener('click', () => abrirPonto({ equipamentoId: e.id, depois: () => abaPreditiva(corpo, e).then(icones) }));
}

async function abaPecas(corpo, e) {
  const verCusto = pode('costs.read');
  // do maior para o menor: peças mais trocadas primeiro
  const lista = (await pecasDoEquipamento(e.id)).sort((a, b) => b.times_replaced - a.times_replaced || String(b.last_replaced_at).localeCompare(String(a.last_replaced_at)));
  const total = lista.reduce((s, p) => s + Number(p.total_cost || 0), 0);
  corpo.innerHTML = `
    <div class="acoes" style="margin:0 0 12px;justify-content:space-between;align-items:center">
      <span class="muted">${lista.length ? `${lista.length} peça${lista.length === 1 ? '' : 's'} diferente${lista.length === 1 ? '' : 's'} trocada${lista.length === 1 ? '' : 's'}${verCusto ? ` · ${fmtMoeda(total)} em peças` : ''}` : ''}</span>
      <span class="muted small">As peças são lançadas na ficha de cada OS.</span></div>
    <div class="card" id="tab-pecas-equip"></div>
    <p class="muted small secao">Intervalo médio: tempo entre uma troca e a seguinte, em dias de calendário e em horas de horímetro (pela leitura válida mais próxima antes de cada troca).</p>`;
  montarTabela(corpo.querySelector('#tab-pecas-equip'), {
    linhas: lista, busca: false, porPagina: 50, idLinha: (p) => p.part_key,
    aoClicar: (k) => { const p = lista.find((x) => x.part_key === k); if (p?.part_id) location.hash = `#/pecas/${p.part_id}`; },
    vazioHtml: vazio({ icone: 'package', titulo: 'Nenhuma peça trocada neste equipamento', texto: 'Quando uma peça for lançada numa OS deste equipamento, o histórico aparece aqui.' }),
    colunas: [
      { titulo: 'Peça', valor: (p) => p.part_name, primaria: true, render: (p) => `<div>${p.part_code ? `<b>${esc(p.part_code)}</b> ` : '<span class="badge inativo">fora do catálogo</span> '}${esc(p.part_name)}</div>` },
      { titulo: 'Trocas', valor: (p) => Number(p.times_replaced), render: (p) => `<div><b>${p.times_replaced}×</b><div class="small muted">${p.work_orders_count} OS · ${fmtQtd(p.total_quantity, p.unit)}</div></div>`, classe: 'num' },
      { titulo: 'Última troca', valor: (p) => p.last_replaced_at, render: (p) => `<span class="nowrap">${fmtDataHora(p.last_replaced_at)}</span>`, classe: 'num' },
      { titulo: 'Intervalo médio', valor: (p) => Number(p.avg_days_between ?? 1e9), render: (p) => (p.avg_days_between == null ? '<span class="muted small">1ª troca</span>'
        : `<div>${fmtNum(p.avg_days_between, 0)} dias${p.avg_hours_between != null ? `<div class="small muted">${fmtNum(p.avg_hours_between, 0)} h de horímetro</div>` : ''}</div>`), classe: 'num' },
      ...(verCusto ? [{ titulo: 'Custo', valor: (p) => Number(p.total_cost ?? -1), render: (p) => (p.total_cost == null ? '<span class="muted small">sem valor</span>' : fmtMoeda(p.total_cost)), classe: 'num' }] : []),
      { titulo: 'Motivos', valor: (p) => p.reasons || '', render: (p) => `<span class="small">${esc(p.reasons || '—')}</span>` },
    ],
  });
}

function abrirCorrecao(e, l, modo) {
  const corrigir = modo === 'corrigir';
  const { el, fechar } = abrirModal({
    titulo: corrigir ? `Corrigir leitura — ${e.tag}` : `Anular leitura — ${e.tag}`,
    html: `<form id="f-corr" class="grade" style="gap:14px">
      <div>Leitura de <b>${fmtDataHora(l.read_at)}</b>: <b>${fmtH(l.value)}</b>${l.autor?.full_name ? `, registrada por ${esc(l.autor.full_name)}` : ''}.</div>
      ${corrigir ? `<div class="campo"><label for="c-valor">Valor correto (h) *</label>
        <input id="c-valor" name="valor" inputmode="decimal" required autocomplete="off"></div>`
        : '<div class="alerta aviso small"><i data-lucide="triangle-alert"></i><div>Use para leitura lançada no equipamento errado. Ela deixa de contar, mas continua no histórico.</div></div>'}
      <div class="campo"><label for="c-just">Justificativa * (mínimo 10 caracteres)</label>
        <textarea id="c-just" name="just" rows="3" required minlength="10" maxlength="500"
          placeholder="${corrigir ? 'Ex.: valor digitado errado; conferido no mostrador' : 'Ex.: leitura era do equipamento LAS-02'}"></textarea></div>
      <div id="msg-corr"></div></form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn ${corrigir ? 'btn-primario' : 'btn-perigo'}" type="submit" form="f-corr">${corrigir ? 'Salvar correção' : 'Anular leitura'}</button>`,
  });
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const msg = el.querySelector('#msg-corr');
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      if (corrigir) {
        const v = hm.lerNumero(f.valor.value);
        if (v == null || Number.isNaN(v)) throw new Error('Informe um valor válido.');
        await hm.corrigir(l.id, v, f.just.value.trim());
        toast('Leitura corrigida. A anterior ficou guardada no histórico.');
      } else {
        await hm.anular(l.id, f.just.value.trim());
        toast('Leitura anulada.');
      }
      fechar(); e._recarregar?.();
    } catch (err) {
      msg.innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
}

const ROTULO = {
  tag: 'TAG', name: 'Nome', category_id: 'Categoria', sector: 'Setor', location: 'Localização', manufacturer: 'Fabricante',
  model: 'Modelo', serial_number: 'Nº de série', manufacture_year: 'Ano de fabricação', installed_at: 'Instalado em',
  criticality: 'Criticidade', status: 'Status', has_hour_meter: 'Possui horímetro', hour_meter_stale_days: 'Dias para alerta de horímetro',
  plant_id: 'Planta', notes: 'Observações', power_kw: 'Potência (kW)', removed_at: 'Removido em', title: 'Título',
};
const OCULTOS = new Set(['updated_at', 'updated_by', 'created_at', 'created_by', 'status_changed_at', 'removed_by', 'id']);

async function abaAlteracoes(corpo, e) {
  const [logs, cats] = await Promise.all([svc.alteracoesEquipamento(e.id), svc.listarCategorias()]);
  const nomeCat = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const val = (c, v) => {
    if (v == null || v === '') return '—';
    if (c === 'category_id') return nomeCat[v] || v;
    if (c === 'plant_id') return nomePlanta(v) || v;
    if (c === 'status') return svc.STATUS[v]?.nome || v;
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (c === 'removed_at') return fmtDataHora(v);
    return String(v);
  };
  const desc = (l) => {
    if (l.table_name === 'equipment_documents') {
      return l.action === 'insert' ? `Documento enviado: ${esc(l.new_data?.title)}` : (l.changed_fields || []).includes('removed_at') ? `Documento removido da lista: ${esc(l.new_data?.title)}` : 'Documento alterado';
    }
    if (l.table_name === 'hour_meter_readings') {
      const n = l.new_data || {};
      const h = (v) => `${fmtNum(v, 1)} h`;
      if (l.action === 'correcao' && n.status === 'substituida') return `Leitura de ${fmtDataHora(n.read_at)} corrigida (era ${esc(h(n.value))})`;
      if (l.action === 'correcao' && l.old_data == null) return `Leitura corrigida para <b>${esc(h(n.value))}</b>`;
      if (l.action === 'anulacao' && n.status === 'anulada') return `Leitura de ${fmtDataHora(n.read_at)} anulada (${esc(h(n.value))})`;
      if (l.action === 'insert') return `Leitura de horímetro: <b>${esc(h(n.value))}</b> em ${fmtDataHora(n.read_at)}`;
      return `Horas da leitura de ${fmtDataHora(n.read_at)} recalculadas`;
    }
    if (l.action === 'insert') return 'Equipamento cadastrado';
    return (l.changed_fields || []).filter((c) => !OCULTOS.has(c)).map((c) => `<div><span class="muted">${esc(ROTULO[c] || c)}:</span>
      <s class="valor-antigo">${esc(val(c, l.old_data?.[c]))}</s> → <b>${esc(val(c, l.new_data?.[c]))}</b></div>`).join('') || '—';
  };
  corpo.innerHTML = `<div class="card">${logs.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
      <th>Data e hora</th><th>Quem fez</th><th>O que mudou</th><th>Motivo</th></tr></thead><tbody>
      ${logs.map((l) => `<tr><td data-rotulo="Data e hora" class="num">${fmtDataHora(l.created_at)}</td>
        <td data-rotulo="Quem fez">${esc(l.user_name || 'Sistema / SQL Editor')}</td>
        <td data-rotulo="O que mudou" class="small">${desc(l)}</td>
        <td data-rotulo="Motivo" class="small">${esc(l.justification || '—')}</td></tr>`).join('')}
    </tbody></table></div>` : vazio({ icone: 'file-clock', titulo: 'Nenhuma alteração registrada' })}</div>`;
}

// ---------------------------------------------------------------------
// Alterar status (motivo obrigatório)
// ---------------------------------------------------------------------
function abrirStatus(e, aoSalvar) {
  const opcoes = Object.entries(svc.STATUS).filter(([k]) => ['operando', 'desativado'].includes(k) && k !== e.status && (k !== 'desativado' || pode('equipment.write')));
  const { el, fechar } = abrirModal({
    titulo: `Alterar status — ${e.tag}`,
    html: `<form id="f-status" class="grade" style="gap:14px">
      <div>Status atual: ${badgeStatus(e.status)}</div>
      <fieldset class="campo"><legend>Novo status</legend>
        ${opcoes.map(([k, v]) => `<label class="check-linha"><input type="radio" name="status" value="${k}" required> ${badgeStatus(k)}
          <span class="muted small">${{ operando: 'em funcionamento normal', em_manutencao: 'em intervenção de manutenção', parado: 'indisponível, aguardando', desativado: 'fora de uso (não aparece no parque ativo)' }[k]}</span></label>`).join('')}
      </fieldset>
      <div class="campo"><label for="st-motivo">Motivo (obrigatório)</label>
        <textarea id="st-motivo" name="motivo" rows="3" required minlength="3" maxlength="400" placeholder="Ex.: quebra do redutor; aguardando peça"></textarea></div>
      <div class="alerta small"><i data-lucide="info"></i><div>"Parado" e "Em manutenção" vêm das <b>paradas</b>: para indicar que o equipamento parou, use
        <a href="#/paradas/nova?equipamento=${e.id}">Registrar parada</a>. Aqui só se desativa ou reativa o equipamento.</div></div>
      <div id="msg-st"></div></form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-status">Salvar status</button>',
  });
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      await svc.alterarStatus(e.id, f.status.value, f.motivo.value.trim());
      toast('Status alterado.');
      fechar(); aoSalvar();
    } catch (err) {
      el.querySelector('#msg-st').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
}
