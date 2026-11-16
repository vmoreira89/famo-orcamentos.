/**
 * Vistas de móveis e conjuntos a partir do modelo 3D por painéis:
 * frente, lado (vista da esquerda, 1.º diedro), topo e perspectiva isométrica.
 */
import type { Movel, Tampo } from "../orcamento";
import { trocosTampo } from "../orcamento";
import { limites, rect, type Entidade, type Vista } from "./geometria";
import { alturaPes, frentesDoMovel, iso, modelo3d, profundidadeVista, type Painel } from "./modelo3d";

const E = 19;
const visivelNaFrente = (p: Painel) => p.tipo === "frente" || p.tipo === "puxador" || p.tipo === "rodape";

/* ------------------------------------------------------------------ frente */

export function entidadesFrente(m: Movel, dx = 0, dy = 0): Entidade[] {
  if (m.tipo === "tampo") return [...rect(dx, dy, m.L, m.A), ...m.pecas.slice(0, -1).reduce<{ x: number; e: Entidade[] }>((acc, p) => { acc.x += p.c; acc.e.push({ t: "linha", x1: dx + acc.x, y1: dy, x2: dx + acc.x, y2: dy + m.A, fina: true }); return acc; }, { x: 0, e: [] }).e];
  const ps = modelo3d(m);
  const y0 = alturaPes(m);
  const ents: Entidade[] = [];
  const temFrentes = ps.some((p) => p.tipo === "frente");
  const T = (x: number, y: number): [number, number] => [x + dx, y + dy];
  const r = (x: number, y: number, w: number, h: number, extra: Partial<{ tracejado: boolean; fina: boolean }> = {}) => {
    const [a, b] = T(x, y);
    return rect(a, b, w, h, extra);
  };
  // silhueta do corpo
  ents.push(...r(0, y0, m.L, m.A));
  // painéis interiores (escondidos pelas frentes → tracejado)
  const esc = { tracejado: temFrentes, fina: true };
  const [xa] = T(E, 0), [xb] = T(m.L - E, 0);
  ents.push({ t: "linha", x1: xa, y1: dy + y0 + E, x2: xa, y2: dy + y0 + m.A - E, ...esc });
  ents.push({ t: "linha", x1: xb, y1: dy + y0 + E, x2: xb, y2: dy + y0 + m.A - E, ...esc });
  ents.push({ t: "linha", x1: xa, y1: dy + y0 + E, x2: xb, y2: dy + y0 + E, ...esc });
  ents.push({ t: "linha", x1: xa, y1: dy + y0 + m.A - E, x2: xb, y2: dy + y0 + m.A - E, ...esc });
  for (const p of ps.filter((x) => x.tipo === "interior" || x.tipo === "gaveta" || x.tipo === "corredica")) ents.push(...r(p.x, p.y, p.w, p.h, esc));
  // dobradiças: base no lado e copa Ø35 na porta (a 22,5 mm da aresta)
  for (const p of ps.filter((x) => x.tipo === "dobradica")) {
    ents.push(...r(p.x + 10, p.y + 8, 30, 24, { fina: true }));
    const esq = p.x < m.L / 2;
    const [cx, cy] = T(esq ? 3 + 22.5 : m.L - 3 - 22.5, p.y + 20);
    ents.push({ t: "circulo", x: cx, y: cy, r: 17.5 });
  }
  for (const p of ps.filter(visivelNaFrente)) {
    if (p.tipo === "puxador") {
      const [a, b] = T(p.x, p.y);
      ents.push({ t: "poligono", pts: [[a, b], [a + p.w, b], [a + p.w, b + p.h], [a, b + p.h]] });
    } else ents.push(...r(p.x, p.y, p.w, p.h));
  }
  if (y0 > 0) for (const p of ps.filter((x) => x.tipo === "pe")) ents.push(...r(p.x, 0, p.w, y0 - 2, { tracejado: m.rodape_tipo !== "sem", fina: m.rodape_tipo !== "sem" }));
  return ents;
}

