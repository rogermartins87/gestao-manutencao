// =====================================================================
// Gráficos simples em SVG para o dashboard (sem biblioteca externa).
// Valores nulos = "sem dado" (o mês aparece, mas sem ponto/barra).
// =====================================================================
import { esc, fmtNum } from './ui.js';

export const COR = {
  marinho: '#021230', marinho2: '#13306b', royal: '#0763e0', claro: '#7fb0ff', aco: '#96979a',
  verde: '#2e7d32', ambar: '#c27a00', vermelho: '#c62828', grade: '#e3e8f0', texto: '#5b6576',
};

const temDado = (v) => v != null && Number.isFinite(Number(v));
export const semDados = (txt = 'Sem dados ainda.') => `<div class="graf-vazio"><i data-lucide="chart-no-axes-column"></i>${esc(txt)}</div>`;

// Barras verticais; o último mês (o atual) fica em destaque
export function barras(rotulos, valores, { sufixo = '', casas = 1, h = 200, w = 560, titulo = '' } = {}) {
  if (!valores.some((v) => temDado(v) && Number(v) > 0)) return semDados();
  const m = { t: 20, b: 26, l: 38, r: 8 }; const max = Math.max(...valores.filter(temDado).map(Number)) * 1.15;
  const bw = (w - m.l - m.r) / valores.length; const y = (v) => m.t + (h - m.t - m.b) * (1 - v / max);
  let s = '';
  for (let i = 0; i <= 3; i++) {
    const v = (max / 3) * i;
    s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${COR.grade}"/>
      <text x="${m.l - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="eixo">${fmtNum(v, 0)}</text>`;
  }
  valores.forEach((v, i) => {
    const x = m.l + i * bw + bw * 0.2; const cx = x + bw * 0.3;
    if (temDado(v) && Number(v) > 0) {
      s += `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${(y(0) - y(v)).toFixed(1)}" rx="3" fill="${i === valores.length - 1 ? COR.royal : COR.claro}"><title>${esc(rotulos[i])}: ${fmtNum(v, casas)}${sufixo}</title></rect>
        <text x="${cx.toFixed(1)}" y="${(y(v) - 5).toFixed(1)}" text-anchor="middle" class="valor-graf">${fmtNum(v, casas)}${sufixo}</text>`;
    }
    s += `<text x="${cx.toFixed(1)}" y="${h - 8}" text-anchor="middle" class="eixo">${esc(rotulos[i])}</text>`;
  });
  return `<svg class="graf" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(titulo)}">${s}</svg>`;
}

// Linha com área e linha de meta; meses sem dado ficam sem ponto
export function linha(rotulos, valores, { meta = null, sufixo = '%', h = 210, w = 720, titulo = '' } = {}) {
  const dados = valores.filter(temDado).map(Number);
  if (!dados.length) return semDados();
  let min = Math.min(...dados, meta ?? 100); let max = Math.max(...dados, meta ?? 0);
  min = Math.max(0, Math.floor((min - 3) / 5) * 5); max = Math.min(100, Math.ceil((max + 2) / 5) * 5); if (max - min < 10) min = Math.max(0, max - 10);
  const m = { t: 20, b: 26, l: 38, r: 14 }; const bw = (w - m.l - m.r) / Math.max(1, valores.length - 1);
  const y = (v) => m.t + (h - m.t - m.b) * (1 - (v - min) / (max - min)); const x = (i) => m.l + i * bw;
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) / 4) * i;
    s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${COR.grade}"/>
      <text x="${m.l - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="eixo">${fmtNum(v, 0)}</text>`;
  }
  const pts = valores.map((v, i) => (temDado(v) ? [x(i), y(Number(v)), i, Number(v)] : null)).filter(Boolean);
  if (pts.length > 1) {
    const p = pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
    s += `<polygon points="${pts[0][0].toFixed(1)},${y(min).toFixed(1)} ${p} ${pts[pts.length - 1][0].toFixed(1)},${y(min).toFixed(1)}" fill="${COR.royal}" opacity=".10"/>
      <polyline points="${p}" fill="none" stroke="${COR.royal}" stroke-width="2.5"/>`;
  }
  if (meta != null) {
    s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(meta).toFixed(1)}" y2="${y(meta).toFixed(1)}" stroke="${COR.vermelho}" stroke-dasharray="5 4"/>
      <text x="${w - m.r}" y="${(y(meta) + 13).toFixed(1)}" text-anchor="end" class="eixo" fill="${COR.vermelho}" style="fill:${COR.vermelho}">meta ${fmtNum(meta, 0)}${sufixo}</text>`;
  }
  pts.forEach(([px, py, i, v]) => { s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="#fff" stroke="${COR.royal}" stroke-width="2"><title>${esc(rotulos[i])}: ${fmtNum(v, 1)}${sufixo}</title></circle>`; });
  const u = pts[pts.length - 1];
  s += `<text x="${u[0].toFixed(1)}" y="${(u[1] - 9).toFixed(1)}" text-anchor="end" class="valor-graf">${fmtNum(u[3], 1)}${sufixo}</text>`;
  valores.forEach((_, i) => { s += `<text x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" class="eixo">${esc(rotulos[i])}</text>`; });
  return `<svg class="graf" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(titulo)}">${s}</svg>`;
}

