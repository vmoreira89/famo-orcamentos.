/**
 * Geometria dos desenhos (em mm, origem no canto inferior esquerdo de cada vista).
 * As regras de furação seguem a INT.231 (proposta inicial, a validar pela FAMO).
 */
import type { Movel, Peca } from "../orcamento";
import { TIPOS_MOVEL } from "../orcamento";

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

function limites(ents: Entidade[], margem = 0): Vista {
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

const rect = (x: number, y: number, w: number, h: number, extra: Partial<{ tracejado: boolean; fina: boolean }> = {}): Entidade[] => [
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

/** Posições das dobradiças ao longo da porta (a 100 mm dos topos). */
export function posicoesDobradica(altura: number): number[] {
  const n = altura <= 900 ? 2 : altura <= 1600 ? 3 : 4;
  if (n === 2) return [100, altura - 100];
  const passo = (altura - 200) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(100 + i * passo));
}

/**
 * Furos na peça. Coordenadas: u ao longo do comprimento (c), v ao longo da largura (l).
 * v = 0 é a aresta da frente nos painéis do corpo.
 */
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
    if (m.tipo === "inferior" || m.tipo === "gaveteiro") {
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
    // bases das dobradiças (Ø5x12 a 37 e 69 mm da frente)
    if (m.portas > 0 && m.tipo_porta !== "Correr") {
      const lado = p.designacao.toLowerCase().includes("direito") ? "dir" : "esq";
      const abertura = (m.checklist.abertura ?? "").toLowerCase();
      const recebe = m.portas >= 2 || (abertura.includes("esquerda") ? lado === "esq" : lado === "dir");
      if (recebe) {
        const altPorta = p.c - (m.gavetas > 0 ? m.gavetas * 183 : 0) - 6;
        for (const u of posicoesDobradica(altPorta)) for (const v of [37, 69]) f.push({ u: u + 3, v, d: 5, prof: 12, face: "F", desc: "base dobradiça" });
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

/* ------------------------------------------------------------------ vistas de um móvel */

function frentes(m: Movel, x0: number, y0: number): Entidade[] {
  const ents: Entidade[] = [];
  const f = 3;
  const altG = m.gavetas > 0 ? (m.portas > 0 ? 180 : (m.A - f * (m.gavetas + 1)) / m.gavetas) : 0;
  let y = y0 + m.A - f;
  for (let g = 0; g < m.gavetas; g++) {
    ents.push(...rect(x0 + f, y - altG, m.L - 2 * f, altG, { fina: true }));
    ents.push({ t: "linha", x1: x0 + m.L / 2 - 40, y1: y - altG / 2, x2: x0 + m.L / 2 + 40, y2: y - altG / 2 });
    y -= altG + f;
  }
  if (m.portas > 0) {
    const h = y - (y0 + f);
    const w = (m.L - f * (m.portas + 1)) / m.portas;
    for (let i = 0; i < m.portas; i++) {
      const xi = x0 + f + i * (w + f);
      ents.push(...rect(xi, y0 + f, w, h, { fina: true }));
      // indicação de abertura (triângulo tracejado)
      const esq = m.portas === 1 ? !(m.checklist.abertura ?? "").toLowerCase().includes("esquerda") : i === 0;
      const xa = esq ? xi : xi + w, xb = esq ? xi + w : xi;
      ents.push({ t: "linha", x1: xb, y1: y0 + f, x2: xa, y2: y0 + f + h / 2, tracejado: true, fina: true });
      ents.push({ t: "linha", x1: xa, y1: y0 + f + h / 2, x2: xb, y2: y0 + f + h, tracejado: true, fina: true });
    }
  }
  return ents;
}

export function vistaFrenteMovel(m: Movel, comCotas = true): Vista {
  const pes = TIPOS_MOVEL[m.tipo].pes ? 100 : 0;
  const ents: Entidade[] = [...rect(0, pes, m.L, m.A), ...frentes(m, 0, pes)];
  if (pes) ents.push(...rect(0, 0, m.L, pes, { fina: true }));
  if (comCotas) {
    ents.push({ t: "cota", x1: 0, y1: m.A + pes, x2: m.L, y2: m.A + pes, off: 60 });
    ents.push({ t: "cota", x1: 0, y1: 0, x2: 0, y2: m.A + pes, off: -90 });
    if (pes) ents.push({ t: "cota", x1: 0, y1: pes, x2: 0, y2: m.A + pes, off: -45 });
  }
  return limites(ents);
}

export function vistaLadoMovel(m: Movel): Vista {
  const pes = TIPOS_MOVEL[m.tipo].pes ? 100 : 0;
  const ents: Entidade[] = [...rect(0, pes, m.P, m.A)];
  ents.push({ t: "linha", x1: m.P - m.costa_e - 6, y1: pes + E, x2: m.P - m.costa_e - 6, y2: pes + m.A - E, tracejado: true, fina: true });
  for (let i = 1; i <= m.prateleiras; i++) {
    const y = pes + E + ((m.A - 2 * E) * i) / (m.prateleiras + 1);
    ents.push({ t: "linha", x1: 0, y1: y, x2: m.P - m.costa_e - 6, y2: y, tracejado: true, fina: true });
  }
  if (pes) ents.push(...rect(30, 0, m.P - 60, pes, { fina: true }));
  ents.push({ t: "cota", x1: 0, y1: m.A + pes, x2: m.P, y2: m.A + pes, off: 60 });
  return limites(ents);
}

export function vistaTopoMovel(m: Movel): Vista {
  const ents: Entidade[] = [...rect(0, 0, m.L, m.P), ...rect(E, m.costa_e + 6, m.L - 2 * E, m.P - m.costa_e - 6, { tracejado: true, fina: true })];
  return limites(ents);
}

/** Perspectiva oblíqua simples (caixas preenchidas a branco, desenhadas de trás para a frente). */
export function perspectiva(caixas: { x: number; y: number; z: number; L: number; A: number; P: number; m?: Movel }[]): Vista {
  const k = 0.5, c = Math.cos(Math.PI / 4) * k, s = Math.sin(Math.PI / 4) * k;
  const pr = (x: number, y: number, z: number): [number, number] => [x + z * c, y + z * s];
  const ord = [...caixas].sort((a, b) => b.z - a.z || a.y - b.y || a.x - b.x);
  const ents: Entidade[] = [];
  for (const b of ord) {
    const { x, y, z, L, A, P } = b;
    const frente: [number, number][] = [pr(x, y, z), pr(x + L, y, z), pr(x + L, y + A, z), pr(x, y + A, z)];
    const topo: [number, number][] = [pr(x, y + A, z), pr(x + L, y + A, z), pr(x + L, y + A, z + P), pr(x, y + A, z + P)];
    const lado: [number, number][] = [pr(x + L, y, z), pr(x + L, y, z + P), pr(x + L, y + A, z + P), pr(x + L, y + A, z)];
    ents.push({ t: "poligono", pts: lado, preenchido: true }, { t: "poligono", pts: topo, preenchido: true }, { t: "poligono", pts: frente, preenchido: true });
    if (b.m) {
      for (const e of frentes(b.m, x, y)) if (e.t === "linha") {
        const [a1, a2] = pr(e.x1, e.y1, z), [b1, b2] = pr(e.x2, e.y2, z);
        ents.push({ ...e, x1: a1, y1: a2, x2: b1, y2: b2 });
      }
    }
  }
  return limites(ents);
}

export function caixaMovel(m: Movel, x: number, y = 0, z = 0) {
  const pes = TIPOS_MOVEL[m.tipo].pes ? 100 : 0;
  return { x, y: y + pes, z, L: m.L, A: m.A, P: m.P, m };
}

/* ------------------------------------------------------------------ alçado do conjunto */

/** Dispõe os móveis de uma divisão: inferiores/colunas no chão, superiores a 1450 mm. */
export function disposicao(moveis: Movel[]) {
  const baixo = moveis.filter((m) => m.tipo !== "superior");
  const cima = moveis.filter((m) => m.tipo === "superior");
  const out: { m: Movel; x: number; y: number }[] = [];
  let x = 0;
  for (const m of baixo) for (let i = 0; i < m.qtd; i++) { out.push({ m, x, y: 0 }); x += m.L; }
  // superiores alinhados à esquerda, por cima dos inferiores (as colunas ficam de fora)
  x = out.find((o) => o.m.tipo !== "coluna")?.x ?? 0;
  for (const m of cima) for (let i = 0; i < m.qtd; i++) { out.push({ m, x, y: 1450 }); x += m.L; }
  return out;
}

export function alcadoConjunto(moveis: Movel[]): Vista {
  const ents: Entidade[] = [];
  const lista = disposicao(moveis);
  let maxX = 0, maxY = 0;
  for (const { m, x, y } of lista) {
    const v = deslocar(vistaFrenteMovel(m, false), x, y);
    ents.push(...v.ents);
    ents.push({ t: "texto", x: x + m.L / 2, y: y + (TIPOS_MOVEL[m.tipo].pes ? 100 : 0) + 25, txt: m.ref, alt: 40, centro: true });
    maxX = Math.max(maxX, x + m.L);
    maxY = Math.max(maxY, y + m.A + (TIPOS_MOVEL[m.tipo].pes ? 100 : 0));
  }
  ents.push({ t: "linha", x1: -100, y1: 0, x2: maxX + 100, y2: 0, fina: true }); // chão
  ents.push({ t: "cota", x1: 0, y1: maxY, x2: maxX, y2: maxY, off: 150 });
  ents.push({ t: "cota", x1: 0, y1: 0, x2: 0, y2: maxY, off: -200 });
  // cadeia de larguras dos móveis de baixo
  for (const { m, x, y } of lista.filter((a) => a.y === 0)) ents.push({ t: "cota", x1: x, y1: 0, x2: x + m.L, y2: 0, off: -120 });
  return limites(ents);
}

export function perspectivaConjunto(moveis: Movel[]): Vista {
  const disp = disposicao(moveis);
  const fundo = Math.max(...disp.map((d) => d.m.P)); // todos encostados à parede
  return perspectiva(disp.map(({ m, x, y }) => caixaMovel(m, x, y, fundo - m.P)));
}