export function vistaFrenteMovel(m: Movel): Vista {
  if (m.tipo === "tampo") {
    const e = entidadesFrente(m);
    let x = 0;
    for (const p of m.pecas) { e.push({ t: "cota", x1: x, y1: m.A, x2: x + p.c, y2: m.A, off: 40 }); x += p.c; }
    e.push({ t: "cota", x1: 0, y1: m.A, x2: m.L, y2: m.A, off: 80 }, { t: "cota", x1: 0, y1: 0, x2: 0, y2: m.A, off: -40 });
    return limites(e);
  }
  const ents = entidadesFrente(m);
  const y0 = alturaPes(m);
  const H = m.A + y0;
  ents.push({ t: "cota", x1: 0, y1: H, x2: m.L, y2: H, off: 70 });
  ents.push({ t: "cota", x1: E, y1: H, x2: m.L - E, y2: H, off: 35 });
  ents.push({ t: "cota", x1: 0, y1: 0, x2: 0, y2: H, off: -120 });
  if (y0) {
    ents.push({ t: "cota", x1: 0, y1: y0, x2: 0, y2: H, off: -65 });
    ents.push({ t: "cota", x1: 0, y1: 0, x2: 0, y2: y0, off: -65 });
  }
  // cadeia das alturas das frentes, à direita
  const fr = frentesDoMovel(m);
  const pontos = [...new Set(fr.flatMap((f) => [Math.round(f.y), Math.round(f.y + f.h)]))].sort((a, b) => a - b);
  for (let i = 0; i < pontos.length - 1; i++) if (pontos[i + 1] - pontos[i] > 10) ents.push({ t: "cota", x1: m.L, y1: pontos[i], x2: m.L, y2: pontos[i + 1], off: 60 });
  // larguras das portas
  const portas = fr.filter((f) => f.tipo === "porta");
  if (portas.length > 1 && new Set(portas.map((f) => Math.round(f.x))).size > 1) for (const f of portas) ents.push({ t: "cota", x1: f.x, y1: y0, x2: f.x + f.w, y2: y0, off: -45 });
  return limites(ents);
}

/* ------------------------------------------------------------------ lado (vista da esquerda: frente à direita) */

export function entidadesLado(m: Movel, dx = 0, dy = 0): Entidade[] {
  if (m.tipo === "tampo") return rect(dx, dy, m.P, m.A);
  const ps = modelo3d(m);
  const y0 = alturaPes(m);
  const P = m.P;
  const H = (p: Painel) => P - (p.z + p.d); // posição horizontal: frente à direita
  const ents: Entidade[] = [];
  const r = (x: number, y: number, w: number, h: number, extra: Partial<{ tracejado: boolean; fina: boolean }> = {}) => rect(x + dx, y + dy, w, h, extra);
  ents.push(...r(0, y0, P, m.A)); // lado esquerdo
  for (const p of ps) {
    if (p.tipo === "costa" || p.tipo === "interior" || p.tipo === "gaveta" || p.tipo === "corredica" || (p.tipo === "corpo" && p.nome !== "Lado esquerdo" && p.nome !== "Lado direito"))
      ents.push(...r(H(p), p.y, p.d, p.h, { tracejado: true, fina: true }));
    else if (p.tipo === "frente") ents.push(...r(H(p), p.y, p.d, p.h));
    else if (p.tipo === "puxador") ents.push({ t: "poligono", pts: [[H(p) + dx, p.y + dy], [H(p) + p.d + dx, p.y + dy], [H(p) + p.d + dx, p.y + p.h + dy], [H(p) + dx, p.y + p.h + dy]] });
    else if (p.tipo === "dobradica") ents.push(...r(H(p) - 30, p.y + 8, 42, 24, { tracejado: true, fina: true }));
    else if (p.tipo === "rodape" || p.tipo === "pe") ents.push(...r(H(p), p.y, p.d, p.h, { fina: true }));
  }
  return ents;
}

export function vistaLadoMovel(m: Movel): Vista {
  const ents = entidadesLado(m);
  const y0 = alturaPes(m);
  const H = m.A + y0;
  const prof = m.P + E + 2;
  ents.push({ t: "cota", x1: 0, y1: H, x2: m.P, y2: H, off: 35 });
  ents.push({ t: "cota", x1: 0, y1: H, x2: prof, y2: H, off: 70 });
  ents.push({ t: "cota", x1: prof, y1: 0, x2: prof, y2: H, off: 60 });
  return limites(ents);
}

/* ------------------------------------------------------------------ topo (1.º diedro: frente para baixo) */

