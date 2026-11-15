// =====================================================================
// Registrar inspeção preditiva (pensado para o celular, na ronda):
// escolhe o equipamento e a técnica, preenche o valor de cada ponto
// (a cor aparece na hora) e, se precisar, medições avulsas.
// =====================================================================
import { esc, icones, toast, traduzirErro, numOuNulo, idDaUrl } from '../ui.js';
import * as pd from '../services/preditiva.js';
import { listarEquipamentos } from '../services/equipamentos.js';
import { equipamentosParaEscolher } from '../plantas.js';
import { agoraLocal, localParaISO } from '../services/horimetros.js';
import { badgeResultado } from './preditiva.js';

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const equipamentos = equipamentosParaEscolher(await listarEquipamentos(), idDaUrl(params.get('equipamento'))).filter((e) => e.status !== 'desativado');
  const voltar = idDaUrl(params.get('equipamento')) ? `#/equipamentos/${idDaUrl(params.get('equipamento'))}?aba=preditiva` : '#/preditiva';
  let pontos = [];
  let avulsas = 0;

  el.innerHTML = `
    <a class="voltar" href="${voltar}"><i data-lucide="arrow-left"></i> Voltar</a>
    <div class="cabecalho-pagina"><div><h1>Registrar inspeção</h1>
      <p>Preencha só os pontos medidos. O sistema classifica cada valor pelos limites cadastrados.</p></div></div>
    <form id="f-insp" class="card"><div class="card-corpo grade" style="gap:18px">
      <div class="grade grade-form">
        <div class="campo"><label for="in-eq">Equipamento *</label><select id="in-eq" name="equip" required>
          <option value="">Selecione…</option>
          ${equipamentos.map((e) => `<option value="${e.id}" ${e.id === idDaUrl(params.get('equipamento')) ? 'selected' : ''}>${esc(e.tag)} — ${esc(e.name)}</option>`).join('')}</select></div>
        <div class="campo"><label for="in-tec">Técnica *</label><select id="in-tec" name="tec" required>
          ${Object.entries(pd.TECNICA).map(([k, t]) => `<option value="${k}" ${params.get('tecnica') === k ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="in-quando">Data e hora *</label><input id="in-quando" name="quando" type="datetime-local" required value="${agoraLocal()}" max="${agoraLocal()}"></div>
      </div>
      <div id="lista-pontos"></div>
      <div id="lista-avulsas" class="grade" style="gap:12px"></div>
      <div><button class="btn btn-sm" type="button" id="btn-avulsa"><i data-lucide="plus"></i> Medição avulsa (ponto não cadastrado)</button></div>
      <div class="grade grade-form">
        <div class="campo"><label for="in-res">Resultado</label><select id="in-res" name="res">
          <option value="">Pelas medições</option><option value="alerta">Alerta (achei algo anormal)</option><option value="critico">Crítico (achei algo grave)</option></select>
          <span class="ajuda">Você pode agravar o resultado (ex.: ruído, vazamento), nunca aliviar o que foi medido.</span></div>
      </div>
      <div class="campo"><label for="in-obs">Observações</label><textarea id="in-obs" name="obs" rows="3" maxlength="4000" placeholder="O que foi observado. Obrigatório se não houver medição (inspeção visual)."></textarea></div>
      <div class="resumo-insp" id="resumo-insp"></div>
      <div id="msg-insp"></div>
      <div class="acoes"><button class="btn btn-primario" type="submit"><i data-lucide="save"></i> Salvar inspeção</button>
        <a class="btn" href="${voltar}">Cancelar</a></div>
    </div></form>`;

  const f = el.querySelector('form');
  const listaP = el.querySelector('#lista-pontos');

  const resumo = () => {
    const sts = [...el.querySelectorAll('[data-status]')].map((x) => x.dataset.status).filter(Boolean);
    const pior = ['critico', 'alerta'].find((k) => sts.includes(k) || f.res.value === k) || (sts.length ? 'normal' : null);
    el.querySelector('#resumo-insp').innerHTML = pior ? `Resultado: ${badgeResultado(pior)} <span class="muted small">${sts.length} ${sts.length === 1 ? "medição" : "medições"} preenchida${sts.length === 1 ? '' : 's'}</span>` : '';
  };
  const marcar = (alvo, valor, al, cr, sentido) => {
    const st = pd.classificar(numOuNulo(valor), al, cr, sentido);
    alvo.dataset.status = st || '';
    alvo.innerHTML = st ? badgeResultado(st) : '';
    resumo();
  };

  const carregarPontos = async () => {
    avulsas = 0; el.querySelector('#lista-avulsas').innerHTML = '';
    if (!f.equip.value) { listaP.innerHTML = '<p class="muted">Escolha o equipamento para ver os pontos de medição.</p>'; resumo(); return; }
    const todos = (await pd.pontosDoEquipamento(f.equip.value)).filter((p) => p.active);
    if (!params.get('tecnica') && todos.length && !todos.some((p) => p.technique === f.tec.value)) {
      // abre direto na técnica que tem pontos (a mais comum neste equipamento)
      const cont = {}; todos.forEach((p) => { cont[p.technique] = (cont[p.technique] || 0) + 1; });
      f.tec.value = Object.entries(cont).sort((a, b) => b[1] - a[1])[0][0];
    }
    pontos = todos.filter((p) => p.technique === f.tec.value);
    listaP.innerHTML = pontos.length ? `<div class="lista-medicoes">${pontos.map((p) => `
      <div class="medicao" data-ponto="${p.id}">
        <div class="medicao-info"><b>${esc(p.name)}</b><span class="small muted">${esc(p.variable)} · ${esc(pd.textoLimites(p))}</span>
          ${p.last_value != null ? `<span class="small muted">última: ${pd.fmtMedida(p.last_value)} ${esc(p.unit)} em ${new Date(p.last_at).toLocaleDateString('pt-BR')}</span>` : ''}</div>
        <div class="medicao-valor"><input inputmode="decimal" aria-label="${esc(`${p.name} — ${p.variable} (${p.unit})`)}" placeholder="—"><span class="unidade">${esc(p.unit)}</span></div>
        <div class="medicao-st" data-status=""></div>
      </div>`).join('')}</div>`
      : `<div class="alerta info"><i data-lucide="info"></i><div>Nenhum ponto de ${esc(pd.TECNICA[f.tec.value].nome.toLowerCase())} cadastrado neste equipamento.
          Use uma medição avulsa ou só as observações.${todos.length ? ` Este equipamento tem pontos de: ${[...new Set(todos.map((p) => pd.TECNICA[p.technique].nome))].join(', ')}.` : ''}</div></div>`;
    listaP.querySelectorAll('.medicao').forEach((linha) => {
      const p = pontos.find((x) => x.id === linha.dataset.ponto);
      linha.querySelector('input').addEventListener('input', (ev) => marcar(linha.querySelector('.medicao-st'), ev.target.value, p.alert_limit, p.critical_limit, p.direction));
    });
    resumo(); icones();
  };

  el.querySelector('#btn-avulsa').addEventListener('click', () => {
    avulsas += 1;
    const n = avulsas;
    const div = document.createElement('div');
    div.className = 'card avulsa'; div.dataset.avulsa = n;
    div.innerHTML = `<div class="card-corpo grade" style="gap:10px">
      <div class="acoes" style="justify-content:space-between;align-items:center"><b>Medição avulsa</b>
        <button class="btn btn-sm btn-texto" type="button" data-remover aria-label="Remover medição avulsa"><i data-lucide="x"></i></button></div>
      <div class="grade grade-form">
        <div class="campo"><label>Ponto *</label><input data-c="ponto_nome" maxlength="120" placeholder="Ex.: Redutor entrada"></div>
        <div class="campo"><label>O que é medido *</label><input data-c="variavel" maxlength="80" placeholder="Ex.: Aceleração"></div>
        <div class="campo"><label>Unidade *</label><input data-c="unidade" maxlength="20" placeholder="Ex.: g"></div>
        <div class="campo"><label>Valor *</label><input data-c="valor" inputmode="decimal"></div>
        <div class="campo"><label>Limite de alerta</label><input data-c="alerta" inputmode="decimal"></div>
        <div class="campo"><label>Limite crítico</label><input data-c="critico" inputmode="decimal"></div>
      </div>
      <label class="check-linha"><input type="checkbox" data-c="abaixo"> Abaixo do limite é ruim (viscosidade, pressão)</label>
      <div class="medicao-st" data-status=""></div></div>`;
    el.querySelector('#lista-avulsas').appendChild(div);
    const ler = (c) => div.querySelector(`[data-c=${c}]`);
    const atualizar = () => marcar(div.querySelector('.medicao-st'), ler('valor').value, numOuNulo(ler('alerta').value), numOuNulo(ler('critico').value), ler('abaixo').checked ? 'abaixo' : 'acima');
    div.addEventListener('input', atualizar);
    div.querySelector('[data-remover]').addEventListener('click', () => { div.remove(); resumo(); });
    icones(); ler('ponto_nome').focus();
  });

  f.equip.addEventListener('change', () => { params.delete('tecnica'); carregarPontos(); });
  f.tec.addEventListener('change', () => { params.set('tecnica', f.tec.value); carregarPontos(); });
  f.res.addEventListener('change', resumo);

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = el.querySelector('#msg-insp');
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const medicoes = [];
      listaP.querySelectorAll('.medicao').forEach((linha) => {
        const txt = linha.querySelector('input').value.trim();
        if (!txt) return;
        const v = numOuNulo(txt);
        if (v == null) throw new Error(`Valor inválido em "${pontos.find((p) => p.id === linha.dataset.ponto).name}".`);
        medicoes.push({ ponto: linha.dataset.ponto, valor: v });
      });
      el.querySelectorAll('[data-avulsa]').forEach((div) => {
        const ler = (c) => div.querySelector(`[data-c=${c}]`).value.trim();
        const v = numOuNulo(ler('valor'));
        if (v == null) throw new Error('Informe o valor da medição avulsa (ou remova-a).');
        medicoes.push({ ponto_nome: ler('ponto_nome'), variavel: ler('variavel'), unidade: ler('unidade'), valor: v,
          alerta: numOuNulo(ler('alerta')), critico: numOuNulo(ler('critico')), sentido: div.querySelector('[data-c=abaixo]').checked ? 'abaixo' : 'acima' });
      });
      const id = await pd.registrar({ equipamento: f.equip.value, tipo: f.tec.value, quando: localParaISO(f.quando.value),
        resultado: f.res.value, observacoes: f.obs.value.trim(), medicoes });
      toast('Inspeção registrada.');
      location.hash = `#/preditiva/inspecoes/${id}`;
    } catch (err) {
      msg.innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });

  await carregarPontos();
  icones();
}
