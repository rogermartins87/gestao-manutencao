// =====================================================================
// Registrar parada (em aberto agora, ou já encerrada lançada depois).
// =====================================================================
import { esc, icones, toast, traduzirErro, textoOuNulo } from '../ui.js';
import * as pr from '../services/paradas.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { listarDoEquipamento as osDoEquipamento, ler as lerOS } from '../services/ordens.js';

const paraLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const agoraLocal = () => { const d = new Date(); d.setSeconds(0, 0); return paraLocal(d); };

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const osParam = params.get('os');
  const [equipamentos, motivos, osOrigem] = await Promise.all([listarEquipamentos(), pr.motivos(), osParam ? lerOS(osParam) : null]);
  const eqInicial = osOrigem?.equipment_id || params.get('equipamento') || '';
  const ativos = equipamentos.filter((e) => e.status !== 'desativado');
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
    if (!id) { sel.innerHTML = '<option value="">Nenhuma</option>'; return; }
    try {
      const lista = (await osDoEquipamento(id)).filter((o) => o.status !== 'cancelada').slice(0, 30);
      sel.innerHTML = `<option value="">Nenhuma</option>${lista.map((o) => `<option value="${o.id}" ${o.id === osParam ? 'selected' : ''}>${esc(o.number)} — ${esc(o.title)}</option>`).join('')}`;
    } catch { sel.innerHTML = '<option value="">Nenhuma</option>'; }
  };
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
        work_order_id: f.os.value || null,
        production_impact: textoOuNulo(f.impacto.value), notes: textoOuNulo(f.obs.value),
      });
      if (!fim && f.fase.value) {
        try { await pr.mudarFase(r.id, f.fase.value, ini.toISOString()); } catch (err) { toast(`Parada registrada, mas a fase não foi salva: ${traduzirErro(err)}`, 'erro'); }
      }
      toast(fim ? 'Parada lançada.' : 'Parada registrada. O equipamento foi marcado como parado.');
      location.hash = `#/paradas/${r.id}`;
    } catch (err) {
      msg.innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
  icones();
}