export function vistaTopoMovel(m: Movel): Vista {
  if (m.tipo === "tampo") return limites([...rect(0, 0, m.L, m.P), { t: "cota", x1: 0, y1: 0, x2: m.L, y2: 0, off: -50 }]);
  const ps = modelo3d(m);
  const ents: Entidade[] = [...rect(0, 0, m.L, m.P)];
  ents.push({ t: "linha", x1: E, y1: 0, x2: E, y2: m.P, tracejado: true, fina: true });
  ents.push({ t: "linha", x1: m.L - E, y1: 0, x2: m.L - E, y2: m.P, tracejado: true, fina: true });
  ents.push({ t: "linha", x1: E, y1: m.P - m.costa_e, x2: m.L - E, y2: m.P - m.costa_e, tracejado: true, fina: true });
  for (const p of ps.filter((x) => x.tipo === "frente" && x.y + x.h > alturaPes(m) + m.A - 200)) ents.push(...rect(p.x, p.z, p.w, p.d, { fina: true }));
  for (const p of ps.filter((x) => x.tipo === "puxador")) ents.push(...rect(p.x, p.z, p.w, p.d, { fina: true }));
  ents.push({ t: "cota", x1: 0, y1: 0, x2: m.L, y2: 0, off: -50 });
  return limites(ents);
}

/* ------------------------------------------------------------------ perspectiva isométrica por painéis */

export type PainelMundo = Painel & { movel?: Movel };

export function paineisMundo(m: Movel, dx = 0, dy = 0, dz = 0): PainelMundo[] {
  return modelo3d(m)
    .filter((p) => p.tipo !== "dobradica" && p.tipo !== "gaveta" && p.tipo !== "corredica")
    .map((p) => ({ ...p, x: p.x + dx, y: p.y + dy, z: p.z + dz, movel: m }));
}

/**
 * Ordem de desenho (do mais afastado para o mais próximo) para caixas que não se intersectam.
 * Câmara em +x, +y, −z: uma caixa está "atrás" de outra se estiver separada dela para trás (z),
 * para baixo (y) ou para a esquerda (x). Só se comparam caixas cujas projecções se sobrepõem.
 */
type P2 = [number, number];
/** Invólucro convexo (cadeia monótona). */
function casco(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [], hi: P2[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
/** Os dois polígonos convexos sobrepõem-se com área (teorema do eixo separador)? */
function sobrepoem(a: P2[], b: P2[]): boolean {
  for (const pol of [a, b])
    for (let i = 0; i < pol.length; i++) {
      const [x1, y1] = pol[i], [x2, y2] = pol[(i + 1) % pol.length];
      const nx = y2 - y1, ny = x1 - x2;
      const proj = (q: P2[]) => q.map(([x, y]) => x * nx + y * ny);
      const pa = proj(a), pb = proj(b);
      const tol = 1e-6 * Math.hypot(nx, ny) * 1000;
      if (Math.max(...pa) <= Math.min(...pb) + tol || Math.max(...pb) <= Math.min(...pa) + tol) return false;
    }
  return true;
}

function ordemPintor(ps: PainelMundo[]): PainelMundo[] {
  const n = ps.length;
  const cascos = ps.map((p) => casco([
    iso(p.x, p.y, p.z), iso(p.x + p.w, p.y, p.z), iso(p.x, p.y + p.h, p.z), iso(p.x, p.y, p.z + p.d),
    iso(p.x + p.w, p.y + p.h, p.z), iso(p.x + p.w, p.y, p.z + p.d), iso(p.x, p.y + p.h, p.z + p.d), iso(p.x + p.w, p.y + p.h, p.z + p.d),
  ]));
  const atras = (a: PainelMundo, b: PainelMundo): number => {
    const t = 0.01;
    if (a.z >= b.z + b.d - t) return 1; // a atrás de b
    if (b.z >= a.z + a.d - t) return -1;
    if (a.y + a.h <= b.y + t) return 1; // a abaixo de b
    if (b.y + b.h <= a.y + t) return -1;
    if (a.x + a.w <= b.x + t) return 1; // a à esquerda de b
    if (b.x + b.w <= a.x + t) return -1;
    return 0;
  };
  const antes: number[][] = Array.from({ length: n }, () => []);
  const grau = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (!sobrepoem(cascos[i], cascos[j])) continue;
      const c = atras(ps[i], ps[j]);
      if (c > 0) { antes[i].push(j); grau[j]++; }
      else if (c < 0) { antes[j].push(i); grau[i]++; }
    }
  // Kahn, desempatando pela profundidade do centro
  const prontos = ps.map((_, i) => i).filter((i) => grau[i] === 0);
  const out: PainelMundo[] = [];
  const feito = new Array(n).fill(false);
  while (out.length < n) {
    if (!prontos.length) {
      // ciclo (raro): avança com o mais afastado ainda por desenhar
      const resto = ps.map((_, i) => i).filter((i) => !feito[i]).sort((a, b) => profundidadeVista(ps[a]) - profundidadeVista(ps[b]));
      prontos.push(resto[0]);
      grau[resto[0]] = 0;
    }
    prontos.sort((a, b) => profundidadeVista(ps[a]) - profundidadeVista(ps[b]));
    const i = prontos.shift()!;
    if (feito[i]) continue;
    feito[i] = true;
    out.push(ps[i]);
    for (const j of antes[i]) if (--grau[j] === 0 && !feito[j]) prontos.push(j);
  }
  return out;
}

export function vistaIso(paineis: PainelMundo[]): Vista {
  const ents: Entidade[] = [];
  for (const p of ordemPintor(paineis)) {
    const { x, y, z, w, h, d } = p;
    const frente: [number, number][] = [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + h, z), iso(x, y + h, z)];
    const topo: [number, number][] = [iso(x, y + h, z), iso(x + w, y + h, z), iso(x + w, y + h, z + d), iso(x, y + h, z + d)];
    const lado: [number, number][] = [iso(x + w, y, z), iso(x + w, y, z + d), iso(x + w, y + h, z + d), iso(x + w, y + h, z)];
    ents.push({ t: "poligono", pts: lado, preenchido: true }, { t: "poligono", pts: topo, preenchido: true }, { t: "poligono", pts: frente, preenchido: p.tipo !== "puxador" });
  }
  return limites(ents);
}

