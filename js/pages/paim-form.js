// =====================================================================
// Novo / editar PAIM: nome, frequência, checklist (por área) e máquinas.
// Mudou algum item do checklist → a revisão sobe sozinha ao salvar.
// O que já foi copiado para uma OS em andamento não muda.
// =====================================================================
import { esc, icones, traduzirErro, toast } from '../ui.js';
import * as pm from '../services/paim.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { equipamentosParaEscolher } from '../plantas.js';
import { PRIORIDADE } from '../services/ordens.js';

const linhaItem = (i = {}) => `<li class="paim-item" data-id="${esc(i.id || '')}">
  <div class="paim-item-campos">
    <input class="pi-item" maxlength="200" value="${esc(i.item || '')}" placeholder="Item (ex.: Filtro de óleo hidráulico)" aria-label="Item">
    <input class="pi-como" maxlength="500" value="${esc(i.how_to || '')}" placeholder="Como verificar (ex.: verificar, limpar e trocar se necessário)" aria-label="Como verificar">
  </div>
  <span class="paim-item-acoes">
    <button type="button" class="btn btn-sm btn-texto" data-mover="-1" title="Subir" aria-label="Subir"><i data-lucide="arrow-up"></i></button>
    <button type="button" class="btn btn-sm btn-texto" data-mover="1" title="Descer" aria-label="Descer"><i data-lucide="arrow-down"></i></button>
    <button type="button" class="btn btn-sm btn-texto" data-tirar title="Tirar o item" aria-label="Tirar o item"><i data-lucide="trash-2"></i></button>
  </span></li>`;

