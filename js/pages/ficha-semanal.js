// =====================================================================
// Ficha semanal individual para imprimir — mesmo modelo da planilha
// "Programação e controle diário de manutenção" da Fer Alvarez.
// Abre numa janela própria (uma folha A4 por colaborador) e chama a
// impressão; dá para "Salvar como PDF" no lugar da impressora.
// =====================================================================
import { esc, addDias } from '../ui.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_SEMANA = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA'];
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diaMes = (iso) => `${iso.slice(8, 10)}/${MESES[Number(iso.slice(5, 7)) - 1]}`;
const POR_LINHA = 5;

function textoAtividade(i) {
  const tag = i.equipment_tag && !i.title.toUpperCase().includes(i.equipment_tag.toUpperCase()) ? ` ${i.equipment_tag}` : '';
  return `${i.work_order_number ? `${i.work_order_number} · ` : ''}${i.title}${tag}`;
}

function folha({ colab, semana, itens, feriados }) {
  const dias = Array.from({ length: 5 }, (_, k) => addDias(semana, k));
  const linhas = [];
  dias.forEach((d) => {
    if (feriados[d]) { linhas.push({ d, feriado: feriados[d] }); return; }
    const xs = itens.filter((i) => i.scheduled_date === d).sort((a, b) => a.position - b.position);
    if (!xs.length) { linhas.push({ d, xs: [] }); return; }
    for (let k = 0; k < xs.length; k += POR_LINHA) linhas.push({ d, xs: xs.slice(k, k + POR_LINHA), cont: k > 0 });
  });
  const programadas = itens.filter((i) => !feriados[i.scheduled_date] && dias.includes(i.scheduled_date)).length;
  const celulas = (xs) => Array.from({ length: POR_LINHA }, (_, k) => `<td class="ativ">${xs[k] ? esc(textoAtividade(xs[k])) : ''}</td>`).join('');
  return `<section class="folha">
    <header class="cab">
      <img src="${new URL('img/logo-fer-alvarez.png', document.baseURI).href}" alt="Fer Alvarez">
      <div><h1>PROGRAMAÇÃO E CONTROLE DIÁRIO DE MANUTENÇÃO</h1>
        <p>FICHA SEMANAL INDIVIDUAL &nbsp;•&nbsp; PREENCHER UMA LINHA PARA CADA DIA</p></div>
    </header>
    <h2>1. IDENTIFICAÇÃO</h2>
    <table class="ident"><tr><th>COLABORADOR</th><td>${esc(colab.name.toUpperCase())}</td><th>FUNÇÃO</th><td>${esc((colab.job_title || '').toUpperCase())}</td></tr>
      <tr><th>SEMANA</th><td>${dm(semana)} - ${dm(dias[4])}</td><th>PROGRAMAÇÃO</th><td>PCM – FER ALVAREZ</td></tr></table>
    <h2>2. PROGRAMAÇÃO E EXECUÇÃO – SEGUNDA A SEXTA-FEIRA</h2>
    <table class="prog"><colgroup><col class="c-dia">${'<col>'.repeat(POR_LINHA)}<col></colgroup>
      <thead><tr><th>DIA / DATA</th>${Array.from({ length: POR_LINHA }, (_, k) => `<th>ATIVIDADE ${k + 1} / EQUIPAMENTO</th>`).join('')}<th>OBSERVAÇÃO / PENDÊNCIA</th></tr></thead>
      <tbody>${linhas.map((l) => `<tr>
        <td class="dia">${diaMes(l.d)}${l.cont ? '<br><small>(cont.)</small>' : ''}</td>
        ${l.feriado ? `${Array.from({ length: POR_LINHA + 1 }, () => `<td class="ativ feriado">${esc(l.feriado)}</td>`).join('')}` : `${celulas(l.xs)}<td></td>`}
      </tr>`).join('')}</tbody></table>
    <h2>3. REGISTRO RESUMIDO DOS SERVIÇOS EXECUTADOS</h2>
    <table class="reg"><colgroup><col class="c-dia"><col class="c-serv"><col class="c-hora"><col class="c-hora"><col class="c-resp"><col class="c-obs"></colgroup>
      <thead><tr><th>DIA</th><th>SERVIÇO REALIZADO / RESULTADO</th><th>INÍCIO</th><th>TÉRMINO</th><th>RESPONSÁVEL / APOIO</th><th>OBSERVAÇÃO</th></tr></thead>
      <tbody>${DIAS_SEMANA.map((d) => `<tr><td class="dia-txt">${d}</td><td></td><td class="hora">____:____</td><td class="hora">____:____</td><td></td><td></td></tr>`).join('')}</tbody></table>
    <h2>4. OCORRÊNCIAS, IMPEDIMENTOS E NECESSIDADE DE MATERIAIS</h2>
    <div class="caixa"></div>
    <h2>5. FECHAMENTO DA SEMANA</h2>
    <table class="fech"><tr><td>PROGRAMADAS: <b>${programadas}</b></td><td>CONCLUÍDAS: ______</td><td>PENDENTES: ______</td></tr>
      <tr><td colspan="3" class="centro">ATIVIDADES REPROGRAMADAS: ______</td></tr></table>
    <p class="rot">JUSTIFICATIVA DAS PENDÊNCIAS / OBSERVAÇÕES FINAIS:</p>
    <div class="caixa baixa"></div>
    <table class="assin"><tr><td>ASSINATURA DO COLABORADOR: ______________________________</td><td>VISTO DO GESTOR DE MANUTENÇÃO: ______________________________</td></tr></table>
    <footer>FER ALVAREZ &nbsp;|&nbsp; CONTROLE INTERNO DE MANUTENÇÃO</footer>
  </section>`;
}

