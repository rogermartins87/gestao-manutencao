// =====================================================================
// Peças e componentes — catálogo (sem estoque). Cada peça usada numa OS
// guarda uma cópia do código, nome e custo; mudar o catálogo não altera
// o que já foi lançado.
// =====================================================================
import { pode } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, vazio, montarTabela, fmtMoeda, numOuNulo } from '../ui.js';
import * as pc from '../services/pecas.js';

export async function render(el) {
  const verCusto = pode('costs.read');
  const podeCadastrar = pode('parts_catalog.write');
  const [lista, custos] = await Promise.all([pc.catalogo(), verCusto ? pc.custosReferencia().catch(() => []) : []]);
  const custo = Object.fromEntries(custos.map((c) => [c.id, c.cost]));
  const categorias = [...new Set(lista.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const f = { busca: '', categoria: '', inativas: false };

  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Peças e componentes</h1>
      <p>Catálogo das peças usadas na manutenção. O sistema não controla estoque: registra o que foi trocado em cada OS.</p></div>
      <div class="acoes">${podeCadastrar ? '<button class="btn btn-primario" id="btn-nova"><i data-lucide="plus"></i> Nova peça</button>' : ''}</div></div>
    <div class="card card-filtros"><div class="card-corpo filtros-equip filtros-pecas">
      <div class="campo busca-campo"><label for="pc-busca">Buscar</label>
        <input id="pc-busca" type="search" placeholder="Código, nome, fabricante, referência…"></div>
      <div class="campo"><label for="pc-cat">Categoria</label><select id="pc-cat"><option value="">Todas</option>
        ${categorias.map((c) => `<option>${esc(c)}</option>`).join('')}<option value="-">Sem categoria</option></select></div>
      <label class="check-linha"><input type="checkbox" id="pc-inat"> Mostrar inativas</label>
    </div></div>
    <div id="res-pecas"></div>`;

  const desenhar = () => {
    const t = f.busca.trim().toLowerCase();
    const r = lista.filter((p) => (f.inativas || p.active)
      && (!f.categoria || (f.categoria === '-' ? !p.category : p.category === f.categoria))
      && (!t || [p.code, p.name, p.manufacturer, p.manufacturer_code, p.description].some((v) => String(v || '').toLowerCase().includes(t))));
    const res = el.querySelector('#res-pecas');
    if (!lista.length) {
      res.innerHTML = `<div class="card">${vazio({ icone: 'cog', titulo: 'Nenhuma peça cadastrada ainda',
        texto: podeCadastrar ? 'Cadastre as peças que a manutenção troca com frequência. Peças fora do catálogo também podem ser lançadas na OS só pelo nome.' : 'As peças aparecem aqui assim que forem cadastradas.',
        acao: podeCadastrar ? '<button class="btn btn-primario" data-nova><i data-lucide="plus"></i> Nova peça</button>' : '' })}</div>`;
    } else {
      res.innerHTML = `<div class="contagem-equip">${r.length} de ${lista.length} peça${lista.length === 1 ? '' : 's'}</div><div class="card" id="tab-pecas"></div>`;
      montarTabela(res.querySelector('#tab-pecas'), {
        linhas: r, busca: false, porPagina: 50,
        aoClicar: (id) => { location.hash = `#/pecas/${id}`; },
        vazioHtml: vazio({ icone: 'search-x', titulo: 'Nenhuma peça com esses filtros' }),
        colunas: [
          { titulo: 'Código', chave: 'code', primaria: true, render: (p) => `<b class="nowrap">${esc(p.code)}</b>` },
          { titulo: 'Peça', chave: 'name', render: (p) => `<div>${esc(p.name)} ${p.active ? '' : '<span class="badge inativo">inativa</span>'}
            <div class="small muted">${esc([p.manufacturer, p.manufacturer_code].filter(Boolean).join(' · ') || '')}</div></div>` },
          { titulo: 'Categoria', valor: (p) => p.category || '', render: (p) => esc(p.category || '—') },
          { titulo: 'Unidade', chave: 'unit', render: (p) => esc(p.unit) },
          ...(verCusto ? [{ titulo: 'Custo de referência', valor: (p) => Number(custo[p.id] ?? -1), render: (p) => (custo[p.id] == null ? '<span class="muted small">sem valor</span>' : fmtMoeda(custo[p.id])), classe: 'num' }] : []),
        ],
      });
    }
    icones();
  };

  el.querySelector('#pc-busca').oninput = (ev) => { f.busca = ev.target.value; desenhar(); };
  el.querySelector('#pc-cat').onchange = (ev) => { f.categoria = ev.target.value; desenhar(); };
  el.querySelector('#pc-inat').onchange = (ev) => { f.inativas = ev.target.checked; desenhar(); };
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('#btn-nova, [data-nova]')) abrirPeca(null, { categorias, depois: (id) => { location.hash = `#/pecas/${id}`; } });
  });
  desenhar();
}

