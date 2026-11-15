// =====================================================================
// Iluminação — pontos de luz das plantas (lâmpadas), vida útil e
// histórico de trocas e manutenções.
// =====================================================================
import { pode, store } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, vazio, montarTabela, fmtData, fmtNum, numOuNulo, hojeISO } from '../ui.js';
import { plantasAtivas, variasPlantas, nomePlanta } from '../plantas.js';
import * as il from '../services/iluminacao.js';

const ABAS = { pontos: 'Pontos de luz', historico: 'Trocas e manutenções' };

export const badgeVida = (p) => {
  const v = il.VIDA[p.life_status] || il.VIDA.sem_dados;
  return `<span class="badge ${v.classe}">${esc(v.nome)}</span>`;
};

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let aba = ABAS[params.get('aba')] ? params.get('aba') : 'pontos';
  const podeCadastrar = pode('lighting.write');
  const podeRegistrar = pode('lighting.service');

  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Iluminação</h1>
      <p>Lâmpadas de cada planta, por ponto de luz. Registre trocas e manutenções; o sistema avisa quando a vida útil está vencendo.</p></div>
      <div class="acoes">${podeCadastrar ? '<button class="btn btn-primario" id="btn-novo-ponto"><i data-lucide="plus"></i> Novo ponto de luz</button>' : ''}</div></div>
    <div id="resumo-luz"></div>
    <div class="abas" role="tablist">${Object.entries(ABAS).map(([k, v]) => `<button class="aba" data-aba="${k}">${v}</button>`).join('')}</div>
    <div id="aba-luz"></div>`;

  const corpo = el.querySelector('#aba-luz');
  const pontos = await il.listar();

  // Resumo
  const ativos = pontos.filter((p) => p.active);
  const conta = (s) => ativos.filter((p) => p.life_status === s).length;
  const kpi = (icone, rot, valor, detalhe = '', classe = '') => `<div class="card kpi ${classe}"><span class="rotulo"><i data-lucide="${icone}"></i>${esc(rot)}</span>
    <span class="valor">${valor}</span>${detalhe ? `<span class="detalhe">${esc(detalhe)}</span>` : ''}</div>`;
  el.querySelector('#resumo-luz').innerHTML = pontos.length ? `<div class="grade grade-kpi">
    ${kpi('lightbulb', 'Lâmpadas instaladas', fmtNum(ativos.reduce((s, p) => s + Number(p.quantity), 0)), `${ativos.length} ponto${ativos.length === 1 ? '' : 's'} de luz`)}
    ${kpi('zap', 'Potência da iluminação', il.fmtW(ativos.reduce((s, p) => s + Number(p.total_w), 0)), 'soma de todas as lâmpadas')}
    ${kpi('triangle-alert', 'Vida útil vencida', conta('vencida'), 'pontos para trocar', conta('vencida') ? 'kpi-perigo' : '')}
    ${kpi('clock', 'Vencem em 30 dias', conta('vence_breve'), 'programe a troca', conta('vence_breve') ? 'kpi-aviso' : '')}
  </div>` : '';

  const desenharPontos = () => {
    const f = { busca: '', situacao: '', inativos: false };
    corpo.innerHTML = !pontos.length ? `<div class="card">${vazio({ icone: 'lightbulb', titulo: 'Nenhum ponto de luz cadastrado ainda',
      texto: podeCadastrar ? 'Cadastre cada ponto (ex.: um vão do galpão, um poste, uma sala) com o tipo, a potência e a quantidade de lâmpadas.' : 'Os pontos aparecem aqui assim que forem cadastrados.',
      acao: podeCadastrar ? '<button class="btn btn-primario" data-novo><i data-lucide="plus"></i> Novo ponto de luz</button>' : '' })}</div>`
      : `<div class="card card-filtros"><div class="card-corpo filtros-equip">
        <div class="campo busca-campo"><label for="il-busca">Buscar</label><input id="il-busca" type="search" placeholder="Código ou local…"></div>
        <div class="campo"><label for="il-sit">Vida útil</label><select id="il-sit"><option value="">Todas</option>
          ${Object.entries(il.VIDA).filter(([k]) => k !== 'inativo').map(([k, v]) => `<option value="${k}">${esc(v.nome)}</option>`).join('')}</select></div>
        <label class="check-linha"><input type="checkbox" id="il-inat"> Mostrar inativos</label>
      </div></div><div id="res-luz"></div>`;
    const verPlanta = variasPlantas() && !store.planta;
    const tabela = () => {
      const t = f.busca.trim().toLowerCase();
      const r = pontos.filter((p) => (f.inativos || p.active) && (!f.situacao || p.life_status === f.situacao)
        && (!t || [p.code, p.location].some((v) => String(v || '').toLowerCase().includes(t))))
        .sort((a, b) => (il.VIDA[a.life_status]?.ordem ?? 9) - (il.VIDA[b.life_status]?.ordem ?? 9) || String(a.end_of_life || '9').localeCompare(String(b.end_of_life || '9')));
      const res = corpo.querySelector('#res-luz');
      res.innerHTML = `<div class="contagem-equip">${r.length} de ${pontos.length} ponto${pontos.length === 1 ? '' : 's'}</div><div class="card" id="tab-luz"></div>`;
      montarTabela(res.querySelector('#tab-luz'), {
        linhas: r, busca: false, porPagina: 50,
        aoClicar: (id) => { location.hash = `#/iluminacao/${id}`; },
        vazioHtml: vazio({ icone: 'search-x', titulo: 'Nenhum ponto com esses filtros' }),
        colunas: [
          { titulo: 'Código', chave: 'code', primaria: true, render: (p) => `<b class="nowrap">${esc(p.code)}</b>` },
          { titulo: 'Local', chave: 'location', render: (p) => `<div>${esc(p.location)}${verPlanta ? `<div class="small muted">${esc(p.plant_name || '')}</div>` : ''}</div>` },
          { titulo: 'Lâmpadas', valor: (p) => Number(p.quantity), render: (p) => `${p.quantity} × ${esc(il.fmtW(p.power_w))}<div class="small muted">${esc(il.TIPO_LAMPADA[p.lamp_type] || p.lamp_type)}</div>` },
          { titulo: 'Potência total', valor: (p) => Number(p.total_w), render: (p) => esc(il.fmtW(p.total_w)), classe: 'num' },
          { titulo: 'Última troca', valor: (p) => p.last_replaced_at || '', render: (p) => (p.last_replaced_at ? fmtData(p.last_replaced_at) : '<span class="muted">—</span>') },
          { titulo: 'Fim da vida útil', valor: (p) => p.end_of_life || '9', render: (p) => (p.end_of_life ? fmtData(p.end_of_life) : '<span class="muted">—</span>') },
          { titulo: 'Situação', valor: (p) => il.VIDA[p.life_status]?.ordem ?? 9, render: badgeVida },
        ],
      });
      icones();
    };
    if (pontos.length) {
      corpo.querySelector('#il-busca').oninput = (ev) => { f.busca = ev.target.value; tabela(); };
      corpo.querySelector('#il-sit').onchange = (ev) => { f.situacao = ev.target.value; tabela(); };
      corpo.querySelector('#il-inat').onchange = (ev) => { f.inativos = ev.target.checked; tabela(); };
      tabela();
    }
    icones();
  };

  const desenharHistorico = async () => {
    corpo.innerHTML = '<div class="card" id="tab-hist-luz"></div>';
    const evs = await il.historicoGeral();
    montarTabela(corpo.querySelector('#tab-hist-luz'), {
      linhas: evs, porPagina: 50,
      aoClicar: (id) => { const e = evs.find((x) => x.id === id); if (e) location.hash = `#/iluminacao/${e.point_id}`; },
      vazioHtml: vazio({ icone: 'history', titulo: 'Nenhuma troca ou manutenção registrada ainda', texto: podeRegistrar ? 'Abra um ponto de luz e use "Registrar troca" ou "Registrar manutenção".' : '' }),
      colunas: [
        { titulo: 'Data', valor: (e) => e.done_at, render: (e) => fmtData(e.done_at), primaria: true },
        { titulo: 'Ponto', valor: (e) => e.point_code, render: (e) => `<b>${esc(e.point_code)}</b><div class="small muted">${esc(e.point_location || '')}</div>` },
        { titulo: 'O que foi feito', valor: (e) => e.kind, render: descEvento },
        { titulo: 'Quem registrou', valor: (e) => e.created_by_name || '', render: (e) => esc(e.created_by_name || '—') },
      ],
    });
    icones();
  };

  const abrir = (k) => {
    aba = k;
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    history.replaceState(null, '', `${location.pathname}${location.search}#/iluminacao?aba=${k}`);
    if (k === 'historico') desenharHistorico(); else desenharPontos();
  };
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) abrir(b.dataset.aba); });
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('#btn-novo-ponto, [data-novo]')) abrirPonto(null, { depois: (id) => { location.hash = `#/iluminacao/${id}`; } });
  });
  abrir(aba);
}

