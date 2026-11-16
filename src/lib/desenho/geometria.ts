/**
 * Geometria dos desenhos (em mm, origem no canto inferior esquerdo de cada vista).
 * As regras de furação seguem a INT.231 (proposta inicial, a validar pela FAMO).
 */
import type { Movel, Peca } from "../orcamento";
import { comprimentoCorredica } from "../orcamento";
import { frentesDoMovel, posicoesDobradica, puxadorDe } from "./modelo3d";
export { posicoesDobradica };

export type Entidade =
  | { t: "linha"; x1: number; y1: number; x2: number; y2: number; tracejado?: boolean; fina?: boolean }
  | { t: "circulo"; x: number; y: number; r: number; cruz?: boolean }
  | { t: "poligono"; pts: [number, number][]; preenchido?: boolean }
  | { t: "texto"; x: number; y: number; txt: string; alt?: number; ang?: number; centro?: boolean }
  | { t: "cota"; x1: number; y1: number; x2: number; y2: number; off: number; txt?: string };

export type Vista = { ents: Entidade[]; x0: number; y0: number; x1: number; y1: number };

export type Furo = { u: number; v: number; d: number; prof: number | "vazado"; face: "F" | "T"; desc: string };

const E = 19;

/* ------------------------------------------------------------------ util */

export function limites(ents: Entidade[], margem = 0): Vista {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ac = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const e of ents) {
    if (e.t === "linha") { ac(e.x1, e.y1); ac(e.x2, e.y2); }
    else if (e.t === "circulo") { ac(e.x - e.r, e.y - e.r); ac(e.x + e.r, e.y + e.r); }
    else if (e.t === "poligono") e.pts.forEach(([x, y]) => ac(x, y));
    else if (e.t === "texto") ac(e.x, e.y);
    else if (e.t === "cota") {
      // a cota fica deslocada para fora da peça
      const horiz = Math.abs(e.y1 - e.y2) < Math.abs(e.x1 - e.x2);
      ac(e.x1, e.y1); ac(e.x2, e.y2);
      if (horiz) ac(e.x1, e.y1 + e.off * 1.6); else ac(e.x1 + e.off * 1.6, e.y1);
    }
  }
  return { ents, x0: x0 - margem, y0: y0 - margem, x1: x1 + margem, y1: y1 + margem };
}

