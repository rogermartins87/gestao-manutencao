// =====================================================================
// Ficha da peça: dados do catálogo, custo de referência (quem vê custos)
// e onde ela foi usada (equipamentos e OS).
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, confirmar, vazio, montarTabela, fmtDataHora, fmtMoeda, numOuNulo } from '../ui.js';
import * as pc from '../services/pecas.js';
import { abrirPeca } from './pecas.js';

export async function render(el, [id]) {
  const p = await pc.ler(id);
  if (!p) { el.innerHTML = '<div class="alerta aviso">Peça não encontrada. <a href="#/pecas">Voltar</a></div>'; return; }
  document.getElementById('titulo-pagina').textContent = `${p.code} — ${p.name}`;
  const verCusto = pode('costs.read');
  const lancaCusto = pode('costs.write');
  const podeEditar = pode('parts_catalog.write');
  const [usos, refs, todas] = await Promise.all([
    pc.usosDaPeca(id),
    verCusto ? pc.custosReferencia().catch(() => []) : [],
    podeEditar ? pc.catalogo() : [],
  ]);
  const ref = refs.find((r) => r.id === id);
  const recarregar = () => render(el, [id]).then(icones);

  // Uso por equipamento — do maior para o menor
  const porEq = new Map();
  usos.forEach((u) => {
    const x = porEq.get(u.equipment_id) || { tag: u.equipment_tag, nome: u.equipment_name, n: 0, qtd: 0 };
    x.n += 1; x.qtd += Number(u.quantity); porEq.set(u.equipment_id, x);
  });
  const ranking = [...porEq.entries()].sort((a, b) => b[1].n - a[1].n || b[1].qtd - a[1].qtd);
  const totalQtd = usos.reduce((s, u) => s + Number(u.quantity), 0);
  const totalR = usos.reduce((s, u) => s + Number(u.total_cost || 0), 0);
  const info = (rot, val) => `<div><span class="rotulo">${esc(rot)}</span>${val}</div>`;

  el.innerHTML = `
    <a class="voltar" href="#/pecas"><i data-lucide="arrow-left"></i> Peças e componentes</a>
    <div class="card ficha-topo"><div class="card-corpo">
      <div class="ficha-cab">
        <div><div class="equip-tag grande">${esc(p.code)}</div><h1>${esc(p.name)} ${p.active ? '' : '<span class="badge inativo">inativa</span>'}</h1>
          <div class="muted">${esc([p.category, p.manufacturer, p.manufacturer_code].filter(Boolean).join(' · ') || 'Sem categoria')}</div></div>
        <div class="acoes">
          ${lancaCusto ? '<button class="btn" data-acao="custo"><i data-lucide="circle-dollar-sign"></i> Custo de referência</button>' : ''}
          ${podeEditar ? `<button class="btn" data-acao="editar"><i data-lucide="pencil"></i> Editar</button>
            <button class="btn btn-texto" data-acao="ativo">${p.active ? '<i data-lucide="eye-off"></i> Desativar' : '<i data-lucide="eye"></i> Reativar'}</button>` : ''}
        </div>
      </div>
      <div class="ficha-indicadores">
        ${info('Unidade', `<b>${esc(pc.UNIDADE[p.unit] || p.unit)}</b>`)}
        ${info('Usos registrados', `<b class="grande-num">${usos.length}</b><span class="small muted">${pc.fmtQtd(totalQtd, p.unit)} no total</span>`)}
        ${info('Equipamentos', `<b class="grande-num">${porEq.size}</b>`)}
        ${verCusto ? info('Custo de referência', `<b>${ref ? fmtMoeda(ref.cost) : '—'}</b>${usos.length ? `<span class="small muted">${fmtMoeda(totalR)} gastos nos usos</span>` : ''}`) : ''}
      </div>
      ${p.description ? `<p style="margin:14px 0 0;white-space:pre-wrap">${esc(p.description)}</p>` : ''}
    </div></div>

    ${ranking.length ? `<div class="card secao"><div class="card-titulo"><h3><i data-lucide="factory"></i> Onde mais é trocada</h3></div>
      <div class="card-corpo barras-motivo">${ranking.map(([eqId, x]) => `<div class="barra-linha">
        <span class="barra-rotulo"><a href="#/equipamentos/${eqId}?aba=pecas"><b>${esc(x.tag)}</b></a> <span class="muted small">${esc(x.nome)}</span></span>
        <span class="barra-trilho"><span class="barra" style="width:${Math.max(2, (x.n / ranking[0][1].n) * 100).toFixed(1)}%"></span></span>
        <span class="barra-valor"><b>${x.n}×</b> <span class="muted small">(${pc.fmtQtd(x.qtd, p.unit)})</span></span></div>`).join('')}</div></div>` : ''}

    <h2 class="secao"><i data-lucide="history"></i> Usos nas ordens de serviço</h2>
    <div class="card" id="tab-usos"></div>`;

  montarTabela(el.querySelector('#tab-usos'), {
    linhas: usos, busca: false, porPagina: 50,
    aoClicar: (uid) => { const u = usos.find((x) => x.id === uid); location.hash = `#/ordens/${u.work_order_id}?aba=pecas`; },
    vazioHtml: vazio({ icone: 'package', titulo: 'Esta peça ainda não foi usada em nenhuma OS' }),
    colunas: [
      { titulo: 'Data da troca', valor: (u) => u.replaced_at, render: (u) => `<span class="nowrap">${fmtDataHora(u.replaced_at)}</span>`, classe: 'num', primaria: true },
      { titulo: 'Equipamento', valor: (u) => u.equipment_tag, render: (u) => `<div><b>${esc(u.equipment_tag)}</b><div class="small muted">${esc(u.equipment_name)}</div></div>` },
      { titulo: 'OS', valor: (u) => u.work_order_number, render: (u) => `<b class="nowrap">${esc(u.work_order_number)}</b>` },
      { titulo: 'Quantidade', valor: (u) => Number(u.quantity), render: (u) => pc.fmtQtd(u.quantity, u.unit), classe: 'num' },
      { titulo: 'Motivo', valor: (u) => u.reason || '', render: (u) => esc(u.reason || '—') },
      ...(verCusto ? [{ titulo: 'Custo', valor: (u) => Number(u.total_cost ?? -1), render: (u) => (u.total_cost == null ? '<span class="muted small">sem valor</span>' : fmtMoeda(u.total_cost)), classe: 'num' }] : []),
    ],
  });

  el.querySelector('.ficha-cab .acoes').addEventListener('click', async (ev) => {
    const k = ev.target.closest('[data-acao]')?.dataset.acao; if (!k) return;
    if (k === 'editar') {
      const categorias = [...new Set(todas.map((x) => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      abrirPeca(p, { categorias, depois: recarregar });
    }
    if (k === 'ativo') {
      const desativar = p.active;
      if (await confirmar({ titulo: desativar ? 'Desativar peça' : 'Reativar peça',
        mensagem: desativar ? `A peça <b>${esc(p.code)}</b> deixa de aparecer para novos lançamentos. O histórico de usos continua.` : `A peça <b>${esc(p.code)}</b> volta a aparecer para novos lançamentos.`,
        botao: desativar ? 'Desativar' : 'Reativar', perigo: desativar })) {
        try { await pc.salvar(p.id, { active: !desativar }); toast(desativar ? 'Peça desativada.' : 'Peça reativada.'); recarregar(); } catch (err) { toast(traduzirErro(err), 'erro'); }
      }
    }
    if (k === 'custo') abrirCustoReferencia(p, ref, recarregar);
  });
}

function abrirCustoReferencia(p, ref, depois) {
  const { el, fechar } = abrirModal({
    titulo: `Custo de referência — ${p.code}`,
    html: `<form id="f-ref" class="grade" style="gap:14px">
      <div class="campo"><label for="r-val">Custo por ${esc(p.unit)} (R$) *</label>
        <input id="r-val" name="valor" inputmode="decimal" required autocomplete="off" value="${ref ? String(ref.cost).replace('.', ',') : ''}" placeholder="Ex.: 85,50"></div>
      <div class="alerta small"><i data-lucide="info"></i><div>O valor é copiado para cada novo uso da peça numa OS. Usos já lançados continuam com o valor da época.</div></div>
      <div id="msg-ref"></div></form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-ref">Salvar</button>',
  });
  icones();
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const v = numOuNulo(ev.target.valor.value);
      if (v == null || v < 0) throw new Error('Valor inválido. Use, por exemplo, 85,50.');
      await pc.definirCustoReferencia(p.id, v, !!ref);
      toast('Custo de referência salvo.'); fechar(); depois();
    } catch (err) {
      el.querySelector('#msg-ref').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
}
