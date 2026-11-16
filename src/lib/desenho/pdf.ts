/**
 * Folhas A3 no formato FAMO (IMP M 028/029): geometria à esquerda,
 * tabela/pormenores à direita e legenda no canto inferior direito.
 */
import {
  PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb, type RGB,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject, moveTo, lineTo, closePath, clip, endPath,
} from "pdf-lib";
import type { Entidade, Vista } from "./geometria";

export const A3 = { w: 1191, h: 842 };
const MM = 72 / 25.4;
const X0 = 58.6, X1 = 1161.3, YB = 24.3, YT = 816.3, XR = 648, YTB = 220, YPOR = 521, YHDR = 792.6;
const PRETO = rgb(0, 0, 0);
const ESCALAS = [1, 2, 2.5, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];

export type Recursos = { doc: PDFDocument; f: PDFFont; fb: PDFFont; pormenores: PDFImage; tolerancias: PDFImage; logo: PDFImage; texturas?: Record<string, Textura> };

/** Amostra de um acabamento: imagem (JPEG/PNG em data URL) e/ou cor #RRGGBB. Chave: referência sem espaços, em maiúsculas. */
export type Amostra = { referencia: string; descricao?: string; img?: string | null; cor?: string | null };
type Textura = { img?: PDFImage; cor?: RGB; ref: string; descricao: string };
export const chaveDecor = (s: string) => (s ?? "").replace(/\s+/g, "").toUpperCase();
/** Tamanho real (mm) representado por uma amostra ao pintar a perspectiva. */
const LADO_AMOSTRA_MM = 400;

function hexRgb(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function bytesDataUrl(u: string): Uint8Array {
  const b64 = u.slice(u.indexOf(",") + 1);
  if (typeof atob === "function") return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Embute no PDF as amostras dos acabamentos usados (só as que aparecem em `refs`). */
export async function embutirAmostras(r: Recursos, amostras: Record<string, Amostra> | undefined, refs: string[]) {
  r.texturas = {};
  if (!amostras) return;
  for (const ref of new Set(refs.filter(Boolean).map(chaveDecor))) {
    const a = amostras[ref];
    if (!a) continue;
    let img: PDFImage | undefined;
    try {
      if (a.img?.startsWith("data:image/jpeg") || a.img?.startsWith("data:image/jpg")) img = await r.doc.embedJpg(bytesDataUrl(a.img));
      else if (a.img?.startsWith("data:image/png")) img = await r.doc.embedPng(bytesDataUrl(a.img));
    } catch { img = undefined; }
    if (img || a.cor) r.texturas[ref] = { img, cor: a.cor ? hexRgb(a.cor) : undefined, ref: a.referencia, descricao: a.descricao ?? "" };
  }
}

/** Quadro «Acabamentos» com a amostra, a referência e a descrição de cada acabamento usado. */
export function quadroAcabamentos(pg: PDFPage, r: Recursos, x: number, y: number, larg: number): number {
  const ts = Object.values(r.texturas ?? {});
  if (!ts.length) return 0;
  const lado = 18, passo = 150, porLinha = Math.max(1, Math.floor(larg / passo));
  const linhas = Math.ceil(ts.length / porLinha);
  texto(pg, r.fb, "ACABAMENTOS", x, y + linhas * (lado + 6) + 2, 7);
  ts.forEach((t, i) => {
    const cx = x + (i % porLinha) * passo, cy = y + (linhas - 1 - Math.floor(i / porLinha)) * (lado + 6);
    if (t.img) pg.drawImage(t.img, { x: cx, y: cy, width: lado, height: lado });
    else pg.drawRectangle({ x: cx, y: cy, width: lado, height: lado, color: t.cor });
    caixa(pg, cx, cy, lado, lado, 0.4);
    texto(pg, r.fb, t.ref, cx + lado + 4, cy + 10, 6.5);
    texto(pg, r.f, t.descricao, cx + lado + 4, cy + 2.5, ajustar(r.f, t.descricao, 5.5, passo - lado - 10));
  });
  return linhas * (lado + 6) + 12;
}

export type InfoFolha = {
  codigo: string;
  designacao: string;
  subtitulo?: string;
  destino: string;
  escala?: string;
  material?: string;
  codigoMaterial?: string;
  acabamento?: string;
  edicao?: string;
  desenhou?: string;
  data: string;
  folha?: number;
  de?: number;
  processo?: string;
};

export type Modelos = { pormenores: ArrayBuffer; tolerancias: ArrayBuffer; logo: ArrayBuffer };

export async function carregarModelos(base = ""): Promise<Modelos> {
  const ler = async (n: string) => (await fetch(`${base}/modelos/${n}`)).arrayBuffer();
  const [pormenores, tolerancias, logo] = await Promise.all([ler("pormenores.png"), ler("tolerancias.png"), ler("logo-famo.png")]);
  return { pormenores, tolerancias, logo };
}

export async function criarRecursos(mod: Modelos): Promise<Recursos> {
  const doc = await PDFDocument.create();
  doc.setCreator("FAMO Orçamentação");
  const [f, fb, pormenores, tolerancias, logo] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedPng(mod.pormenores),
    doc.embedPng(mod.tolerancias),
    doc.embedPng(mod.logo),
  ]);
  return { doc, f, fb, pormenores, tolerancias, logo };
}