/** Balões numerados com linha de chamada, colocados à esquerda e à direita da vista. */
export function baloes(v: Vista, alvos: { n: string; x: number; y: number }[]): Vista {
  if (!alvos.length) return v;
  const larg = v.x1 - v.x0, alt = v.y1 - v.y0;
  const r = Math.max(larg, alt) * 0.022;
  const cx = (v.x0 + v.x1) / 2;
  const ents: Entidade[] = [...v.ents];
  for (const lado of [-1, 1]) {
    const grupo = alvos.filter((a) => (lado < 0 ? a.x < cx : a.x >= cx)).sort((a, b) => b.y - a.y);
    const xb = lado < 0 ? v.x0 - r * 3 : v.x1 + r * 3;
    let ultimo = Infinity;
    for (const a of grupo) {
      let yb = Math.min(a.y, ultimo - r * 2.6);
      yb = Math.max(yb, v.y0 - alt * 0.1);
      ultimo = yb;
      ents.push({ t: "linha", x1: a.x, y1: a.y, x2: xb - lado * r, y2: yb, fina: true });
      ents.push({ t: "circulo", x: a.x, y: a.y, r: r * 0.12 });
      ents.push({ t: "circulo", x: xb, y: yb, r });
      ents.push({ t: "texto", x: xb, y: yb - r * 0.35, txt: a.n, alt: r * 1.1, centro: true });
    }
  }
  return limites(ents);
}

/** Pontos de chamada (projecção iso) das peças com nº de referência. */
export function alvosIso(paineis: PainelMundo[], numeros: Record<string, string>) {
  const vistos = new Set<string>();
  const out: { n: string; x: number; y: number }[] = [];
  for (const p of paineis) {
    if (!p.ref || !numeros[p.ref] || vistos.has(p.ref)) continue;
    vistos.add(p.ref);
    const [x, y] =
      p.tipo === "frente" ? iso(p.x + p.w * 0.5, p.y + p.h * 0.5, p.z)
      : p.nome.startsWith("Lado direito") ? iso(p.x + p.w, p.y + p.h * 0.55, p.z + p.d * 0.5)
      : p.nome.startsWith("Lado") ? iso(p.x + p.w * 0.5, p.y + p.h * 0.7, p.z)
      : p.tipo === "costa" ? iso(p.x + p.w * 0.5, p.y + p.h, p.z)
      : p.tipo === "rodape" ? iso(p.x + p.w * 0.3, p.y + p.h * 0.5, p.z)
      : iso(p.x + p.w * 0.5, p.y + p.h, p.z + p.d * 0.3);
    out.push({ n: numeros[p.ref], x, y });
  }
  return out;
}