export function descEvento(e) {
  if (e.kind === 'manutencao') return `<span class="badge info">Manutenção</span> <span class="small">${esc(e.notes || '')}</span>`;
  const extra = [e.new_lamp_type ? `nova: ${il.TIPO_LAMPADA[e.new_lamp_type]}` : '', e.new_power_w ? il.fmtW(e.new_power_w) : ''].filter(Boolean).join(' · ');
  return `<span class="badge aviso">Troca</span> ${e.lamps_replaced} lâmpada${e.lamps_replaced === 1 ? '' : 's'} — ${esc(il.MOTIVO_TROCA[e.reason] || e.reason || '')}
    ${extra ? `<div class="small muted">${esc(extra)}</div>` : ''}${e.notes ? `<div class="small">${esc(e.notes)}</div>` : ''}`;
}

// ---------------------------------------------------------------------
// Cadastro / edição do ponto de luz (modal)
// ---------------------------------------------------------------------
export function abrirPonto(p, { depois } = {}) {
  const plantas = plantasAtivas();
  const plantaPadrao = p?.plant_id || store.planta || plantas[0]?.id || '';
  const { el, fechar } = abrirModal({
    titulo: p ? `Editar ponto ${p.code}` : 'Novo ponto de luz', largo: true,
    html: `<form id="f-luz" class="grade" style="gap:14px">
      <div class="grade grade-form">
        <div class="campo"><label for="il-cod">Código *</label><input id="il-cod" name="code" required maxlength="20" pattern="[A-Za-z0-9._/\\-]{1,20}" value="${esc(p?.code || '')}" placeholder="Ex.: ILU-LAM-01" autocomplete="off">
          <span class="ajuda">Sem espaços. Não pode repetir.</span></div>
        <div class="campo"><label for="il-pl">Planta *</label><select id="il-pl" name="plant_id" required>
          ${plantas.map((x) => `<option value="${x.id}" ${x.id === plantaPadrao ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
          ${p && !plantas.some((x) => x.id === p.plant_id) ? `<option value="${p.plant_id}" selected>${esc(nomePlanta(p.plant_id) || 'Planta inativa')}</option>` : ''}</select></div>
        <div class="campo campo-largo"><label for="il-loc">Local *</label><input id="il-loc" name="location" required minlength="2" maxlength="160" value="${esc(p?.location || '')}" placeholder="Ex.: Galpão da laminação — vão 1"></div>
        <div class="campo"><label for="il-tipo">Tipo de lâmpada *</label><select id="il-tipo" name="lamp_type">
          ${Object.entries(il.TIPO_LAMPADA).map(([k, v]) => `<option value="${k}" ${(p?.lamp_type || 'led') === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="campo"><label for="il-w">Potência de cada lâmpada (W) *</label><input id="il-w" name="power_w" required inputmode="decimal" value="${p?.power_w ?? ''}" placeholder="Ex.: 200"></div>
        <div class="campo"><label for="il-qtd">Quantidade de lâmpadas *</label><input id="il-qtd" name="quantity" type="number" min="1" max="1000" required value="${p?.quantity ?? 1}"></div>
        <div class="campo"><label for="il-vida">Vida útil (horas)</label><input id="il-vida" name="lifetime_hours" type="number" min="100" max="200000" value="${p?.lifetime_hours ?? ''}" placeholder="Ex.: 50000">
          <span class="ajuda" id="il-vida-dica"></span></div>
        <div class="campo"><label for="il-hd">Horas acesas por dia *</label><input id="il-hd" name="hours_per_day" inputmode="decimal" required value="${p?.hours_per_day ?? 12}">
          <span class="ajuda">Usado para estimar quando a vida útil acaba.</span></div>
        <div class="campo"><label for="il-ult">Última troca de todas as lâmpadas</label><input id="il-ult" name="last_replaced_at" type="date" max="${hojeISO()}" value="${p?.last_replaced_at || ''}">
          <span class="ajuda">Depois, as trocas registradas atualizam esta data.</span></div>
      </div>
      <div class="campo"><label for="il-obs">Observações</label><textarea id="il-obs" name="notes" rows="2" maxlength="1000" placeholder="Opcional. Ex.: luminária de 2 lâmpadas, acesso com plataforma">${esc(p?.notes || '')}</textarea></div>
      ${p ? `<label class="check-linha"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Ponto ativo</label>` : ''}
      <div id="msg-luz"></div></form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-luz">${p ? 'Salvar' : 'Cadastrar ponto'}</button>`,
  });
  const form = el.querySelector('form');
  const dica = () => {
    const v = il.VIDA_TIPICA[form.lamp_type.value];
    el.querySelector('#il-vida-dica').textContent = v ? `Típico para ${il.TIPO_LAMPADA[form.lamp_type.value]}: ${fmtNum(v)} h.` : '';
  };
  form.lamp_type.addEventListener('change', dica); dica();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const w = numOuNulo(form.power_w.value); const hd = numOuNulo(form.hours_per_day.value);
      if (w == null || w <= 0) throw new Error('Informe a potência de cada lâmpada em watts. Ex.: 200');
      if (hd == null || hd <= 0 || hd > 24) throw new Error('Horas acesas por dia: entre 0,5 e 24.');
      const dados = {
        code: form.code.value.trim().toUpperCase(), plant_id: form.plant_id.value, location: form.location.value.trim(), lamp_type: form.lamp_type.value,
        power_w: w, quantity: Number(form.quantity.value), lifetime_hours: form.lifetime_hours.value ? Number(form.lifetime_hours.value) : null,
        hours_per_day: hd, last_replaced_at: form.last_replaced_at.value || null, notes: form.notes.value.trim() || null,
      };
      if (p) dados.active = form.active.checked;
      const r = p ? await il.salvar(p.id, dados) : await il.criar(dados);
      toast(p ? 'Ponto alterado.' : 'Ponto de luz cadastrado.');
      fechar(); depois?.(r.id);
    } catch (err) {
      const msg = err.code === '23505' ? 'Já existe um ponto de luz com este código.' : traduzirErro(err);
      el.querySelector('#msg-luz').innerHTML = `<div class="alerta perigo">${esc(msg)}</div>`;
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Registrar troca ou manutenção (modal)
// ---------------------------------------------------------------------
export function abrirEvento(p, kind, { depois } = {}) {
  const troca = kind === 'troca';
  const { el, fechar } = abrirModal({
    titulo: `${troca ? 'Registrar troca' : 'Registrar manutenção'} — ${p.code}`,
    html: `<form id="f-ev-luz" class="grade" style="gap:14px">
      <p class="muted" style="margin:0">${esc(p.location)} · ${p.quantity} × ${esc(il.fmtW(p.power_w))} ${esc(il.TIPO_LAMPADA[p.lamp_type] || '')}</p>
      <div class="grade grade-form">
        <div class="campo"><label for="ev-data">Data *</label><input id="ev-data" name="done_at" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        ${troca ? `
        <div class="campo"><label for="ev-qtd">Lâmpadas trocadas *</label><input id="ev-qtd" name="lamps_replaced" type="number" min="1" max="${p.quantity}" required value="1">
          <span class="ajuda">O ponto tem ${p.quantity}. Trocando todas, a vida útil recomeça.</span></div>
        <div class="campo"><label for="ev-mot">Motivo *</label><select id="ev-mot" name="reason" required><option value="">Selecione…</option>
          ${Object.entries(il.MOTIVO_TROCA).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        <div class="campo"><label for="ev-tipo">Lâmpada nova é de outro tipo?</label><select id="ev-tipo" name="new_lamp_type"><option value="">Não, mesmo tipo</option>
          ${Object.entries(il.TIPO_LAMPADA).filter(([k]) => k !== p.lamp_type).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        <div class="campo"><label for="ev-w">Nova potência (W)</label><input id="ev-w" name="new_power_w" inputmode="decimal" placeholder="Só se mudou (atual: ${esc(il.fmtW(p.power_w))})"></div>` : ''}
      </div>
      <div class="campo"><label for="ev-obs">${troca ? 'Observações' : 'O que foi feito *'}</label><textarea id="ev-obs" name="notes" rows="3" maxlength="1000" ${troca ? '' : 'required minlength="5"'}
        placeholder="${troca ? 'Opcional' : 'Ex.: limpeza das luminárias e troca do reator'}"></textarea></div>
      <div id="msg-ev-luz"></div></form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-ev-luz">Registrar</button>`,
  });
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const dados = { point_id: p.id, kind, done_at: f.done_at.value, notes: f.notes.value.trim() || null };
      if (troca) {
        const nw = f.new_power_w.value.trim() ? numOuNulo(f.new_power_w.value) : null;
        if (f.new_power_w.value.trim() && (nw == null || nw <= 0)) throw new Error('Nova potência inválida. Ex.: 150');
        Object.assign(dados, { lamps_replaced: Number(f.lamps_replaced.value), reason: f.reason.value, new_lamp_type: f.new_lamp_type.value || null, new_power_w: nw });
      }
      await il.registrar(dados);
      toast(troca ? 'Troca registrada.' : 'Manutenção registrada.');
      fechar(); depois?.();
    } catch (err) {
      el.querySelector('#msg-ev-luz').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
}
