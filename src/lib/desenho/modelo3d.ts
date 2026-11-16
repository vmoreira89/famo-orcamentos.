/**
 * Modelo 3D simplificado de um móvel, painel a painel (caixas alinhadas com os eixos).
 * Eixos: x para a direita, y para cima, z para trás (z = 0 é a face da frente do corpo).
 * As frentes (portas/gavetas) ficam à frente do corpo (z negativo).
 */
import type { Movel } from "../orcamento";
import { TIPOS_MOVEL } from "../orcamento";
import { comprimentoCorredica, disposicaoPortas } from "../orcamento";

/** Posições das dobradiças ao longo da porta (a 100 mm dos topos). */
export function posicoesDobradica(altura: number): number[] {
  const n = altura <= 900 ? 2 : altura <= 1600 ? 3 : 4;
  if (n === 2) return [100, altura - 100];
  const passo = (altura - 200) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(100 + i * passo));
}

export type TipoPainel = "corpo" | "interior" | "costa" | "frente" | "rodape" | "puxador" | "pe" | "dobradica" | "tampo" | "gaveta" | "corredica";

export type Painel = {
  nome: string;
  tipo: TipoPainel;
  x: number; y: number; z: number; // canto (mín.)
  w: number; h: number; d: number; // dimensões em x, y, z
  ref?: string; // código da peça (para balões)
};

const E = 19;
const FOLGA = 3;
export const ALT_PES = 100;
export const RECUO_RODAPE = 50;

export function alturaPes(m: Movel) {
  return TIPOS_MOVEL[m.tipo].pes ? ALT_PES : 0;
}

export type Frente = { tipo: "porta" | "gaveta"; x: number; y: number; w: number; h: number; dobradicaEsq: boolean; n?: number };

/** Divisão da face da frente em gavetas (em cima) e portas (em baixo). */
export function frentesDoMovel(m: Movel): Frente[] {
  const y0 = alturaPes(m);
  const out: Frente[] = [];
  const altG = m.gavetas > 0 ? (m.portas > 0 ? 180 : (m.A - FOLGA * (m.gavetas + 1)) / m.gavetas) : 0;
  let y = y0 + m.A - FOLGA;
  for (let g = 0; g < m.gavetas; g++) {
    out.push({ tipo: "gaveta", x: FOLGA, y: y - altG, w: m.L - 2 * FOLGA, h: altG, dobradicaEsq: false });
    y -= altG + FOLGA;
  }
  if (m.portas > 0) {
    const h = y - (y0 + FOLGA);
    const abertura = (m.checklist.abertura ?? "").toLowerCase();
    if (m.portas > 1 && disposicaoPortas(m) === "sobrepostas") {
      // portas umas sobre as outras, numeradas de cima (1) para baixo
      const hp = (h - FOLGA * (m.portas - 1)) / m.portas;
      for (let i = 0; i < m.portas; i++)
        out.push({ tipo: "porta", x: FOLGA, y: y - (i + 1) * hp - i * FOLGA, w: m.L - 2 * FOLGA, h: hp, dobradicaEsq: !abertura.includes("direita"), n: i + 1 });
    } else {
      const w = (m.L - FOLGA * (m.portas + 1)) / m.portas;
      for (let i = 0; i < m.portas; i++) {
        const esq = m.portas === 1 ? !abertura.includes("direita") : i === 0;
        out.push({ tipo: "porta", x: FOLGA + i * (w + FOLGA), y: y0 + FOLGA, w, h, dobradicaEsq: esq, n: i + 1 });
      }
    }
  }
  return out;
}

function temPuxador(m: Movel) {
  const p = (m.puxador || "").toLowerCase();
  return !(p.includes("gola") || p.includes("push") || p.includes("embutido"));
}