/* ------------------------------------------------------------------ conjunto */

/** Dispõe os móveis de uma divisão pela ordem definida no orçamento. */
export function disposicao(moveis: Movel[]) {
  const baixo = moveis.filter((m) => m.tipo !== "superior" && m.tipo !== "tampo");
  const cima = moveis.filter((m) => m.tipo === "superior");
  const out: { m: Movel; x: number; y: number }[] = [];
  let x = 0;
  for (const m of baixo) {
    x += m.espaco_antes ?? 0;
    for (let i = 0; i < m.qtd; i++) { out.push({ m, x, y: 0 }); x += m.L; }
  }
  x = 0;
  for (const m of cima) {
    x += m.espaco_antes ?? 0;
    for (let i = 0; i < m.qtd; i++) { out.push({ m, x, y: 1450 }); x += m.L; }
  }
  return out;
}

/** Painéis do tampo de bancada (um por troço contínuo de móveis de baixo). */
export function paineisTampo(moveis: Movel[], t?: Tampo | null): PainelMundo[] {
  if (!t?.incluir) return [];
  const baixo = moveis.filter((m) => m.tipo !== "superior" && m.tipo !== "coluna");
  if (!baixo.length) return [];
  const yBase = Math.max(...baixo.map((m) => alturaPes(m) + m.A));
  const trocos = t.comprimento != null ? [{ x: trocosTampo(moveis)[0]?.x ?? 0, comp: t.comprimento }] : trocosTampo(moveis);
  return trocos.map((tr, i) => ({
    nome: `Tampo ${i + 1}`,
    tipo: "tampo" as const,
    x: tr.x,
    y: yBase,
    z: -(E + 2 + t.saliencia),
    w: tr.comp,
    h: t.espessura,
    d: t.profundidade,
    ref: t.codigo,
  }));
}

export function alcadoConjunto(moveis: Movel[], tampo?: Tampo | null): Vista {
  const lista = disposicao(moveis);
  const ents: Entidade[] = [];
  let maxX = 0, maxY = 0;
  for (const { m, x, y } of lista) {
    ents.push(...entidadesFrente(m, x, y));
    ents.push({ t: "texto", x: x + m.L / 2, y: y + alturaPes(m) + 25, txt: m.ref, alt: 35, centro: true });
    maxX = Math.max(maxX, x + m.L);
    maxY = Math.max(maxY, y + m.A + alturaPes(m));
  }
  for (const tp of paineisTampo(moveis, tampo)) {
    ents.push(...rect(tp.x, tp.y, tp.w, tp.h));
    ents.push({ t: "texto", x: tp.x + tp.w / 2, y: tp.y + tp.h + 25, txt: `TAMPO ${tampo!.espessura}mm`, alt: 30, centro: true });
    ents.push({ t: "cota", x1: tp.x + tp.w, y1: tp.y, x2: tp.x + tp.w, y2: tp.y + tp.h, off: 60 });
    ents.push({ t: "cota", x1: tp.x, y1: tp.y + tp.h, x2: tp.x + tp.w, y2: tp.y + tp.h, off: 90 });
    maxY = Math.max(maxY, tp.y + tp.h);
  }
  ents.push({ t: "linha", x1: -150, y1: 0, x2: maxX + 150, y2: 0, fina: true });
  ents.push({ t: "cota", x1: 0, y1: maxY, x2: maxX, y2: maxY, off: 260 });
  const baixo = lista.filter((a) => a.y === 0), cima = lista.filter((a) => a.y > 0);
  for (const { m, x } of baixo) ents.push({ t: "cota", x1: x, y1: 0, x2: x + m.L, y2: 0, off: -140 });
  if (cima.length) {
    const topoCima = Math.max(...cima.map((a) => a.y + a.m.A));
    for (const { m, x } of cima) ents.push({ t: "cota", x1: x, y1: topoCima, x2: x + m.L, y2: topoCima, off: 130 });
  }
  // cadeia de alturas à esquerda
  const topoTampo = paineisTampo(moveis, tampo).map((tp) => tp.y + tp.h);
  const alturas = [...new Set([0, ...topoTampo, ...lista.flatMap(({ m, y }) => [y, y + alturaPes(m), y + alturaPes(m) + m.A])])].sort((a, b) => a - b);
  for (let i = 0; i < alturas.length - 1; i++) if (alturas[i + 1] - alturas[i] > 20) ents.push({ t: "cota", x1: 0, y1: alturas[i], x2: 0, y2: alturas[i + 1], off: -150 });
  ents.push({ t: "cota", x1: 0, y1: 0, x2: 0, y2: maxY, off: -300 });
  return limites(ents);
}

