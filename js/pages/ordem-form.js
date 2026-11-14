// =====================================================================
// Abrir / editar ordem de serviço.
// Quem só solicita (técnico) abre apenas corretiva, sem responsável nem prazo.
// Status, início e conclusão NÃO são editados aqui (botões da OS).
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, textoOuNulo } from '../ui.js';
import * as os from '../services/ordens.js';
import { listarEquipamentos } from '../services/equipamentos.js';

const paraLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export async function render(el, [id]) {
  const gestor = pode('work_order.manage');
  const [o, equipamentos, resp] = await Promise.all([
    id ? os.ler(id) : null,
    listarEquipamentos(),
    gestor ? os.responsaveis() : [],
  ]);
  if (id && !o) { el.innerHTML = '<div class="alerta aviso">Ordem de serviço não encontrada.</div>'; return; }
  if (id && os.ENCERRADAS.includes(o.status)) {
    el.innerHTML = `<div class="alerta aviso">A OS ${esc(o.number)} está encerrada e não pode mais ser alterada. <a href="#/ordens/${o.id}">Voltar</a></div>`; return;
  }
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const v = o || { type: 'corretiva', priority: 'media', is_failure: null, equipment_id: params.get('equipamento') || '' };
  const equipTravado = id && !['aberta', 'aprovada'].includes(o.status);
  const ativos = equipamentos.filter((e) => e.status !== 'desativado' || e.id === v.equipment_id);
  const tipos = gestor ? Object.entries(os.TIPO_OS) : [['corretiva', 'Corretiva']];
  const voltar = id ? `#/ordens/${id}` : (params.get('equipamento') ? `#/equipamentos/${params.get('equipamento')}?aba=ordens` : '#/ordens');

  el.innerHTML = `
    <a class="voltar" href="${voltar}"><i data-lucide="arrow-left"></i> Voltar</a>
    <div class="cabecalho-pagina"><div><h1>${id ? `Editar ${esc(o.number)}` : 'Nova ordem de serviço'}</h1>
      <p>${id ? 'O andamento (aprovar, iniciar, concluir) é feito pelos botões da OS.'
        : gestor ? 'A OS recebe número automático.' : 'Descreva o problema. A manutenção vai aprovar e programar a execução.'}</p></div></div>
    <form id="f-os" class="card"><div class="card-corpo grade" style="gap:18px">
      <h3>O quê e onde</h3>
      <div class="grade grade-form">
        <div class="campo"><label for="o-equip">Equipamento *</label>
          <select id="o-equip" name="equipment_id" required ${equipTravado ? 'disabled' : ''}>
            <option value="">Selecione…</option>
            ${ativos.map((e) => `<option value="${e.id}" ${e.id === v.equipment_id ? 'selected' : ''}>${esc(e.tag)} — ${esc(e.name)}</option>`).join('')}
          </select></div>
        <div class="campo"><label for="o-tipo">Tipo *</label><select id="o-tipo" name="type" required>
          ${tipos.map(([k, t]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="campo"><label for="o-pri">Prioridade *</label><select id="o-pri" name="priority" required>
          ${Object.entries(os.PRIORIDADE).map(([k, p]) => `<option value="${k}" ${v.priority === k ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
      </div>
      <fieldset class="campo" id="campo-falha"><legend>Houve falha do equipamento? * <span class="muted small">(conta no MTBF)</span></legend>
        <label class="check-linha"><input type="radio" name="falha" value="sim" ${v.is_failure === true ? 'checked' : ''}> Sim — o equipamento quebrou ou deixou de funcionar como deveria</label>
        <label class="check-linha"><input type="radio" name="falha" value="nao" ${v.is_failure === false ? 'checked' : ''}> Não — ajuste, regulagem ou problema que não é falha</label>
      </fieldset>
      <div class="campo"><label for="o-tit">Título *</label>
        <input id="o-tit" name="title" required minlength="3" maxlength="160" value="${esc(v.title || '')}" placeholder="Ex.: Vazamento de óleo no redutor"></div>
      <div class="campo"><label for="o-desc">Descrição</label>
        <textarea id="o-desc" name="description" rows="4" maxlength="4000" placeholder="O que está acontecendo, desde quando, condições observadas…">${esc(v.description || '')}</textarea></div>
      ${gestor ? `<h3>Programação</h3>
      <div class="grade grade-form">
        <div class="campo"><label for="o-resp">Responsável pela execução</label><select id="o-resp" name="assigned_to">
          <option value="">A definir</option>
          ${resp.map((r) => `<option value="${r.id}" ${r.id === v.assigned_to ? 'selected' : ''}>${esc(r.full_name)} (${esc(r.role_name)})</option>`).join('')}</select></div>
        <div class="campo"><label for="o-ini">Início planejado</label><input id="o-ini" name="planned_start" type="datetime-local" value="${paraLocal(v.planned_start)}"></div>
        <div class="campo"><label for="o-prazo">Prazo</label><input id="o-prazo" name="due_date" type="date" value="${esc(v.due_date || '')}"></div>
      </div>` : ''}
      <div id="msg-os"></div>
      <div class="acoes"><button class="btn btn-primario" type="submit"><i data-lucide="save"></i> ${id ? 'Salvar alterações' : 'Abrir OS'}</button>
        <a class="btn" href="${voltar}">Cancelar</a></div>
    </div></form>`;

  const f = el.querySelector('form');
  const ajustarFalha = () => {
    const corretiva = f.type.value === 'corretiva';
    el.querySelector('#campo-falha').classList.toggle('oculto', !corretiva);
    f.querySelectorAll('[name=falha]').forEach((r) => { r.required = corretiva; });
  };
  f.type.addEventListener('change', ajustarFalha);
  ajustarFalha();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    const corretiva = f.type.value === 'corretiva';
    const dados = {
      type: f.type.value,
      is_failure: corretiva ? f.falha.value === 'sim' : false,
      priority: f.priority.value,
      title: f.title.value.trim(),
      description: textoOuNulo(f.description.value),
    };
    if (!equipTravado) dados.equipment_id = f.equipment_id.value;
    if (gestor) {
      dados.assigned_to = f.assigned_to.value || null;
      dados.planned_start = f.planned_start.value ? new Date(f.planned_start.value).toISOString() : null;
      dados.due_date = f.due_date.value || null;
    }
    try {
      const r = id ? await os.salvar(id, dados) : await os.criar(dados);
      toast(id ? 'OS atualizada.' : 'OS aberta.');
      location.hash = `#/ordens/${r.id}`;
    } catch (err) {
      el.querySelector('#msg-os').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
  icones();
}