/* ------------------------------------------------------------------ primitivas */

function linha(pg: PDFPage, x1: number, y1: number, x2: number, y2: number, esp = 0.6, tracejado = false) {
  pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: esp, color: PRETO, dashArray: tracejado ? [4, 2.5] : undefined });
}
function caixa(pg: PDFPage, x: number, y: number, w: number, h: number, esp = 0.6) {
  pg.drawRectangle({ x, y, width: w, height: h, borderColor: PRETO, borderWidth: esp });
}
function texto(pg: PDFPage, f: PDFFont, t: string, x: number, y: number, tam = 7, alinh: "e" | "c" | "d" = "e", ang = 0) {
  const s = limpar(t);
  const w = f.widthOfTextAtSize(s, tam);
  const dx = alinh === "c" ? -w / 2 : alinh === "d" ? -w : 0;
  if (ang === 90) pg.drawText(s, { x: x + tam * 0.35, y: y + dx, size: tam, font: f, rotate: degrees(90), color: PRETO });
  else pg.drawText(s, { x: x + dx, y, size: tam, font: f, color: PRETO });
}
/** Garante que o texto só tem caracteres suportados pela fonte (WinAnsi). */
function limpar(s: string) {
  return (s ?? "").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ€]/g, "");
}
function ajustar(f: PDFFont, t: string, tamMax: number, largura: number) {
  let tam = tamMax;
  while (tam > 4 && f.widthOfTextAtSize(limpar(t), tam) > largura) tam -= 0.5;
  return tam;
}

/* ------------------------------------------------------------------ vista à escala */

/**
 * Pinta uma imagem em mosaico num paralelogramo (face de um painel na perspectiva):
 * pts[0] é o canto de origem, pts[1] e pts[3] os cantos ao longo das duas arestas.
 * Cada ladrilho representa LADO_AMOSTRA_MM; o mosaico é recortado pela face.
 */
function pintarTextura(pg: PDFPage, img: PDFImage, pts: [number, number][], X: (x: number) => number, Y: (y: number) => number, k: number) {
  const P = pts.map(([x, y]) => [X(x), Y(y)] as [number, number]);
  const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], vx = P[3][0] - P[0][0], vy = P[3][1] - P[0][1];
  // comprimentos reais (mm) das duas arestas: a projecção isométrica encurta ~0,816 (√(2/3))
  const lu = Math.hypot(ux, uy) / k / 0.8165, lv = Math.hypot(vx, vy) / k / 0.8165;
  if (lu < 1 || lv < 1) return;
  const nu = Math.max(1, Math.ceil(lu / LADO_AMOSTRA_MM)), nv = Math.max(1, Math.ceil(lv / LADO_AMOSTRA_MM));
  if (nu * nv > 400) return; // faces enormes: fica só a cor
  const su = LADO_AMOSTRA_MM / lu, sv = LADO_AMOSTRA_MM / lv; // fracção da aresta ocupada por um ladrilho
  const nome = pg.node.newXObject("Image", img.ref);
  const ops = [pushGraphicsState(), moveTo(P[0][0], P[0][1]), lineTo(P[1][0], P[1][1]), lineTo(P[2][0], P[2][1]), lineTo(P[3][0], P[3][1]), closePath(), clip(), endPath()];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const ox = P[0][0] + ux * su * i + vx * sv * j, oy = P[0][1] + uy * su * i + vy * sv * j;
      ops.push(pushGraphicsState(), concatTransformationMatrix(ux * su, uy * su, vx * sv, vy * sv, ox, oy), drawObject(nome), popGraphicsState());
    }
  ops.push(popGraphicsState());
  pg.pushOperators(...ops);
}