const ESTILO = `
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #e9ecf1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barra { position: sticky; top: 0; background: #1e3a8a; color: #fff; padding: 10px 16px; display: flex; gap: 12px; align-items: center; justify-content: space-between; font-size: 14px; z-index: 2; }
  .barra button { font: inherit; font-weight: 700; padding: 8px 16px; border-radius: 6px; border: 0; background: #fff; color: #1e3a8a; cursor: pointer; }
  .folha { width: 192mm; min-height: 279mm; margin: 12px auto; background: #fff; padding: 6mm 5mm; display: flex; flex-direction: column; gap: 2.2mm; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
  .cab { display: grid; grid-template-columns: 52mm 1fr; align-items: center; gap: 6mm; margin-bottom: 2mm; }
  .cab img { width: 50mm; }
  .cab h1 { margin: 0; font-size: 12.5pt; color: #2b3f8f; text-align: center; letter-spacing: .02em; }
  .cab p { margin: 1mm 0 0; font-size: 7pt; color: #555; text-align: center; }
  h2 { margin: 1.6mm 0 0; font-size: 8pt; color: #2b3f8f; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td, th { border: .35mm solid #3d4a6b; font-size: 7.4pt; padding: 1.2mm 1.4mm; vertical-align: middle; }
  .ident th { background: #e6eaf5; color: #2b3f8f; width: 26mm; text-align: center; }
  .ident td { font-size: 8.5pt; }
  .prog thead th, .reg thead th { background: #3a55a4; color: #fff; font-size: 6.4pt; text-align: center; padding: 1.6mm 1mm; }
  .c-dia { width: 17mm; }
  .prog td { height: 15.5mm; }
  .prog .dia { text-align: center; font-weight: 700; font-size: 8pt; }
  .prog .dia small { font-weight: 400; font-size: 6pt; color: #555; }
  .prog .ativ { text-align: center; text-transform: uppercase; font-size: 6.9pt; line-height: 1.25; word-wrap: break-word; }
  .prog .feriado { font-weight: 700; }
  .reg td { height: 7mm; }
  .reg .dia-txt { font-size: 6.4pt; text-align: center; font-weight: 700; }
  .reg .hora { text-align: center; color: #333; }
  .c-serv { width: 48mm; } .c-hora { width: 21mm; } .c-resp { width: 32mm; }
  .caixa { border: .35mm solid #3d4a6b; height: 15mm; }
  .caixa.baixa { height: 14mm; }
  .fech td { font-size: 7pt; font-weight: 700; color: #2b3f8f; height: 7mm; }
  .fech b { color: #111; font-size: 9pt; }
  .centro { text-align: center; }
  .rot { margin: 1.4mm 0 0; font-size: 6.6pt; font-weight: 700; color: #2b3f8f; }
  .assin td { font-size: 6.6pt; font-weight: 700; color: #2b3f8f; height: 10mm; vertical-align: bottom; }
  footer { margin-top: auto; text-align: center; font-size: 6.6pt; color: #555; padding-top: 2mm; }
  @media print {
    body { background: #fff; }
    .barra { display: none; }
    .folha { margin: 0; box-shadow: none; width: auto; min-height: 0; height: 278mm; padding: 0; page-break-after: always; break-after: page; }
    .folha:last-child { page-break-after: auto; break-after: auto; }
  }`;

// janela: aberta pela página no clique (para o navegador não bloquear)
export function imprimirFichas(janela, { semana, colabs, itens, feriados = {} }) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Programação semanal ${dm(semana)} a ${dm(addDias(semana, 4))}</title><style>${ESTILO}</style></head><body>
    <div class="barra"><span>${colabs.length} ficha${colabs.length === 1 ? '' : 's'} · semana de ${dm(semana)} a ${dm(addDias(semana, 4))}</span>
      <button onclick="print()">Imprimir</button></div>
    ${colabs.map((c) => folha({ colab: c, semana, itens: itens.filter((i) => i.staff_id === c.id), feriados })).join('')}
    <script>window.addEventListener('load', () => setTimeout(() => print(), 400));<\/script></body></html>`;
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
}
