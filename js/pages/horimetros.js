// =====================================================================
// Horímetros — ronda de leituras: todos os equipamentos com horímetro,
// situação (em dia / atrasada / sem leitura) e lançamento rápido linha a linha.
// Também exporta o formulário de leitura e o gráfico usados na ficha.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, vazio, fmtNum, fmtDataHora, comprimirImagem } from '../ui.js';
import * as hm from '../services/horimetros.js';
import { badgeStatus } from './equipamentos.js';

export const badgeSituacao = (s) => {
  const x = hm.SITUACAO[s];
  return x ? `<span class="badge ${x.classe}">${esc(x.curto)}</span>` : '';
};
export const fmtH = (v) => (v == null ? '—' : `${fmtNum(v, 1)} h`);
const diasTxt = (d) => (d == null ? '' : d === 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`);

export async function render(el) {
  const lista = await hm.situacao();
  const podeLancar = pode('hour_meter.write');
  const f = { busca: '', setor: '', situacao: new URLSearchParams(location.hash.split('?')[1] || '').get('situacao') || '' };
  const setores = [...new Set(lista.map((e) => e.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Horímetros</h1>
      <p>${podeLancar ? 'Ronda de leituras: digite o valor do mostrador de cada máquina e tecle Enter.' : 'Situação das leituras de horímetro de cada equipamento.'}</p></div></div>
    <div class="faixa-status" id="faixa-hm"></div>
    <div class="card card-filtros"><div class="card-corpo filtros-equip">
      <div class="campo busca-campo"><label for="h-busca">Buscar</label><input id="h-busca" type="search" placeholder="TAG ou nome"></div>
      <div class="campo"><label for="h-setor">Setor</label><select id="h-setor"><option value="">Todos</option>
        ${setores.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
      ${podeLancar ? `<div class="campo"><label for="h-quando">Data e hora da ronda</label>
        <input id="h-quando" type="datetime-local" value="${hm.agoraLocal()}" max="${hm.agoraLocal()}"></div>` : ''}
    </div></div>
    <div id="res-hm"></div>`;

  const faixa = () => {
    const cont = Object.keys(hm.SITUACAO).map((k) => ({ k, n: lista.filter((e) => e.situacao === k).length }))
      .sort((a, b) => b.n - a.n);
    el.querySelector('#faixa-hm').innerHTML = `
      <button class="quadro-status total ${!f.situacao ? 'sel' : ''}" data-sit=""><span class="n">${lista.length}</span><span>Com horímetro</span></button>
      ${cont.map(({ k, n }) => `<button class="quadro-status st-${hm.SITUACAO[k].cor} ${f.situacao === k ? 'sel' : ''}" data-sit="${k}">
        <span class="n">${n}</span><span><i data-lucide="${hm.SITUACAO[k].icone}"></i> ${esc(hm.SITUACAO[k].nome)}</span></button>`).join('')}`;
  };

  const linha = (e) => `<tr data-id="${e.id}">
      <td data-rotulo="Equipamento"><div><a href="#/equipamentos/${e.id}?aba=horimetro" class="nowrap"><b>${esc(e.tag)}</b></a>
        <div class="small muted">${esc([e.name, e.sector].filter(Boolean).join(' · '))}</div></div></td>
      <td data-rotulo="Última leitura" class="num"><div><b>${fmtH(e.current_hour_meter)}</b>
        ${e.current_hour_meter_at ? `<div class="small muted">${fmtDataHora(e.current_hour_meter_at)}</div>` : ''}</div></td>
      <td data-rotulo="Situação"><div>${badgeSituacao(e.situacao)} <span class="small muted">${diasTxt(e.dias_sem_leitura)}</span>
        ${e.status !== 'operando' ? `<div style="margin-top:4px">${badgeStatus(e.status)}</div>` : ''}</div></td>
      <td data-rotulo="Média" class="num">${e.media_h_dia == null ? '—' : `${fmtNum(e.media_h_dia, 1)} h/dia`}</td>
      ${podeLancar ? `<td data-rotulo="Nova leitura" class="celula-leitura"><div>
        <form class="form-ronda" data-id="${e.id}">
          <input name="valor" inputmode="decimal" autocomplete="off" placeholder="${e.current_hour_meter == null ? 'Leitura inicial' : 'Novo valor'}" aria-label="Nova leitura de ${esc(e.tag)}">
          <button class="btn btn-sm btn-primario" type="submit" title="Salvar leitura"><i data-lucide="check"></i></button>
        </form><div class="msg-ronda small"></div></div></td>` : ''}
    </tr>`;

  const desenhar = () => {
    faixa();
    const t = f.busca.trim().toLowerCase();
    const r = lista.filter((e) => (!f.situacao || e.situacao === f.situacao) && (!f.setor || e.sector === f.setor)
      && (!t || `${e.tag} ${e.name}`.toLowerCase().includes(t)));
    const res = el.querySelector('#res-hm');
    if (!lista.length) {
      res.innerHTML = `<div class="card">${vazio({ icone: 'gauge', titulo: 'Nenhum equipamento com horímetro',
        texto: 'Os equipamentos marcados como "possui horímetro" (e que não estejam desativados) aparecem aqui.' })}</div>`;
    } else if (!r.length) {
      res.innerHTML = `<div class="card">${vazio({ icone: 'search-x', titulo: 'Nenhum equipamento com esses filtros' })}</div>`;
    } else {
      res.innerHTML = `<div class="contagem-equip">${r.length} de ${lista.length} equipamento${lista.length === 1 ? '' : 's'}</div>
        <div class="card"><div class="tabela-wrap"><table class="tabela responsiva tabela-ronda"><thead><tr>
        <th>Equipamento</th><th>Última leitura</th><th>Situação</th><th>Média (30 dias)</th>${podeLancar ? '<th>Nova leitura</th>' : ''}
        </tr></thead><tbody>${r.map(linha).join('')}</tbody></table></div></div>`;
    }
    icones();
  };

  el.querySelector('#faixa-hm').onclick = (ev) => {
    const b = ev.target.closest('[data-sit]'); if (!b) return;
    f.situacao = b.dataset.sit; desenhar();
  };
  el.querySelector('#h-busca').oninput = (ev) => { f.busca = ev.target.value; desenhar(); };
  el.querySelector('#h-setor').onchange = (ev) => { f.setor = ev.target.value; desenhar(); };

  // Lançamento linha a linha
  el.querySelector('#res-hm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target.closest('.form-ronda'); if (!form) return;
    const e = lista.find((x) => x.id === form.dataset.id);
    const msg = form.nextElementSibling;
    const valor = hm.lerNumero(form.valor.value);
    if (valor == null) return;
    if (Number.isNaN(valor)) { msg.innerHTML = '<span class="texto-perigo">Valor inválido.</span>'; return; }
    const quandoLocal = el.querySelector('#h-quando')?.value;
    const btn = form.querySelector('button'); btn.disabled = true; msg.textContent = 'Salvando…';
    try {
      const r = await hm.registrar({ equipmentId: e.id, valor, quando: hm.localParaISO(quandoLocal) });
      Object.assign(e, { current_hour_meter: r.value, current_hour_meter_at: r.read_at, situacao: 'em_dia',
        dias_sem_leitura: Math.max(0, Math.floor((Date.now() - new Date(r.read_at)) / 864e5)) });
      if (Date.now() - new Date(r.read_at) > e.stale_days_effective * 864e5) e.situacao = 'atrasada';
      const tr = form.closest('tr');
      tr.outerHTML = linha(e);
      const nova = el.querySelector(`tr[data-id="${e.id}"]`);
      nova.classList.add('salva');
      nova.querySelector('.msg-ronda').innerHTML = `<span class="texto-sucesso">Salvo${r.delta_hours != null ? ` · +${fmtNum(r.delta_hours, 1)} h` : ' · leitura inicial'}</span>`;
      faixa(); icones();
      // vai para a próxima linha
      const prox = nova.nextElementSibling?.querySelector('input[name=valor]');
      prox?.focus();
    } catch (err) {
      msg.innerHTML = `<span class="texto-perigo">${esc(traduzirErro(err))}</span>`;
      btn.disabled = false;
    }
  });
  desenhar();
}

