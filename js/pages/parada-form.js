// =====================================================================
// Registrar parada (em aberto agora, ou já encerrada lançada depois).
// =====================================================================
import { esc, icones, toast, traduzirErro, textoOuNulo, idDaUrl } from '../ui.js';
import { pode } from '../store.js';
import * as pr from '../services/paradas.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { equipamentosParaEscolher } from '../plantas.js';
import { listarDoEquipamento as osDoEquipamento, ler as lerOS, criar as criarOS, responsaveis, PRIORIDADE, TIPO_OS } from '../services/ordens.js';

const NOVA_OS = 'nova';

const paraLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const agoraLocal = () => { const d = new Date(); d.setSeconds(0, 0); return paraLocal(d); };

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const osParam = idDaUrl(params.get('os'));
  const podeCriarOS = !osParam && (pode('work_order.manage') || pode('work_order.request'));
  const gestor = pode('work_order.manage');
  const [equipamentos, motivos, osOrigem, resp] = await Promise.all([listarEquipamentos(), pr.motivos(), osParam ? lerOS(osParam) : null,
    podeCriarOS && gestor ? responsaveis().catch(() => []) : []]);
  const tipos = gestor ? Object.entries(TIPO_OS) : [['corretiva', 'Corretiva']];
  const eqInicial = osOrigem?.equipment_id || idDaUrl(params.get('equipamento')) || '';
  const ativos = equipamentosParaEscolher(equipamentos, eqInicial).filter((e) => e.status !== 'desativado');
  const voltar = osOrigem ? `#/ordens/${osOrigem.id}` : eqInicial ? `#/equipamentos/${eqInicial}?aba=paradas` : '#/paradas';

  el.innerHTML = `
    <a class="voltar" href="${voltar}"><i data-lucide="arrow-left"></i> Voltar</a>
    <div class="cabecalho-pagina"><div><h1>Registrar parada</h1>
      <p>O status do equipamento muda sozinho: <b>parado</b> ou <b>em manutenção</b> (na fase de reparo). Ele só volta a <b>operando</b> quando alguém confirmar o retorno.</p></div></div>
    <form id="f-parada" class="card"><div class="card-corpo grade" style="gap:18px">
      <div class="grade grade-form">
        <div class="campo"><label for="p-equip">Equipamento *</label><select id="p-equip" name="equip" required ${osOrigem ? 'disabled' : ''}>
          <option value="">Selecione…</option>
          ${ativos.map((e) => `<option value="${e.id}" ${e.id === eqInicial ? 'selected' : ''}>${esc(e.tag)} — ${esc(e.name)}</option>`).join('')}</select></div>
        <div class="campo"><label for="p-mot">Motivo *</label><select id="p-mot" name="motivo" required>
          <option value="">Selecione…</option>
          ${Object.entries(pr.CATEGORIA).map(([cat, nomeCat]) => {
            const ms = motivos.filter((m) => m.active && m.category === cat);
            return ms.length ? `<optgroup label="${esc(nomeCat)}">${ms.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</optgroup>` : '';
          }).join('')}</select></div>
        <div class="campo"><label for="p-tipo">Tipo *</label><select id="p-tipo" name="tipo">
          ${Object.entries(pr.TIPO_PARADA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="campo"><label for="p-ini">Início da parada *</label><input id="p-ini" name="ini" type="datetime-local" required value="${agoraLocal()}" max="${agoraLocal()}"></div>
        <div class="campo"><label for="p-os">Ordem de serviço ligada</label><select id="p-os" name="os"><option value="">Nenhuma</option></select></div>
      </div>
      ${podeCriarOS ? `<fieldset class="bloco-nova-os oculto" id="bloco-nova-os"><legend><i data-lucide="clipboard-plus"></i> Nova ordem de serviço</legend>
        <p class="muted small" style="margin:0 0 12px">A OS é aberta junto com a parada, para o mesmo equipamento, e fica ligada a ela.${gestor ? '' : ' A manutenção vai aprovar e programar a execução.'}</p>
        <div class="grade grade-form">
          <div class="campo"><label for="n-tipo">Tipo *</label><select id="n-tipo" name="n_tipo">
            ${tipos.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          <div class="campo"><label for="n-pri">Prioridade *</label><select id="n-pri" name="n_pri">
            ${Object.entries(PRIORIDADE).map(([k, p]) => `<option value="${k}" ${k === 'alta' ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
        </div>
        <fieldset class="campo" id="n-campo-falha"><legend>Houve falha do equipamento? * <span class="muted small">(conta no MTBF)</span></legend>
          <label class="check-linha"><input type="radio" name="n_falha" value="sim"> Sim — o equipamento quebrou ou deixou de funcionar como deveria</label>
          <label class="check-linha"><input type="radio" name="n_falha" value="nao"> Não — ajuste, regulagem ou problema que não é falha</label>
        </fieldset>
        <div class="campo"><label for="n-tit">Título da OS *</label><input id="n-tit" name="n_tit" minlength="3" maxlength="160" placeholder="Ex.: Vazamento de óleo no redutor"></div>
        <div class="campo"><label for="n-desc">Descrição do problema</label><textarea id="n-desc" name="n_desc" rows="3" maxlength="4000" placeholder="O que está acontecendo, desde quando, condições observadas…"></textarea></div>
        ${gestor ? `<div class="grade grade-form">
          <div class="campo"><label for="n-resp">Responsável pela execução</label><select id="n-resp" name="n_resp"><option value="">A definir</option>
            ${resp.map((r) => `<option value="${r.id}">${esc(r.full_name)} (${esc(r.role_name)})</option>`).join('')}</select></div>
          <div class="campo"><label for="n-prazo">Prazo</label><input id="n-prazo" name="n_prazo" type="date"></div>
        </div>` : ''}
      </fieldset>` : ''}
      <label class="check-linha"><input type="checkbox" name="terminou" id="p-terminou"> A parada já terminou (estou lançando depois)</label>
      <div class="grade grade-form" id="bloco-aberta">
        <div class="campo"><label for="p-fase">Situação agora</label><select id="p-fase" name="fase">
          <option value="">Ainda não sei / sem fase</option>
          ${Object.entries(pr.FASE).map(([k, v]) => `<option value="${k}">${v.nome}</option>`).join('')}</select>
          <span class="ajuda">Separar reparo de espera é o que permite calcular o MTTR.</span></div>
      </div>
      <div class="grade grade-form oculto" id="bloco-fim">
        <div class="campo"><label for="p-fim">Retorno à operação *</label><input id="p-fim" name="fim" type="datetime-local" max="${agoraLocal()}"></div>
      </div>
      <div class="campo"><label for="p-imp">Impacto na produção</label><input id="p-imp" name="impacto" maxlength="500" placeholder="Ex.: linha 2 parada; 12 t de bobina deixaram de ser produzidas"></div>
      <div class="campo"><label for="p-obs">Observações</label><textarea id="p-obs" name="obs" rows="3" maxlength="2000"></textarea></div>
      <div id="msg-parada"></div>
      <div class="acoes"><button class="btn btn-primario" type="submit"><i data-lucide="save"></i> Registrar parada</button>
        <a class="btn" href="${voltar}">Cancelar</a></div>
    </div></form>`;

  const f = el.querySelector('form');
  const carregarOS = async () => {
    const id = f.equip.value;
    const sel = f.os;
    const antes = sel.value;
    const opNova = podeCriarOS ? `<option value="${NOVA_OS}">+ Criar nova OS</option>` : '';
    if (!id) { sel.innerHTML = `<option value="">Nenhuma</option>${opNova}`; sel.value = antes === NOVA_OS ? NOVA_OS : ''; mostrarNovaOS(); return; }
    try {
      const lista = (await osDoEquipamento(id)).filter((o) => o.status !== 'cancelada').slice(0, 30);
      sel.innerHTML = `<option value="">Nenhuma</option>${opNova}${lista.length ? `<optgroup label="OS deste equipamento">${lista.map((o) => `<option value="${o.id}" ${o.id === osParam ? 'selected' : ''}>${esc(o.number)} — ${esc(o.title)}</option>`).join('')}</optgroup>` : ''}`;
    } catch { sel.innerHTML = `<option value="">Nenhuma</option>${opNova}`; }
    if (antes === NOVA_OS) sel.value = NOVA_OS;
    mostrarNovaOS();
  };
  // Campos da nova OS aparecem só com "+ Criar nova OS"
  const bloco = el.querySelector('#bloco-nova-os');
  let tituloMexido = false;
  const ajustarFalha = () => {
    if (!bloco) return;
    const corretiva = f.n_tipo.value === 'corretiva';
    el.querySelector('#n-campo-falha').classList.toggle('oculto', !corretiva);
    f.querySelectorAll('[name=n_falha]').forEach((r) => { r.required = corretiva && f.os.value === NOVA_OS; });
  };
  const sugerir = () => {   // título e "houve falha?" a partir do motivo da parada
    if (!bloco) return;
    const m = motivos.find((x) => x.id === f.motivo.value);
    if (m && !tituloMexido) f.n_tit.value = `Parada: ${m.name}`;
    if (m && !f.querySelector('[name=n_falha]:checked')) {
      const r = f.querySelector(`[name=n_falha][value=${m.category === 'falha' ? 'sim' : 'nao'}]`); if (r) r.checked = true;
    }
  };
  function mostrarNovaOS() {
    if (!bloco) return;
    const nova = f.os.value === NOVA_OS;
    bloco.classList.toggle('oculto', !nova);
    f.n_tit.required = nova;
    ajustarFalha();
    if (nova) sugerir();
  }
  if (bloco) {
    f.os.addEventListener('change', mostrarNovaOS);
    f.n_tipo.addEventListener('change', ajustarFalha);
    f.motivo.addEventListener('change', sugerir);
    f.n_tit.addEventListener('input', () => { tituloMexido = true; });
  }
  f.equip.addEventListener('change', carregarOS);
  f.terminou.addEventListener('change', () => {
    const t = f.terminou.checked;
    el.querySelector('#bloco-fim').classList.toggle('oculto', !t);
    el.querySelector('#bloco-aberta').classList.toggle('oculto', t);
    f.fim.required = t;
  });
  await carregarOS();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    const msg = el.querySelector('#msg-parada');
    try {
      const ini = new Date(f.ini.value);
      const fim = f.terminou.checked ? new Date(f.fim.value) : null;
      if (fim && !(fim > ini)) throw new Error('O retorno precisa ser depois do início.');
      const r = await pr.registrar({
        equipment_id: f.equip.value, reason_id: f.motivo.value, type: f.tipo.value,
        started_at: ini.toISOString(), ended_at: fim ? fim.toISOString() : null,
        work_order_id: f.os.value && f.os.value !== NOVA_OS ? f.os.value : null,
        production_impact: textoOuNulo(f.impacto.value), notes: textoOuNulo(f.obs.value),
      });
      if (!fim && f.fase.value) {
        try { await pr.mudarFase(r.id, f.fase.value, ini.toISOString()); } catch (err) { toast(`Parada registrada, mas a fase não foi salva: ${traduzirErro(err)}`, 'erro'); }
      }
      let osNova = null;
      if (f.os.value === NOVA_OS) {
        // a parada já está salva; a OS é aberta em seguida e ligada a ela
        try {
          const corretiva = f.n_tipo.value === 'corretiva';
          const dadosOS = {
            equipment_id: f.equip.value, type: f.n_tipo.value, priority: f.n_pri.value,
            is_failure: corretiva ? f.querySelector('[name=n_falha]:checked')?.value === 'sim' : false,
            title: f.n_tit.value.trim(), description: textoOuNulo(f.n_desc.value),
          };
          if (gestor) { dadosOS.assigned_to = f.n_resp.value || null; dadosOS.due_date = f.n_prazo.value || null; }
          osNova = await criarOS(dadosOS);
          await pr.salvarDados(r.id, { work_order_id: osNova.id });
        } catch (err) {
          toast(`Parada registrada, mas a OS não foi ${osNova ? 'ligada' : 'aberta'}: ${traduzirErro(err)}`, 'erro');
        }
      }
      toast(fim ? 'Parada lançada.' : 'Parada registrada. O equipamento foi marcado como parado.');
      if (osNova) toast('OS aberta e ligada à parada.');
      location.hash = `#/paradas/${r.id}`;
    } catch (err) {
      msg.innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
  icones();
}