// Rosca com o total no meio; itens [{nome, n, cor}] já do maior para o menor
export function rosca(itens, { sub = '', tam = 140 } = {}) {
  const tot = itens.reduce((a, b) => a + b.n, 0); const r = 52; const c = 2 * Math.PI * r; let ac = 0; let s = '';
  itens.filter((it) => it.n > 0).forEach((it) => {
    const l = (it.n / tot) * c;
    s += `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${it.cor}" stroke-width="18" stroke-dasharray="${l.toFixed(2)} ${(c - l).toFixed(2)}" stroke-dashoffset="${(-ac).toFixed(2)}" transform="rotate(-90 70 70)"><title>${esc(it.nome)}: ${it.n}</title></circle>`;
    ac += l;
  });
  return `<svg class="rosca" viewBox="0 0 140 140" width="${tam}" height="${tam}" role="img" aria-label="${esc(sub)}: ${tot}">
    <circle r="${r}" cx="70" cy="70" fill="none" stroke="${COR.grade}" stroke-width="18"/>${s}
    <text x="70" y="74" text-anchor="middle" class="rosca-n">${fmtNum(tot)}</text><text x="70" y="92" text-anchor="middle" class="eixo">${esc(sub)}</text></svg>`;
}
export const legenda = (itens) => `<ul class="legenda-dash">${itens.map((i) => `<li>${i.href ? `<a href="${i.href}">` : ''}<span style="background:${i.cor}"></span>${esc(i.nome)}<b>${esc(String(i.n))}</b>${i.href ? '</a>' : ''}</li>`).join('')}</ul>`;

// Ranking em barras horizontais (itens já do maior para o menor)
export function ranking(itens, { sufixo = ' h', casas = 1 } = {}) {
  const max = Math.max(...itens.map((i) => i.v));
  return `<div class="ranking">${itens.map((i, k) => `<a class="ranking-l" href="${i.href || '#'}"><span class="ranking-n">${esc(i.nome)}<small>${esc(i.det || '')}</small></span>
    <span class="ranking-b"><span style="width:${max ? ((i.v / max) * 100).toFixed(1) : 0}%;background:${k === 0 ? COR.royal : COR.claro}"></span></span><b>${fmtNum(i.v, casas)}${sufixo}</b></a>`).join('')}</div>`;
}

// Mini linha (tendência) para dentro dos cartões; precisa de 2+ meses com dado
export function mini(valores, cor = COR.claro) {
  const pts = valores.map((v, i) => (temDado(v) ? [i, Number(v)] : null)).filter(Boolean);
  if (pts.length < 2) return '';
  const w = 120; const h = 34; const vs = pts.map((p) => p[1]); const mx = Math.max(...vs); const mn = Math.min(...vs);
  const x = (i) => (i * w) / (valores.length - 1); const y = (v) => h - 4 - ((v - mn) / (mx - mn || 1)) * (h - 8);
  const u = pts[pts.length - 1];
  return `<svg class="mini-graf" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${cor}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(u[0]).toFixed(1)}" cy="${y(u[1]).toFixed(1)}" r="2.5" fill="${cor}"/></svg>`;
}