/** Posição do puxador (barra de 160 mm) numa frente. */
export function puxadorDe(m: Movel, f: Frente): { x: number; y: number; w: number; h: number } | null {
  if (!temPuxador(m)) return null;
  const comp = Math.min(160, f.w * 0.5);
  if (f.tipo === "gaveta") return { x: f.x + f.w / 2 - comp / 2, y: f.y + f.h / 2 - 6, w: comp, h: 12 };
  // portas: puxador vertical no lado oposto às dobradiças; em cima nos inferiores, em baixo nos superiores
  const xp = f.dobradicaEsq ? f.x + f.w - 45 : f.x + 33;
  const comprV = Math.min(160, f.h * 0.4);
  const yp = m.tipo === "superior" ? f.y + 60 : f.y + f.h - 60 - comprV;
  return { x: xp, y: yp, w: 12, h: comprV };
}

export function modelo3d(m: Movel): Painel[] {
  const L = m.L, A = m.A, P = m.P, ec = m.costa_e;
  const y0 = alturaPes(m);
  const ps: Painel[] = [];
  if (m.tipo === "tampo") return [{ nome: "Tampo", tipo: "tampo", x: 0, y: 0, z: 0, w: L, h: A, d: P, ref: m.pecas[0]?.codigo }];
  const ref = (nome: string) => m.pecas.find((p) => p.designacao.toLowerCase().startsWith(nome.toLowerCase()))?.codigo;
  // costa aplicada (por trás, a toda a medida) ou encastrada (entre lados, fundo e cúpula)
  const aplicada = ec > 0 && (m.checklist.costa ?? "").toLowerCase().startsWith("aplicada");
  const Pc = aplicada ? P - ec : P; // profundidade dos painéis do corpo
  // tampo/travessas por dentro das ilhargas (padrão) ou por cima (ilhargas mais curtas 19 mm)
  const sobre = !!m.topo_sobre_ilhargas;
  const hL = sobre ? A - E : A, xt = sobre ? 0 : E, wt = sobre ? L : L - 2 * E;
  ps.push({ nome: "Lado esquerdo", tipo: "corpo", x: 0, y: y0, z: 0, w: E, h: hL, d: Pc, ref: ref("Lado esquerdo") });
  ps.push({ nome: "Lado direito", tipo: "corpo", x: L - E, y: y0, z: 0, w: E, h: hL, d: Pc, ref: ref("Lado direito") });
  ps.push({ nome: "Fundo", tipo: "corpo", x: E, y: y0, z: 0, w: L - 2 * E, h: E, d: Pc, ref: ref("Fundo") });
  if (m.tipo === "inferior" || m.tipo === "gaveteiro") {
    ps.push({ nome: "Travessa frente", tipo: "corpo", x: xt, y: y0 + A - E, z: 0, w: wt, h: E, d: 100, ref: ref("Travessa") });
    ps.push({ nome: "Travessa trás", tipo: "corpo", x: xt, y: y0 + A - E, z: Pc - (aplicada ? 0 : ec) - 100, w: wt, h: E, d: 100, ref: ref("Travessa") });
  } else {
    ps.push({ nome: "Cúpula", tipo: "corpo", x: xt, y: y0 + A - E, z: 0, w: wt, h: E, d: Pc, ref: ref("Cúpula") });
  }
  if (ec > 0) {
    if (aplicada) ps.push({ nome: "Costa", tipo: "costa", x: 0, y: y0, z: P - ec, w: L, h: A, d: ec, ref: ref("Costa") });
    else ps.push({ nome: "Costa", tipo: "costa", x: E, y: y0 + E, z: P - ec, w: L - 2 * E, h: A - 2 * E, d: ec, ref: ref("Costa") });
  }
  for (let i = 1; i <= m.prateleiras; i++) {
    const y = y0 + E + ((A - 2 * E) * i) / (m.prateleiras + 1);
    ps.push({ nome: "Prateleira", tipo: "interior", x: E + 1, y: y - E / 2, z: 20, w: L - 2 * E - 2, h: E, d: P - 20 - ec, ref: ref("Prateleira") });
  }
  if (m.tipo === "roupeiro") ps.push({ nome: "Divisória", tipo: "interior", x: L / 2 - E / 2, y: y0 + E, z: 20, w: E, h: A - 2 * E, d: P - 20 - ec, ref: ref("Divisória") });
  // frentes
  const fr = frentesDoMovel(m);
  // caixas das gavetas (16 mm) e corrediças
  const Lc = comprimentoCorredica(P, ec);
  const cx0 = E + 12.5, cw = L - 2 * E - 25;
  for (const f of fr.filter((x) => x.tipo === "gaveta")) {
    const yb = f.y + 25, hb = Math.max(80, Math.round(f.h - 50));
    ps.push({ nome: "Lateral gaveta", tipo: "gaveta", x: cx0, y: yb, z: 2, w: 16, h: hb, d: Lc });
    ps.push({ nome: "Lateral gaveta", tipo: "gaveta", x: cx0 + cw - 16, y: yb, z: 2, w: 16, h: hb, d: Lc });
    ps.push({ nome: "Traseira gaveta", tipo: "gaveta", x: cx0 + 16, y: yb + 16, z: 2 + Lc - 16, w: cw - 32, h: hb - 16, d: 16 });
    ps.push({ nome: "Fundo gaveta", tipo: "gaveta", x: cx0 + 16, y: yb, z: 2, w: cw - 32, h: 16, d: Lc - 16 });
    for (const xc of [E, cx0 + cw]) ps.push({ nome: "Corrediça", tipo: "corredica", x: xc, y: yb + 6, z: 2, w: 12.5, h: 30, d: Lc });
  }
  let ig = 0;
  for (const f of fr) {
    const nome = f.tipo === "gaveta" ? `Frente gaveta ${++ig}` : m.portas > 1 ? `Porta ${f.n}` : "Porta";
    // portas com acabamento próprio têm uma peça cada («Porta 1», «Porta 2»…)
    const refPorta = m.pecas.find((p) => p.porta === f.n)?.codigo ?? ref("Porta");
    ps.push({ nome, tipo: "frente", x: f.x, y: f.y, z: -E - 2, w: f.w, h: f.h, d: E, ref: f.tipo === "gaveta" ? ref(`Frente gaveta ${ig}`) : refPorta });
    const px = puxadorDe(m, f);
    if (px) ps.push({ nome: "Puxador", tipo: "puxador", x: px.x, y: px.y, z: -E - 2 - 25, w: px.w, h: px.h, d: 25 });
    if (f.tipo === "porta" && m.tipo_porta !== "Correr") {
      for (const u of posicoesDobradica(f.h)) {
        const xd = f.dobradicaEsq ? E : L - E - 50;
        ps.push({ nome: "Dobradiça", tipo: "dobradica", x: xd, y: f.y + u - 20, z: 0, w: 50, h: 40, d: 12 });
      }
    }
  }
  if (y0 > 0) {
    if (m.rodape_tipo !== "sem") ps.push({ nome: "Rodapé", tipo: "rodape", x: 0, y: 0, z: RECUO_RODAPE, w: L, h: y0 - 2, d: E, ref: ref("Rodapé") });
    for (const x of [60, L - 60]) for (const z of [90, P - 60]) ps.push({ nome: "Pé", tipo: "pe", x: x - 20, y: 0, z: z - 20, w: 40, h: y0, d: 40 });
  }
  return ps;
}

/* ------------------------------------------------------------------ projecção isométrica */

const R2 = Math.SQRT2, R6 = Math.sqrt(6);
/** Câmara à frente, à direita e por cima. */
export function iso(x: number, y: number, z: number): [number, number] {
  return [(x + z) / R2, (-x + 2 * y + z) / R6];
}
export const profundidadeVista = (p: Painel) => (p.x + p.w / 2) + (p.y + p.h / 2) - (p.z + p.d / 2);