export async function render(el, [id]) {
  const [p, its, maqs, equipamentos] = await Promise.all([
    id ? pm.ler(id) : null, id ? pm.itens(id) : [], id ? pm.maquinas(id) : [], listarEquipamentos(),
  ]);
  if (id && !p) { el.innerHTML = '<div class="alerta aviso">PAIM não encontrado. <a href="#/paim">Voltar</a></div>'; return; }
  const v = p || { priority: 'media', interval_days: null };
  const naLista = new Map(maqs.map((m) => [m.equipment_id, m]));
  const lista = equipamentosParaEscolher(equipamentos, null)
    .filter((e) => e.status !== 'desativado' || naLista.has(e.id))
    .sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR', { numeric: true }));
  const freqConhecida = pm.FREQUENCIA.some((f) => f.dias === v.interval_days);
  const voltar = id ? `#/paim/${id}` : '#/paim';

  el.innerHTML = `
    <a class="voltar" href="${voltar}"><i data-lucide="arrow-left"></i> Voltar</a>
    <div class="cabecalho-pagina"><div><h1>${id ? `Editar PAIM — ${esc(p.name)}` : 'Novo PAIM'}</h1>
      <p>${id ? `Revisão atual: ${pm.revisao(p.revision)}. Se você mudar algum item do checklist, a revisão sobe para ${pm.revisao(p.revision + 1)} ao salvar. As OS já abertas continuam com o checklist de antes.`
        : 'Um PAIM é o checklist de um tipo de máquina. Depois de salvo, cada máquina marcada recebe a sua OS na data certa.'}</p></div></div>
    <form id="f-paim" class="grade" style="gap:16px">
      <div class="card"><div class="card-corpo grade" style="gap:16px">
        <div class="grade grade-form">
          <div class="campo"><label for="pa-nome">Nome do PAIM *</label><input id="pa-nome" name="nome" required minlength="3" maxlength="120" value="${esc(v.name || '')}" placeholder="Ex.: Dobradeiras"></div>
          <div class="campo"><label for="pa-freq">Frequência</label><select id="pa-freq" name="freq">
            <option value="">A definir</option>
            ${pm.FREQUENCIA.map((f) => `<option value="${f.dias}" ${v.interval_days === f.dias ? 'selected' : ''}>${esc(f.nome)} (${f.dias} dias)</option>`).join('')}
            <option value="outra" ${v.interval_days != null && !freqConhecida ? 'selected' : ''}>Outra (em dias)</option></select>
            <span class="ajuda">De quanto em quanto tempo cada máquina faz este checklist.</span></div>
          <div class="campo ${v.interval_days != null && !freqConhecida ? '' : 'oculto'}" id="c-dias"><label for="pa-dias">A cada quantos dias? *</label>
            <input id="pa-dias" name="dias" type="number" min="1" max="3650" value="${v.interval_days != null && !freqConhecida ? v.interval_days : ''}" placeholder="Ex.: 45"></div>
          <div class="campo"><label for="pa-pri">Prioridade da OS</label><select id="pa-pri" name="pri">
            ${Object.entries(PRIORIDADE).map(([k, x]) => `<option value="${k}" ${v.priority === k ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        </div>
        <div class="campo"><label for="pa-desc">Observações</label><textarea id="pa-desc" name="desc" rows="2" maxlength="2000" placeholder="Opcional. Vai no início de cada OS (ex.: usar EPI, desligar a máquina no painel).">${esc(v.description || '')}</textarea></div>
      </div></div>

      <div class="card"><div class="card-titulo"><h3><i data-lucide="list-checks"></i> Checklist</h3><span class="small muted" id="conta-itens"></span></div>
        <div class="card-corpo grade" style="gap:18px">
          ${pm.AREAS.map((a) => `<fieldset class="paim-area" data-area="${a}"><legend><i data-lucide="${pm.AREA[a].icone}"></i> ${esc(pm.AREA[a].nome)}</legend>
            <ol class="paim-itens">${its.filter((i) => i.area === a).map(linhaItem).join('')}</ol>
            <button type="button" class="btn btn-sm" data-novo="${a}"><i data-lucide="plus"></i> Adicionar item de ${esc(pm.AREA[a].nome.toLowerCase())}</button>
          </fieldset>`).join('')}
        </div></div>

      <div class="card"><div class="card-titulo"><h3><i data-lucide="factory"></i> Máquinas deste PAIM</h3><span class="small muted" id="conta-maq"></span></div>
        <div class="card-corpo grade" style="gap:12px">
          <p class="muted small" style="margin:0">Marque as máquinas e coloque a <b>próxima data</b> de cada uma. Sem data, a máquina fica no PAIM, mas não aparece como atrasada.</p>
          <div class="linha-form paim-filtros">
            <div class="busca-wrap"><i data-lucide="search"></i><input type="search" id="busca-maq" placeholder="Buscar TAG ou nome…" aria-label="Buscar máquina"></div>
            <label class="check-linha"><input type="checkbox" id="so-marcadas"> Só as marcadas</label>
            <span class="paim-mesma-data"><input type="date" id="data-todas" aria-label="Data para todas as marcadas">
              <button type="button" class="btn btn-sm" id="btn-data-todas"><i data-lucide="calendar-check"></i> Usar esta data nas marcadas</button></span>
          </div>
          <ul class="paim-maquinas">${lista.map((e) => { const m = naLista.get(e.id); return `<li data-eq="${e.id}" data-busca="${esc(`${e.tag} ${e.name}`.toLowerCase())}" class="${m ? 'marcada' : ''}">
            <label class="check-linha"><input type="checkbox" class="pm-sel" ${m ? 'checked' : ''} ${m?.open_check_id ? 'disabled title="PAIM em andamento nesta máquina"' : ''}>
              <b>${esc(e.tag)}</b> <span class="muted">${esc(e.name)}</span></label>
            <input type="date" class="pm-data" value="${m?.next_due_date || ''}" ${m ? '' : 'disabled'} aria-label="Próxima data da ${esc(e.tag)}">
            ${m?.open_check_id ? `<span class="badge info">${esc(m.open_work_order_number)}</span>` : ''}</li>`; }).join('')}</ul>
        </div></div>

      <div id="msg-paim"></div>
      <div class="acoes"><button class="btn btn-primario" type="submit"><i data-lucide="save"></i> ${id ? 'Salvar' : 'Criar PAIM'}</button>
        <a class="btn" href="${voltar}">Cancelar</a></div>
    </form>`;

  const f = el.querySelector('form');
  const contar = () => {
    const n = el.querySelectorAll('.paim-item').length;
    el.querySelector('#conta-itens').textContent = `${n} ite${n === 1 ? 'm' : 'ns'}`;
    const m = el.querySelectorAll('.pm-sel:checked').length;
    el.querySelector('#conta-maq').textContent = `${m} marcada${m === 1 ? '' : 's'}`;
  };
  f.freq.addEventListener('change', () => {
    const outra = f.freq.value === 'outra';
    el.querySelector('#c-dias').classList.toggle('oculto', !outra);
    f.dias.required = outra;
  });
  f.dias.required = f.freq.value === 'outra';

  el.querySelectorAll('.paim-area').forEach((fs) => fs.addEventListener('click', (ev) => {
    const novo = ev.target.closest('[data-novo]');
    if (novo) {
      fs.querySelector('.paim-itens').insertAdjacentHTML('beforeend', linhaItem());
      icones(); contar();
      fs.querySelector('.paim-item:last-child .pi-item').focus();
      return;
    }
    const li = ev.target.closest('.paim-item'); if (!li) return;
    if (ev.target.closest('[data-tirar]')) { li.remove(); contar(); return; }
    const mv = ev.target.closest('[data-mover]');
    if (mv) {
      if (mv.dataset.mover === '-1' && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
      if (mv.dataset.mover === '1' && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
    }
  }));

  const ul = el.querySelector('.paim-maquinas');
  ul.addEventListener('change', (ev) => {
    const cb = ev.target.closest('.pm-sel'); if (!cb) return;
    const li = cb.closest('li');
    li.classList.toggle('marcada', cb.checked);
    li.querySelector('.pm-data').disabled = !cb.checked;
    contar();
  });
  const filtrar = () => {
    const t = el.querySelector('#busca-maq').value.trim().toLowerCase();
    const so = el.querySelector('#so-marcadas').checked;
    ul.querySelectorAll('li').forEach((li) => {
      li.classList.toggle('oculto', (t && !li.dataset.busca.includes(t)) || (so && !li.querySelector('.pm-sel').checked));
    });
  };
  el.querySelector('#busca-maq').addEventListener('input', filtrar);
  el.querySelector('#so-marcadas').addEventListener('change', filtrar);
  el.querySelector('#btn-data-todas').addEventListener('click', () => {
    const d = el.querySelector('#data-todas').value;
    if (!d) { toast('Escolha a data primeiro.', 'erro'); return; }
    ul.querySelectorAll('li').forEach((li) => { if (li.querySelector('.pm-sel').checked) li.querySelector('.pm-data').value = d; });
  });
  contar();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    const msg = el.querySelector('#msg-paim'); msg.innerHTML = '';
    try {
      const items = [];
      el.querySelectorAll('.paim-area').forEach((fs) => fs.querySelectorAll('.paim-item').forEach((li) => {
        const item = li.querySelector('.pi-item').value.trim();
        const como = li.querySelector('.pi-como').value.trim();
        if (!item && !como) return;               // linha em branco: ignora
        if (!item) throw new Error(`Há um item de ${pm.AREA[fs.dataset.area].nome.toLowerCase()} sem nome. Escreva o item ou tire a linha.`);
        items.push({ id: li.dataset.id || null, area: fs.dataset.area, item, how_to: como || null });
      }));
      if (!items.length) throw new Error('Coloque pelo menos um item no checklist.');
      const equipment = [...ul.querySelectorAll('li')].filter((li) => li.querySelector('.pm-sel').checked)
        .map((li) => ({ equipment_id: li.dataset.eq, next_due_date: li.querySelector('.pm-data').value || null }));
      const dias = f.freq.value === 'outra' ? Number(f.dias.value) : f.freq.value ? Number(f.freq.value) : null;
      const r = await pm.salvar(id, {
        name: f.nome.value.trim(), description: f.desc.value.trim() || null, interval_days: dias,
        priority: f.pri.value, items, equipment,
      });
      toast(id ? 'PAIM salvo.' : 'PAIM criado.');
      location.hash = `#/paim/${r}`;
    } catch (err) {
      msg.innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
  icones();
}