// ---------------------------------------------------------------------
// Cadastro / edição (modal)
// ---------------------------------------------------------------------
export function abrirPeca(p, { categorias = [], depois } = {}) {
  const verCusto = pode('costs.write') && !p;
  const { el, fechar } = abrirModal({
    titulo: p ? `Editar peça ${p.code}` : 'Nova peça', largo: true,
    html: `<form id="f-peca" class="grade" style="gap:14px">
      <div class="grade grade-form">
        <div class="campo"><label for="pc-cod">Código *</label><input id="pc-cod" name="code" required maxlength="40" value="${esc(p?.code || '')}" placeholder="Ex.: ROL-6205" autocomplete="off">
          <span class="ajuda">Código interno da peça. Não pode repetir.</span></div>
        <div class="campo"><label for="pc-nome">Nome *</label><input id="pc-nome" name="name" required minlength="2" maxlength="160" value="${esc(p?.name || '')}" placeholder="Ex.: Rolamento 6205 2RS"></div>
        <div class="campo"><label for="pc-un">Unidade *</label><select id="pc-un" name="unit">
          ${Object.entries(pc.UNIDADE).map(([k, v]) => `<option value="${k}" ${(p?.unit || 'un') === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="campo"><label for="pc-cat2">Categoria</label><input id="pc-cat2" name="category" maxlength="80" list="pc-cats" value="${esc(p?.category || '')}" placeholder="Ex.: Rolamentos">
          <datalist id="pc-cats">${categorias.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="campo"><label for="pc-fab">Fabricante</label><input id="pc-fab" name="manufacturer" maxlength="120" value="${esc(p?.manufacturer || '')}" placeholder="Ex.: SKF"></div>
        <div class="campo"><label for="pc-ref">Referência do fabricante</label><input id="pc-ref" name="manufacturer_code" maxlength="80" value="${esc(p?.manufacturer_code || '')}"></div>
        ${verCusto ? `<div class="campo"><label for="pc-custo">Custo de referência (R$)</label><input id="pc-custo" name="custo" inputmode="decimal" autocomplete="off" placeholder="Ex.: 85,50">
          <span class="ajuda">Sugestão para novos usos; cada OS guarda o valor do momento.</span></div>` : ''}
      </div>
      <div class="campo"><label for="pc-desc">Descrição / aplicação</label><textarea id="pc-desc" name="description" rows="2" maxlength="2000" placeholder="Opcional. Ex.: mancal LA do cilindro de trabalho">${esc(p?.description || '')}</textarea></div>
      <div id="msg-peca"></div></form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-peca">${p ? 'Salvar' : 'Cadastrar peça'}</button>`,
  });
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const dados = {
        code: f.code.value.trim(), name: f.name.value.trim(), unit: f.unit.value,
        category: f.category.value.trim() || null, manufacturer: f.manufacturer.value.trim() || null,
        manufacturer_code: f.manufacturer_code.value.trim() || null, description: f.description.value.trim() || null,
      };
      let valor = null;
      if (verCusto && f.custo.value.trim()) {
        valor = numOuNulo(f.custo.value);
        if (valor == null || valor < 0) throw new Error('Custo de referência inválido. Use, por exemplo, 85,50.');
      }
      const r = p ? await pc.salvar(p.id, dados) : await pc.criar(dados);
      if (valor != null) {
        try { await pc.definirCustoReferencia(r.id, valor, false); } catch (err) { toast(`Peça salva, mas o custo não: ${traduzirErro(err)}`, 'erro'); }
      }
      toast(p ? 'Peça alterada.' : 'Peça cadastrada.');
      fechar(); depois?.(r.id);
    } catch (err) {
      el.querySelector('#msg-peca').innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
      btn.disabled = false;
    }
  });
}
