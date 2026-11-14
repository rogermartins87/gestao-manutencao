// =====================================================================
// Novo / editar plano preventivo.
// O 1º vencimento só é informado na criação; depois a agenda segue sozinha.
// =====================================================================
import { esc, icones, traduzirErro, toast, numOuNulo, fmtNum, hojeISO, addDias } from '../ui.js';
import * as pv from '../services/preventiva.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { responsaveis, PRIORIDADE } from '../services/ordens.js';

export async function render(el, [id]) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const [p, equipamentos, pessoas] = await Promise.all([
    id ? pv.lerPlano(id) : null, listarEquipamentos(), responsaveis().catch(() => []),
  ]);
  if (id && !p) { el.innerHTML = '<div class="alerta aviso">Plano não encontrado. <a href="#/preventiva?aba=planos">Voltar</a></div>'; return; }
  const v = p || { trigger: 'calendario', tolerance_days: 3, tolerance_hours: 0, priority: 'media', equipment_id: params.get('equipamento') || '' };
  const ativos = equipamentos.filter((e) => e.status !== 'desativado' || e.id === v.equipment_id);
  const voltar = id ? `#/preventiva/planos/${id}` : params.get('equipamento') ? `#/equipamentos/${params.get('equipamento')}?aba=preventiva` : '#/preventiva?aba=planos';
  const num = (x) => (x == null ? '' : String(Number(x)).replace('.', ','));

  el.innerHTML = `
    <a class="voltar" href="${voltar}"><i data-lucide="arrow-left"></i> Voltar</a>
    <div class="cabecalho-pagina"><div><h1>${id ? `Editar plano — ${esc(p.name)}` : 'Novo plano preventivo'}</h1>
      <p>${id ? 'Mudanças no intervalo valem a partir do próximo agendamento. Para mudar o vencimento já agendado, use "Reprogramar" na ficha do plano.'
        : 'Depois de salvar, cadastre as tarefas (o checklist que vai em cada OS).'}</p></div></div>
    <form id="f-plano" class="card"><div class="card-corpo grade" style="gap:18px">
      <div class="grade grade-form">
        <div class="campo"><label for="pl-eq">Equipamento *</label><select id="pl-eq" name="equip" required ${id ? 'disabled' : ''}>
          <option value="">Selecione…</option>
          ${ativos.map((e) => `<option value="${e.id}" data-hm="${e.has_hour_meter ? '1' : ''}" data-atual="${e.current_hour_meter ?? ''}" ${e.id === v.equipment_id ? 'selected' : ''}>${esc(e.tag)} — ${esc(e.name)}</option>`).join('')}</select></div>
        <div class="campo"><label for="pl-nome">Nome do plano *</label><input id="pl-nome" name="nome" required minlength="3" maxlength="160" value="${esc(v.name || '')}" placeholder="Ex.: Lubrificação geral"></div>
      </div>
      <fieldset class="campo"><legend>Quando fazer *</legend>
        ${Object.entries(pv.GATILHO).map(([k, g]) => `<label class="check-linha"><input type="radio" name="gatilho" value="${k}" ${v.trigger === k ? 'checked' : ''} ${id ? 'disabled' : ''}> ${esc(g.nome)}</label>`).join('')}
        ${id ? '<span class="ajuda">O tipo não muda depois de criado. Para trocar, desative este plano e crie outro.</span>' : '<span class="ajuda" id="aviso-hm"></span>'}
      </fieldset>
      <div class="grade grade-form">
        <div class="campo" id="c-dias"><label for="pl-dias">A cada (dias) *</label><input id="pl-dias" name="dias" type="number" min="1" max="3650" value="${v.interval_days ?? ''}" placeholder="Ex.: 30"></div>
        <div class="campo" id="c-horas"><label for="pl-horas">A cada (horas de horímetro) *</label><input id="pl-horas" name="horas" inputmode="decimal" value="${num(v.interval_hours)}" placeholder="Ex.: 500"></div>
        ${id ? '' : `<div class="campo" id="c-1data"><label for="pl-1data">1º vencimento (data)</label><input id="pl-1data" name="data1" type="date">
          <span class="ajuda">Se ficar em branco: hoje + intervalo.</span></div>
        <div class="campo" id="c-1hm"><label for="pl-1hm">1º vencimento (horímetro)</label><input id="pl-1hm" name="hm1" inputmode="decimal">
          <span class="ajuda" id="aj-1hm">Se ficar em branco: horímetro atual + intervalo.</span></div>`}
        <div class="campo" id="c-tdias"><label for="pl-tdias">Tolerância (dias)</label><input id="pl-tdias" name="tdias" type="number" min="0" max="90" value="${v.tolerance_days ?? 3}">
          <span class="ajuda">Ainda conta como no prazo.</span></div>
        <div class="campo" id="c-thoras"><label for="pl-thoras">Tolerância (horas)</label><input id="pl-thoras" name="thoras" inputmode="decimal" value="${num(v.tolerance_hours ?? 0)}"></div>
      </div>
      <div class="grade grade-form">
        <div class="campo"><label for="pl-pri">Prioridade da OS</label><select id="pl-pri" name="pri">
          ${Object.entries(PRIORIDADE).map(([k, x]) => `<option value="${k}" ${v.priority === k ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="pl-resp">Responsável padrão</label><select id="pl-resp" name="resp"><option value="">A definir na OS</option>
          ${pessoas.map((x) => `<option value="${x.id}" ${x.id === v.default_assignee ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('')}</select></div>
      </div>
      <div class="campo"><label for="pl-desc">Descrição / instruções</label><textarea id="pl-desc" name="desc" rows="3" maxlength="4000" placeholder="Opcional. Vai no início da descrição de cada OS.">${esc(v.description || '')}</textarea></div>
      <div id="msg-plano"></div>
      <div class="acoes"><button class="btn btn-primario" type="submit"><i data-lucide="save"></i> ${id ? 'Salvar' : 'Criar plano'}</button>
        <a class="btn" href="${voltar}">Cancelar</a></div>
    </div></form>`;

  const f = el.querySelector('form');
  const mostrar = (sel, sim) => el.querySelector(sel)?.classList.toggle('oculto', !sim);
  const ajustar = () => {
    const g = id ? p.trigger : f.gatilho.value;
    const dias = g !== 'horimetro'; const horas = g !== 'calendario';
    mostrar('#c-dias', dias); mostrar('#c-1data', dias); mostrar('#c-tdias', dias);
    mostrar('#c-horas', horas); mostrar('#c-1hm', horas); mostrar('#c-thoras', horas);
    f.dias.required = dias; f.horas.required = horas;
    if (!id) {
      const op = f.equip.selectedOptions[0];
      const temHm = op?.dataset.hm === '1';
      el.querySelector('#aviso-hm').textContent = op?.value && !temHm ? 'Este equipamento não tem horímetro: só o plano por calendário é possível.' : '';
      f.querySelectorAll('[name=gatilho]').forEach((r) => { if (r.value !== 'calendario') r.disabled = !!op?.value && !temHm; });
      if (op?.value && !temHm && g !== 'calendario') { f.gatilho.value = 'calendario'; ajustar(); return; }
      const atual = op?.dataset.atual;
      el.querySelector('#aj-1hm').textContent = atual ? `Se ficar em branco: ${fmtNum(atual, 1)} h (atual) + intervalo.` : 'Se ficar em branco: horímetro atual + intervalo.';
      f.data1.min = addDias(hojeISO(), -365);
    }
  };
  f.addEventListener('change', ajustar);
  ajustar();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const g = id ? p.trigger : f.gatilho.value;
      const dias = g !== 'horimetro'; const horas = g !== 'calendario';
      const ih = horas ? numOuNulo(f.horas.value) : null;
      if (horas && (ih == null || ih <= 0)) throw new Error('Informe o intervalo em horas.');
      const th = horas ? numOuNulo(f.thoras.value) ?? 0 : 0;
      const dados = {
        name: f.nome.value.trim(), description: f.desc.value.trim() || null,
        interval_days: dias ? Number(f.dias.value) : null, interval_hours: ih,
        tolerance_days: dias ? Number(f.tdias.value || 0) : 0, tolerance_hours: th,
        priority: f.pri.value, default_assignee: f.resp.value || null,
      };
      let r;
      if (id) r = await pv.salvarPlano(id, dados);
      else {
        const hm1 = horas ? numOuNulo(f.hm1.value) : null;
        r = await pv.criarPlano({ ...dados, equipment_id: f.equip.value, trigger: g,
          first_due_date: dias && f.data1.value ? f.data1.value : null, first_due_hour_meter: hm1 });
      }
      toast(id ? 'Plano alterado.' : 'Plano criado. Agora cadastre as tarefas.');
      location.hash = `#/preventiva/planos/${r.id}`;
    } catch (err) {
      el.querySelector('#msg-plano').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
  icones();
}