export function escalaPara(v: Vista, w: number, h: number): number {
  const lw = v.x1 - v.x0, lh = v.y1 - v.y0;
  for (const s of ESCALAS) if ((lw * MM) / s <= w && (lh * MM) / s <= h) return s;
  return ESCALAS[ESCALAS.length - 1];
}

export function desenharVista(pg: PDFPage, r: Recursos, v: Vista, area: { x: number; y: number; w: number; h: number }, escala?: number) {
  const s = escala ?? escalaPara(v, area.w, area.h);
  const k = MM / s;
  const ox = area.x + (area.w - (v.x1 - v.x0) * k) / 2 - v.x0 * k;
  const oy = area.y + (area.h - (v.y1 - v.y0) * k) / 2 - v.y0 * k;
  const X = (x: number) => ox + x * k, Y = (y: number) => oy + y * k;
  for (const e of v.ents) desenharEntidade(pg, r, e, X, Y, k);
  return s;
}

function desenharEntidade(pg: PDFPage, r: Recursos, e: Entidade, X: (x: number) => number, Y: (y: number) => number, k: number) {
  switch (e.t) {
    case "linha":
      linha(pg, X(e.x1), Y(e.y1), X(e.x2), Y(e.y2), e.fina ? 0.35 : 0.8, e.tracejado);
      break;
    case "circulo": {
      const rr = Math.max(0.8, e.r * k);
      pg.drawCircle({ x: X(e.x), y: Y(e.y), size: rr, borderColor: PRETO, borderWidth: 0.4 });
      if (e.cruz) {
        const c = rr + 2;
        linha(pg, X(e.x) - c, Y(e.y), X(e.x) + c, Y(e.y), 0.25);
        linha(pg, X(e.x), Y(e.y) - c, X(e.x), Y(e.y) + c, 0.25);
      }
      break;
    }
    case "poligono": {
      const d = e.pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(2)} ${(-Y(y)).toFixed(2)}`).join(" ") + " Z";
      const tx = e.preenchido && e.textura ? r.texturas?.[chaveDecor(e.textura)] : undefined;
      if (!tx) {
        pg.drawSvgPath(d, { x: 0, y: 0, color: e.preenchido ? rgb(1, 1, 1) : PRETO, borderColor: PRETO, borderWidth: 0.6 });
        break;
      }
      // face pintada com a cor da amostra e, havendo imagem, com a textura em mosaico à escala real
      pg.drawSvgPath(d, { x: 0, y: 0, color: tx.cor ?? rgb(1, 1, 1) });
      if (tx.img && e.pts.length === 4) pintarTextura(pg, tx.img, e.pts, X, Y, k);
      pg.drawSvgPath(d, { x: 0, y: 0, borderColor: PRETO, borderWidth: 0.6 });
      break;
    }
    case "texto":
      texto(pg, r.fb, e.txt, X(e.x), Y(e.y), e.alt ? Math.max(6, Math.min(14, e.alt * k)) : 7, e.centro ? "c" : "e", e.ang ?? 0);
      break;
    case "cota": {
      const horiz = Math.abs(e.x2 - e.x1) >= Math.abs(e.y2 - e.y1);
      const comp = Math.round(horiz ? Math.abs(e.x2 - e.x1) : Math.abs(e.y2 - e.y1) * 10) / (horiz ? 1 : 10);
      const valor = e.txt ?? fmt(horiz ? Math.abs(e.x2 - e.x1) : Math.abs(e.y2 - e.y1));
      void comp;
      if (horiz) {
        const yl = Y(e.y1) + e.off * k;
        linha(pg, X(e.x1), Y(e.y1) + Math.sign(e.off) * 2, X(e.x1), yl + Math.sign(e.off) * 2, 0.25);
        linha(pg, X(e.x2), Y(e.y2) + Math.sign(e.off) * 2, X(e.x2), yl + Math.sign(e.off) * 2, 0.25);
        linha(pg, X(e.x1), yl, X(e.x2), yl, 0.3);
        seta(pg, X(e.x1), yl, X(e.x2) > X(e.x1) ? 1 : -1, 0);
        seta(pg, X(e.x2), yl, X(e.x2) > X(e.x1) ? -1 : 1, 0);
        const larg = Math.abs(X(e.x2) - X(e.x1));
        texto(pg, r.f, valor, (X(e.x1) + X(e.x2)) / 2, yl + 1.5, larg < 14 ? 5.5 : 7, "c");
      } else {
        const xl = X(e.x1) + e.off * k;
        linha(pg, X(e.x1) + Math.sign(e.off) * 2, Y(e.y1), xl + Math.sign(e.off) * 2, Y(e.y1), 0.25);
        linha(pg, X(e.x2) + Math.sign(e.off) * 2, Y(e.y2), xl + Math.sign(e.off) * 2, Y(e.y2), 0.25);
        linha(pg, xl, Y(e.y1), xl, Y(e.y2), 0.3);
        seta(pg, xl, Y(e.y1), 0, Y(e.y2) > Y(e.y1) ? 1 : -1);
        seta(pg, xl, Y(e.y2), 0, Y(e.y2) > Y(e.y1) ? -1 : 1);
        const alt = Math.abs(Y(e.y2) - Y(e.y1));
        texto(pg, r.f, valor, xl - 1.5, (Y(e.y1) + Y(e.y2)) / 2, alt < 14 ? 5.5 : 7, "c", 90);
      }
      break;
    }
  }
}

function seta(pg: PDFPage, x: number, y: number, dx: number, dy: number) {
  const L = 4, W = 1.2;
  const pts = dx !== 0 ? [[x, y], [x + dx * L, y + W], [x + dx * L, y - W]] : [[x, y], [x + W, y + dy * L], [x - W, y + dy * L]];
  pg.drawSvgPath(`M${pts[0][0]} ${-pts[0][1]} L${pts[1][0]} ${-pts[1][1]} L${pts[2][0]} ${-pts[2][1]} Z`, { x: 0, y: 0, color: PRETO, borderWidth: 0 });
}

const fmt = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1).replace(".", ","));

/* ------------------------------------------------------------------ moldura e legenda */

export function moldura(pg: PDFPage) {
  caixa(pg, X0, YB, X1 - X0, YT - YB, 1);
  linha(pg, 20, A3.h / 2, X0, A3.h / 2, 0.6); // marca de dobragem, como nos modelos
}

export function legenda(pg: PDFPage, r: Recursos, i: InfoFolha) {
  const { f, fb } = r;
  // bloco fixo (aviso + tolerâncias)
  pg.drawImage(r.tolerancias, { x: XR, y: YB, width: 776.6 - XR, height: YTB - YB });
  caixa(pg, XR, YB, X1 - XR, YTB - YB, 1);
  const XL = 776.6;
  linha(pg, XL, YB, XL, YTB, 1);
  // r1 — alterações
  const y1 = 174;
  linha(pg, XL, y1, X1, y1, 1);
  const meio = XL + (X1 - XL) / 2;
  for (const x0 of [XL, meio]) {
    linha(pg, x0 + 33, y1, x0 + 33, YTB, 0.4);
    linha(pg, x0 + 66, y1, x0 + 66, YTB, 0.4);
    texto(pg, f, "REFERÊNCIA", x0 + 16.5, y1 + 2.5, 4.2, "c");
    texto(pg, f, "DATA", x0 + 49.5, y1 + 2.5, 4.2, "c");
    texto(pg, f, "ALTERAÇÃO", x0 + 66 + (meio - XL - 66) / 2, y1 + 2.5, 4.2, "c");
  }
  linha(pg, meio, y1, meio, YTB, 0.6);
  for (let k = 1; k <= 3; k++) linha(pg, XL, y1 + k * 11.5, X1, y1 + k * 11.5, 0.3);
  // r2 — responsáveis, destino, logótipo
  const y2 = 128;
  linha(pg, XL, y2, X1, y2, 1);
  const rot = ["PROJECTOU", "DESENHOU", "VERIFICOU", "APROVOU"];
  rot.forEach((t, k) => {
    const yy = y1 - (k + 1) * 11.5;
    linha(pg, XL, yy, XL + 103, yy, 0.3);
    texto(pg, f, t, XL + 2, yy + 3.5, 4.2);
  });
  linha(pg, XL + 34, y2, XL + 34, y1, 0.3);
  linha(pg, XL + 70, y2, XL + 70, y1, 0.3);
  texto(pg, f, i.desenhou ?? "", XL + 36, y1 - 2 * 11.5 + 3.5, 4.5);
  texto(pg, f, i.data, XL + 72, y1 - 2 * 11.5 + 3.5, 4.5);
  linha(pg, XL + 103, y2, XL + 103, y1, 0.8);
  texto(pg, f, "DESTINO:", XL + 105, y1 - 7, 4.2);
  texto(pg, f, i.destino, XL + 103 + 79.5, y2 + 15, ajustar(f, i.destino, 11, 150), "c");
  const XD = XL + 262;
  linha(pg, XD, YB, XD, y1, 0.8);
  pg.drawImage(r.logo, { x: XD + 12, y: y2 + 9, width: 98, height: 19.6 });
  // r3 — escala, designação, nº desenho
  const y3 = 56;
  linha(pg, XL, y3, X1, y3, 1);
  linha(pg, XL + 36, YB, XL + 36, y2, 0.8);
  texto(pg, f, "ESCALA:", XL + 2, y2 - 7, 4.2);
  texto(pg, f, i.escala ?? "", XL + 18, y3 + 28, 10, "c");
  texto(pg, f, "DESIGNAÇÃO:", XL + 38, y2 - 7, 4.2);
  texto(pg, f, i.designacao, XL + 36 + 113, y3 + 38, ajustar(f, i.designacao, 11, 220), "c");
  if (i.subtitulo) texto(pg, f, i.subtitulo, XL + 36 + 113, y3 + 24, ajustar(f, i.subtitulo, 11, 220), "c");
  const ys = [y2 - 41, y2 - 51.3, y2 - 61.6];
  ys.forEach((yy) => linha(pg, XD, yy, X1, yy, 0.4));
  texto(pg, f, "DESENHO Nº", XD + 2, y2 - 7, 4.2);
  texto(pg, f, i.codigo, XD + 61, y2 - 26, ajustar(f, i.codigo, 9.5, 118), "c");
  texto(pg, f, `EDIÇÃO:  ${i.edicao ?? "1"}`, XD + 2, ys[1] + 3, 4.8);
  texto(pg, f, "SUBSTITUI:", XD + 2, ys[2] + 3, 4.2);
  texto(pg, f, "SUBSTITUÍDO POR:", XD + 2, y3 + 3, 4.2);
  // r4 — projecção, material, acabamento, folha
  simboloProjecao(pg, XL + 18, YB + 16);
  linha(pg, XL + 139, YB, XL + 139, y3, 0.8);
  const ym = YB + (y3 - YB) / 2;
  linha(pg, XL + 36, ym, XL + 139, ym, 0.3);
  linha(pg, XD, ym, X1, ym, 0.3);
  texto(pg, f, "MATERIAL:", XL + 38, ym + 9.5, 4.2);
  texto(pg, f, i.material ?? "", XL + 56, ym + 3, ajustar(f, i.material ?? "", 7, 80));
  texto(pg, f, "CÓDIGO MATERIAL:", XL + 38, YB + 9.5, 4.2);
  texto(pg, f, i.codigoMaterial ?? "", XL + 74, YB + 3, ajustar(f, i.codigoMaterial ?? "", 6.5, 62));
  texto(pg, f, "ACABAMENTO:", XL + 141, y3 - 7, 4.2);
  texto(pg, f, i.acabamento ?? "", XL + 141, YB + 9, ajustar(f, i.acabamento ?? "", 7, 119));
  texto(pg, f, `FOLHA:  ${i.folha ?? 1}      DE:  ${i.de ?? 1}`, XD + 2, ym + 4, 5.5);
  texto(pg, f, `PROCESSO Nº:  ${i.processo ?? ""}`, XD + 2, YB + 4, 4.8);
  void fb;
}

function simboloProjecao(pg: PDFPage, cx: number, cy: number) {
  // símbolo da projecção europeia (1.º diedro)
  pg.drawSvgPath(`M${cx - 15} ${-(cy + 4)} L${cx - 3} ${-(cy + 7)} L${cx - 3} ${-(cy - 7)} L${cx - 15} ${-(cy - 4)} Z`, { x: 0, y: 0, borderColor: PRETO, borderWidth: 0.5 });
  pg.drawCircle({ x: cx + 8, y: cy, size: 7, borderColor: PRETO, borderWidth: 0.5 });
  pg.drawCircle({ x: cx + 8, y: cy, size: 4, borderColor: PRETO, borderWidth: 0.5 });
  linha(pg, cx - 17, cy, cx + 17, cy, 0.25);
  linha(pg, cx + 8, cy - 9, cx + 8, cy + 9, 0.25);
}

/** Caixas de processo (centros de trabalho) como no canto dos modelos. */
export function caixasProcesso(pg: PDFPage, r: Recursos, x: number, y: number, codigos: string[]) {
  for (let k = 0; k < 6; k++) {
    const xx = x + k * 26;
    caixa(pg, xx, y, 18, 22, 0.5);
    linha(pg, xx, y + 11, xx + 18, y + 11, 0.3);
    if (codigos[k]) {
      texto(pg, r.f, codigos[k], xx + 9, y + 14, 6, "c");
      texto(pg, r.f, "1", xx + 9, y + 3, 6, "c");
    }
  }
}

/* ------------------------------------------------------------------ cabeçalhos das zonas */

export function cabecalhoGeometria(pg: PDFPage, r: Recursos, escala: string) {
  caixa(pg, X0, YHDR, XR - X0, YT - YHDR, 0.8);
  texto(pg, r.f, `GEOMETRIA -ESC.-   ${escala}`, X0 + (XR - X0) / 2, YHDR + 8, 8, "c");
}

/** Tabela de referências e pormenores (folha de peça). */
export function tabelaPeca(
  pg: PDFPage,
  r: Recursos,
  linhas: { comercial?: string; producao?: string; acabamento?: string; obs?: string }[],
  orlas: [boolean, boolean, boolean, boolean],
) {
  const { f } = r;
  const cols = [XR, XR + 103, XR + 205.6, XR + 308.2, XR + 410.8, X1];
  caixa(pg, XR, YPOR, X1 - XR, YT - YPOR, 0.8);
  linha(pg, XR, YHDR, X1, YHDR, 0.8);
  const tit = ["ESQUEMA - ESC:1/100\nPORMENORES", "REFERÊNCIA\nCOMERCIAL", "REFERÊNCIA\nPRODUÇÃO", "ACABAMENTO", "OBSERVAÇÕES"];
  tit.forEach((t, k) => {
    const partes = t.split("\n");
    partes.forEach((p, j) => texto(pg, f, p, (cols[k] + cols[k + 1]) / 2, YHDR + (partes.length === 1 ? 8 : 13 - j * 8), partes.length === 1 ? 8 : 6.5, "c"));
    if (k > 0) linha(pg, cols[k], YPOR, cols[k], YT, 0.5);
  });
  const hRow = (YHDR - YPOR) / 12;
  for (let k = 1; k < 12; k++) {
    const y = YHDR - k * hRow;
    linha(pg, k % 4 === 0 ? XR : cols[1], y, X1, y, k % 4 === 0 ? 0.6 : 0.3);
  }
  linhas.slice(0, 12).forEach((l, k) => {
    const y = YHDR - (k + 1) * hRow + 7;
    const vals = [l.comercial, l.producao, l.acabamento, l.obs];
    vals.forEach((v, j) => v && texto(pg, f, v, (cols[j + 1] + cols[j + 2]) / 2, y, ajustar(f, v, 7, 98), "c"));
  });
  // esquema das orlas: rectângulo com "E" nas arestas orladas
  const cx = (cols[0] + cols[1]) / 2, cy = YHDR - 2 * hRow;
  caixa(pg, cx - 6, cy - 22, 12, 44, 0.5);
  if (orlas[1]) texto(pg, f, "E", cx, cy + 26, 9, "c");
  if (orlas[0]) texto(pg, f, "E", cx, cy - 32, 9, "c");
  if (orlas[2]) texto(pg, f, "E", cx - 14, cy - 3, 9, "c");
  if (orlas[3]) texto(pg, f, "E", cx + 14, cy - 3, 9, "c");
  // pormenores (bloco fixo)
  pg.drawImage(r.pormenores, { x: XR, y: YTB, width: X1 - XR, height: YPOR - YTB });
  caixa(pg, XR, YTB, X1 - XR, YPOR - YTB, 0.8);
}

/** Lista de material (folha de montagem), cresce para cima a partir da legenda. */
export function listaMaterial(
  pg: PDFPage,
  r: Recursos,
  linhas: { qtd: string; designacao: string; codigo: string; material: string; ref: string; peso: string }[],
  yMax = YT - 40,
) {
  const { f, fb } = r;
  const cols = [XR, XR + 36, XR + 234.5, XR + 323.5, XR + 384, XR + 410, XR + 451.4, XR + 482, X1];
  const h = 11;
  const caber = Math.floor((yMax - YTB - h) / h);
  const vis = linhas.slice(0, caber);
  const topo = YTB + h * (vis.length + 1);
  caixa(pg, XR, YTB, X1 - XR, topo - YTB, 0.8);
  const tit = ["QUANT.", "DESIGNAÇÃO", "CÓDIGO", "MATERIAL", "Nº REF", "PRODUTO", "PESO", "OBS."];
  tit.forEach((t, k) => texto(pg, fb, t, (cols[k] + cols[k + 1]) / 2, YTB + 3.5, 5, "c"));
  for (let k = 1; k < cols.length - 1; k++) linha(pg, cols[k], YTB, cols[k], topo, 0.3);
  vis.forEach((l, k) => {
    const y = YTB + h * (k + 1);
    linha(pg, XR, y, X1, y, k === 0 ? 0.7 : 0.25);
    texto(pg, f, l.qtd, cols[0] + 18, y + 3.5, 5.5, "c");
    texto(pg, f, l.designacao, cols[1] + 2, y + 3.5, ajustar(f, l.designacao, 5.5, 194));
    texto(pg, f, l.codigo, cols[2] + 2, y + 3.5, ajustar(f, l.codigo, 5.5, 86));
    texto(pg, f, l.material, cols[3] + 2, y + 3.5, ajustar(f, l.material, 5, 58));
    texto(pg, f, l.ref, cols[4] + 13, y + 3.5, 5.5, "c");
    texto(pg, f, l.peso, cols[6] + 15, y + 3.5, 5, "c");
  });
  if (linhas.length > vis.length) texto(pg, f, `(+${linhas.length - vis.length} linhas: ver lista completa em Excel)`, XR + 2, topo + 3, 5);
  return topo;
}

export const ZONA_GEOMETRIA = { x: X0 + 18, y: YB + 50, w: XR - X0 - 36, h: YHDR - YB - 70 };
export const ZONA = { X0, X1, YB, YT, XR, YTB, YPOR, YHDR };