// ---------------------------------------------------------------------
// Formulário de leitura (ficha do equipamento)
// ---------------------------------------------------------------------
export function abrirRegistro(e, aoSalvar) {
  const { el, fechar } = abrirModal({
    titulo: `Registrar leitura — ${e.tag}`,
    html: `<form id="f-leitura" class="grade" style="gap:14px">
      <div class="muted">${e.current_hour_meter == null ? 'Esta será a <b>leitura inicial</b> do equipamento.'
        : `Última leitura: <b>${fmtH(e.current_hour_meter)}</b> em ${fmtDataHora(e.current_hour_meter_at)}.`}</div>
      <div class="grade grade-2">
        <div class="campo"><label for="l-valor">Valor do horímetro (h) *</label>
          <input id="l-valor" name="valor" inputmode="decimal" required autocomplete="off" placeholder="Ex.: 12.345,6"></div>
        <div class="campo"><label for="l-quando">Data e hora da leitura *</label>
          <input id="l-quando" name="quando" type="datetime-local" required value="${hm.agoraLocal()}" max="${hm.agoraLocal()}"></div>
      </div>
      <div class="campo"><label for="l-obs">Observação</label><input id="l-obs" name="obs" maxlength="1000" placeholder="Opcional"></div>
      <div class="campo"><label for="l-foto">Foto do mostrador</label><input id="l-foto" name="foto" type="file" accept="image/*" capture="environment"></div>
      <div id="msg-leitura"></div></form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-leitura">Salvar leitura</button>',
  });
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const msg = el.querySelector('#msg-leitura');
    const valor = hm.lerNumero(f.valor.value);
    if (valor == null || Number.isNaN(valor)) { msg.innerHTML = '<div class="alerta perigo">Informe um valor válido.</div>'; return; }
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      let foto = f.foto.files[0] || null;
      if (foto) foto = await comprimirImagem(foto);
      const r = await hm.registrar({ equipmentId: e.id, valor, quando: hm.localParaISO(f.quando.value), obs: f.obs.value.trim(), foto });
      toast(r.delta_hours != null ? `Leitura salva: +${fmtNum(r.delta_hours, 1)} h desde a anterior.` : 'Leitura inicial salva.');
      fechar(); aoSalvar?.();
    } catch (err) {
      msg.innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Gráfico de evolução (SVG simples, sem biblioteca)
// ---------------------------------------------------------------------
export function grafico(pontos) {
  const p = pontos.map((x) => ({ t: new Date(x.read_at).getTime(), v: Number(x.value), x })).sort((a, b) => a.t - b.t);
  if (p.length < 2) return '';
  const W = 640; const H = 220; const m = { e: 64, d: 16, c: 14, b: 30 };
  const t0 = p[0].t; const t1 = p[p.length - 1].t;
  let v0 = p[0].v; let v1 = p[p.length - 1].v;
  if (v1 === v0) { v0 -= 1; v1 += 1; }
  const X = (t) => m.e + ((t - t0) / (t1 - t0 || 1)) * (W - m.e - m.d);
  const Y = (v) => H - m.b - ((v - v0) / (v1 - v0)) * (H - m.c - m.b);
  const marcas = [0, 0.5, 1].map((k) => v0 + k * (v1 - v0));
  const dataCurta = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  return `<svg class="grafico-hm" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução do horímetro">
    ${marcas.map((v) => `<line x1="${m.e}" x2="${W - m.d}" y1="${Y(v)}" y2="${Y(v)}" class="grade-linha"/>
      <text x="${m.e - 8}" y="${Y(v) + 4}" text-anchor="end" class="eixo">${fmtNum(v, 0)}</text>`).join('')}
    <text x="${m.e}" y="${H - 8}" class="eixo">${dataCurta(t0)}</text>
    <text x="${W - m.d}" y="${H - 8}" text-anchor="end" class="eixo">${dataCurta(t1)}</text>
    <polyline class="linha" points="${p.map((q) => `${X(q.t).toFixed(1)},${Y(q.v).toFixed(1)}`).join(' ')}"/>
    ${p.map((q) => `<circle class="ponto" cx="${X(q.t).toFixed(1)}" cy="${Y(q.v).toFixed(1)}" r="4"><title>${fmtDataHora(q.x.read_at)}: ${fmtH(q.v)}</title></circle>`).join('')}
  </svg>`;
}