export function deslocar(v: Vista, dx: number, dy: number): Vista {
  const ents = v.ents.map((e): Entidade => {
    switch (e.t) {
      case "linha": return { ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy };
      case "circulo": return { ...e, x: e.x + dx, y: e.y + dy };
      case "poligono": return { ...e, pts: e.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
      case "texto": return { ...e, x: e.x + dx, y: e.y + dy };
      case "cota": return { ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy };
    }
  });
  return { ents, x0: v.x0 + dx, y0: v.y0 + dy, x1: v.x1 + dx, y1: v.y1 + dy };
}

export function juntar(vs: Vista[]): Vista {
  return limites(vs.flatMap((v) => v.ents));
}

export const rect = (x: number, y: number, w: number, h: number, extra: Partial<{ tracejado: boolean; fina: boolean }> = {}): Entidade[] => [
  { t: "linha", x1: x, y1: y, x2: x + w, y2: y, ...extra },
  { t: "linha", x1: x + w, y1: y, x2: x + w, y2: y + h, ...extra },
  { t: "linha", x1: x + w, y1: y + h, x2: x, y2: y + h, ...extra },
  { t: "linha", x1: x, y1: y + h, x2: x, y2: y, ...extra },
];

/* ------------------------------------------------------------------ furação por peça */

export function papel(p: Peca): string {
  const d = p.designacao.toLowerCase();
  if (d.startsWith("lado")) return "lado";
  if (d.includes("divisória")) return "divisoria";
  if (d.startsWith("fundo gaveta")) return "fundo_gaveta";
  if (d.startsWith("lateral gaveta")) return "lateral_gaveta";
  if (d.startsWith("traseira")) return "traseira_gaveta";
  if (d.startsWith("frente gaveta")) return "frente_gaveta";
  if (d.startsWith("fundo") || d.startsWith("cúpula")) return "horizontal";
  if (d.startsWith("travessa")) return "travessa";
  if (d.startsWith("costa")) return "costa";
  if (d.startsWith("prateleira")) return "prateleira";
  if (d.startsWith("porta")) return "porta";
  if (d.startsWith("rodapé")) return "rodape";
  return "outra";
}

/**
 * Furos na peça. Coordenadas: u ao longo do comprimento (c), v ao longo da largura (l).
 * v = 0 é a aresta da frente nos painéis do corpo.
 */
const TIPOS_PES = (m: Movel) => (m.tipo === "inferior" || m.tipo === "gaveteiro" || m.tipo === "coluna" || m.tipo === "roupeiro" ? 100 : 0);

export function furacao(p: Peca, m: Movel): Furo[] {
  const f: Furo[] = [];
  const pp = papel(p);
  const juntaTopo = (u: number, larg: number) => {
    // ligação a uma peça horizontal: cavilha a 70 mm e minifix a 100 mm de cada aresta
    for (const v of [70, larg - 70]) f.push({ u, v, d: 8, prof: 15, face: "F", desc: "cavilha 8x35" });
    for (const v of [100, larg - 100]) f.push({ u, v, d: 8, prof: 13, face: "F", desc: "perno minifix" });
    if (larg > 500) f.push({ u, v: Math.round(larg / 2), d: 8, prof: 15, face: "F", desc: "cavilha 8x35" });
  };
  if (pp === "lado" || pp === "divisoria") {
    const larg = p.l;
    juntaTopo(E / 2, larg);
    if (m.topo_sobre_ilhargas) {
      // tampo/travessas por cima das ilhargas: cavilhas no topo superior da ilharga
      const vs = m.tipo === "inferior" || m.tipo === "gaveteiro" ? [30, 70, larg - 70, larg - 30] : [70, larg - 70, ...(larg > 500 ? [Math.round(larg / 2)] : [])];
      for (const v of vs) f.push({ u: p.c, v, d: 8, prof: 23, face: "T", desc: "cavilha 8x35 (topo)" });
    } else if (m.tipo === "inferior" || m.tipo === "gaveteiro") {
      for (const v of [30, 70, larg - 70, larg - 30]) f.push({ u: p.c - E / 2, v, d: 8, prof: 15, face: "F", desc: "cavilha 8x35 (travessa)" });
    } else juntaTopo(p.c - E / 2, larg);
    // suportes de prateleira: Ø5x12, passo 32, a 37 mm da frente e de trás
    if (m.prateleiras > 0) {
      const util = p.c - 2 * E;
      for (let i = 1; i <= m.prateleiras; i++) {
        const uc = E + (util * i) / (m.prateleiras + 1);
        for (const k of [-32, 0, 32]) for (const v of [37, larg - 37 - m.costa_e]) f.push({ u: Math.round(uc + k), v, d: 5, prof: 12, face: "F", desc: "suporte prateleira" });
      }
    }
    // corrediças das gavetas: Ø5x12 a 37 mm da frente e depois a cada 224 mm (passo 32)
    if (m.gavetas > 0) {
      const y0 = TIPOS_PES(m);
      const Lc = comprimentoCorredica(m.P, m.costa_e);
      const zs = [37, 37 + 224, ...(Lc >= 450 ? [37 + 448] : [])].filter((z) => z < Lc);
      for (const fr of frentesDoMovel(m).filter((x) => x.tipo === "gaveta")) {
        const u = Math.round(fr.y - y0 + 37);
        for (const v of zs) f.push({ u, v, d: 5, prof: 12, face: "F", desc: "corrediça gaveta" });
      }
    }
    // bases das dobradiças (Ø5x12 a 37 e 69 mm da frente)
    if (m.portas > 0 && m.tipo_porta !== "Correr") {
      const lado = p.designacao.toLowerCase().includes("direito") ? "dir" : "esq";
      // cada porta com dobradiças deste lado: bases à altura das dobradiças dessa porta
      const y0 = TIPOS_PES(m);
      for (const fr of frentesDoMovel(m).filter((x) => x.tipo === "porta" && (x.dobradicaEsq ? lado === "esq" : lado === "dir"))) {
        for (const u of posicoesDobradica(fr.h)) for (const v of [37, 69]) f.push({ u: Math.round(fr.y - y0 + u), v, d: 5, prof: 12, face: "F", desc: "base dobradiça" });
      }
    }
  } else if (pp === "horizontal") {
    // topos ligados aos lados: cavilhas em topo e caixa minifix Ø15 a 34 mm do topo
    for (const u of [0, p.c]) {
      for (const v of [70, p.l - 70]) f.push({ u, v, d: 8, prof: 23, face: "T", desc: "cavilha 8x35 (topo)" });
      for (const v of [100, p.l - 100]) f.push({ u: u === 0 ? 34 : p.c - 34, v, d: 15, prof: 13, face: "F", desc: "caixa minifix" });
    }
  } else if (pp === "travessa") {
    for (const u of [0, p.c]) for (const v of [30, 70]) f.push({ u, v, d: 8, prof: 23, face: "T", desc: "cavilha 8x35 (topo)" });
  } else if (pp === "porta") {
    // copa da dobradiça Ø35x13 a 22,5 mm da aresta
    for (const u of posicoesDobradica(p.c)) f.push({ u, v: 22.5, d: 35, prof: 13, face: "F", desc: "copa dobradiça" });
    // puxador (2 furos Ø5 vazados, entre-eixo 128) no lado oposto às dobradiças
    const fr = frentesDoMovel(m).find((x) => x.tipo === "porta");
    const px = fr ? puxadorDe(m, { ...fr, dobradicaEsq: true }) : null;
    if (fr && px) {
      const uc = px.y + px.h / 2 - fr.y, vc = px.x + px.w / 2 - fr.x;
      for (const k of [-64, 64]) f.push({ u: Math.round(uc + k), v: Math.round(vc), d: 5, prof: "vazado", face: "F", desc: "puxador" });
    }
  } else if (pp === "frente_gaveta") {
    const fr = frentesDoMovel(m).find((x) => x.tipo === "gaveta");
    if (fr && puxadorDe(m, fr)) for (const k of [-64, 64]) f.push({ u: Math.round(p.c / 2 + k), v: Math.round(p.l / 2), d: 5, prof: "vazado", face: "F", desc: "puxador" });
    // fixação à caixa da gaveta (Ø8x12, a 50 mm das extremidades)
    for (const u of [50, p.c - 50]) f.push({ u, v: Math.round(p.l / 2), d: 8, prof: 12, face: "F", desc: "fixação frente" });
  } else if (pp === "lateral_gaveta") {
    // ligação à traseira e à frente
    for (const v of [p.l * 0.3, p.l * 0.7]) { f.push({ u: 0, v: Math.round(v), d: 8, prof: 23, face: "T", desc: "cavilha 8x35 (topo)" }); f.push({ u: p.c - 8, v: Math.round(v), d: 8, prof: 12, face: "F", desc: "cavilha traseira" }); }
  }
  return f;
}

/** Agrupa furos iguais para a legenda ("8x FURO Ø8x15"). */
export function legendaFuros(furos: Furo[]): string[] {
  const g = new Map<string, number>();
  for (const f of furos) {
    const k = `FURO Ø${f.d}${f.prof === "vazado" ? " VAZADO" : `x${f.prof}`}${f.face === "T" ? " EM TOPO" : ""} (${f.desc})`;
    g.set(k, (g.get(k) ?? 0) + 1);
  }
  return [...g.entries()].map(([k, n]) => `${n}x ${k}`);
}

/* ------------------------------------------------------------------ vista de uma peça */

/** Vista de frente (comprimento na vertical) + vista do topo/espessura à esquerda. */
export function vistaPeca(p: Peca, furos: Furo[]): Vista {
  const ents: Entidade[] = [];
  const W = p.l, H = p.c, gap = Math.max(40, Math.min(120, W * 0.25));
  const xf = p.e + gap; // início da vista de frente
  // vista da espessura
  ents.push(...rect(0, 0, p.e, H));
  for (const fu of furos.filter((x) => x.face === "T")) {
    const y = fu.u;
    const prof = typeof fu.prof === "number" ? fu.prof : 0;
    const yy = y === 0 ? 0 : H;
    const dir = y === 0 ? 1 : -1;
    ents.push({ t: "linha", x1: p.e / 2 - fu.d / 2, y1: yy, x2: p.e / 2 - fu.d / 2, y2: yy + dir * prof, tracejado: true, fina: true });
    ents.push({ t: "linha", x1: p.e / 2 + fu.d / 2, y1: yy, x2: p.e / 2 + fu.d / 2, y2: yy + dir * prof, tracejado: true, fina: true });
  }
  // vista de frente
  ents.push(...rect(xf, 0, W, H));
  // furos de face
  for (const fu of furos.filter((x) => x.face === "F")) ents.push({ t: "circulo", x: xf + fu.v, y: fu.u, r: fu.d / 2, cruz: true });
  // seta do veio (ao longo do comprimento)
  const sx = xf + W / 2, sy0 = H * 0.42, sy1 = H * 0.58;
  ents.push({ t: "linha", x1: sx, y1: sy0, x2: sx, y2: sy1 });
  ents.push({ t: "poligono", pts: [[sx, sy1], [sx - Math.min(12, W / 15), sy1 - Math.min(40, H / 10)], [sx, sy1 - Math.min(40, H / 10)]] });
  // cotas gerais
  const off = Math.max(25, Math.min(H, W) * 0.08);
  ents.push({ t: "cota", x1: 0, y1: 0, x2: 0, y2: H, off: -off * 1.6 });
  ents.push({ t: "cota", x1: xf, y1: H, x2: xf + W, y2: H, off: off * 1.8 });
  ents.push({ t: "cota", x1: 0, y1: H, x2: p.e, y2: H, off: off * 1.8 });
  // cotas de posição dos furos (em cadeia)
  const us = [...new Set(furos.filter((x) => x.face === "F").map((x) => Math.round(x.u * 10) / 10))].sort((a, b) => a - b);
  const vs = [...new Set(furos.filter((x) => x.face === "F").map((x) => Math.round(x.v * 10) / 10))].sort((a, b) => a - b);
  if (us.length) {
    const pts = [0, ...us, H].filter((v, i, a) => i === 0 || v - a[i - 1] > 0.5);
    for (let i = 0; i < pts.length - 1; i++) ents.push({ t: "cota", x1: xf + W, y1: pts[i], x2: xf + W, y2: pts[i + 1], off: off });
  }
  if (vs.length) {
    const pts = [0, ...vs, W].filter((v, i, a) => i === 0 || v - a[i - 1] > 0.5);
    for (let i = 0; i < pts.length - 1; i++) ents.push({ t: "cota", x1: xf + pts[i], y1: H, x2: xf + pts[i + 1], y2: H, off: off * 0.8 });
  }
  return limites(ents);
}