/** Corte lateral do conjunto: perfis do primeiro inferior e do primeiro superior, encostados à parede. */
export function ladoConjunto(moveis: Movel[], tampo?: Tampo | null): Vista | null {
  const lista = disposicao(moveis);
  const fundo = Math.max(...lista.map((a) => a.m.P));
  const ents: Entidade[] = [];
  const vistos = new Set<string>();
  for (const { m, y } of lista) {
    const k = m.tipo === "superior" ? "s" : m.tipo === "coluna" ? "c" : "i";
    if (vistos.has(k) || k === "c") continue;
    vistos.add(k);
    ents.push(...entidadesLado(m, 0, y));
    const H = y + alturaPes(m) + m.A;
    ents.push({ t: "cota", x1: 0, y1: H, x2: m.P, y2: H, off: 40 });
  }
  const tps = paineisTampo(moveis, tampo);
  if (tps.length) {
    const inf = lista.find((a) => a.m.tipo !== "superior" && a.m.tipo !== "coluna")?.m;
    if (inf) {
      const tp = tps[0];
      const h0 = inf.P - (tp.z + tp.d);
      ents.push(...rect(h0, tp.y, tp.d, tp.h));
      ents.push({ t: "cota", x1: h0, y1: tp.y + tp.h, x2: h0 + tp.d, y2: tp.y + tp.h, off: 80 });
    }
  }
  if (!ents.length) return null;
  ents.push({ t: "linha", x1: -8, y1: -60, x2: -8, y2: 2400, fina: true }); // parede
  ents.push({ t: "linha", x1: -100, y1: 0, x2: fundo + 200, y2: 0, fina: true });
  return limites(ents);
}

/** Pontos de chamada dos produtos 10* na perspectiva do conjunto (frente de cada móvel e topo do tampo). */
export function alvosConjunto(moveis: Movel[], tampo: Tampo | null | undefined, numeros: Record<string, string>) {
  const disp = disposicao(moveis);
  const fundo = Math.max(...disp.map((d) => d.m.P));
  const out: { n: string; x: number; y: number }[] = [];
  const vistos = new Set<string>();
  for (const { m, x, y } of disp) {
    if (vistos.has(m.id) || !numeros[m.ref]) continue;
    vistos.add(m.id);
    const [px, py] = iso(x + m.L * 0.5, y + alturaPes(m) + m.A * 0.45, fundo - m.P - E - 2);
    out.push({ n: numeros[m.ref], x: px, y: py });
  }
  const tp = paineisTampo(moveis, tampo)[0];
  if (tp && numeros["TB01"]) {
    const pInf = Math.max(...disp.filter((d) => d.m.tipo !== "superior" && d.m.tipo !== "coluna").map((d) => d.m.P), fundo);
    const [px, py] = iso(tp.x + tp.w * 0.5, tp.y + tp.h, tp.z + (fundo - pInf) + tp.d * 0.5);
    out.push({ n: numeros["TB01"], x: px, y: py });
  }
  return out;
}

export function perspectivaConjunto(moveis: Movel[], tampo?: Tampo | null): Vista {
  const disp = disposicao(moveis);
  const fundo = Math.max(...disp.map((d) => d.m.P));
  const pInf = Math.max(...disp.filter((d) => d.m.tipo !== "superior" && d.m.tipo !== "coluna").map((d) => d.m.P), fundo);
  const tampos = paineisTampo(moveis, tampo).map((p) => ({ ...p, z: p.z + (fundo - pInf) }));
  return vistaIso([...disp.flatMap(({ m, x, y }) => paineisMundo(m, x, y, fundo - m.P)), ...tampos]);
}
