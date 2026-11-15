import type { PDFDocument } from "pdf-lib";
import type { Divisao } from "../pedido";
import { nomeDivisao, nomeMaterial, nomeMdf } from "../pedido";
import { arestasOrla, comprimentoTampo, type EspecMaterial, type Movel, type Peca, type Tampo } from "../orcamento";
import { deslocar, furacao, juntar, legendaFuros, vistaPeca } from "./geometria";
import {
  alcadoConjunto,
  alvosIso,
  baloes,
  ladoConjunto,
  paineisMundo,
  perspectivaConjunto,
  vistaFrenteMovel,
  vistaIso,
  vistaLadoMovel,
  vistaTopoMovel,
} from "./vistas";
import {
  A3,
  ZONA,
  ZONA_GEOMETRIA,
  cabecalhoGeometria,
  caixasProcesso,
  criarRecursos,
  desenharVista,
  escalaPara,
  legenda,
  listaMaterial,
  moldura,
  tabelaPeca,
  type InfoFolha,
  type Modelos,
} from "./pdf";

export type Contexto = { numero: string; data: string; desenhou: string; processo: string };

const DENSIDADE = 700; // kg/m³ (aproximação para placas)
const pesoPeca = (p: Peca) => (p.qtd * p.c * p.l * p.e * 1e-9 * DENSIDADE);
const kg = (v: number) => `${v.toFixed(1).replace(".", ",")} kg`;

export function descMaterial(e: EspecMaterial, esp: number) {
  if (e.material === "laminado") return `Laminado ${e.acabamento || e.grupo || ""} ${esp}mm`.trim();
  if (e.material === "madeira") return `Madeira maciça ${e.acabamento} ${esp}mm`.trim();
  return `${nomeMdf(e.mdf || "normal")} ${esp}mm`;
}
function especDaPeca(m: Movel, p: Peca) {
  return p.sup === "frente" ? m.frente : m.corpo;
}

async function finalizar(doc: PDFDocument) {
  return doc.save();
}

/* ------------------------------------------------------------------ peça (03.4) */

export async function pdfPeca(mod: Modelos, m: Movel, p: Peca, ctx: Contexto) {
  const r = await criarRecursos(mod);
  const pg = r.doc.addPage([A3.w, A3.h]);
  moldura(pg);
  const furos = furacao(p, m);
  const v = vistaPeca(p, furos);
  const area = { ...ZONA_GEOMETRIA, y: ZONA_GEOMETRIA.y + 30, h: ZONA_GEOMETRIA.h - 30 };
  const s = escalaPara(v, area.w, area.h);
  cabecalhoGeometria(pg, r, `1:${s}`);
  desenharVista(pg, r, v, area, s);
  // legenda das furações
  legendaFuros(furos).forEach((t, i) => pg.drawText(t, { x: ZONA.X0 + 12, y: ZONA.YB + 62 - i * 9 + 30, size: 6.5, font: r.f }));
  const esp = especDaPeca(m, p);
  const nota = p.nota || (esp.material === "folheado" ? `Folha de madeira: ${esp.acabamento || "a definir"}` : "");
  tabelaPeca(
    pg,
    r,
    [
      { comercial: esp.acabamento || "", producao: p.codigo_sub ?? "", acabamento: nomeMaterial(esp.material).toUpperCase(), obs: nota },
      { comercial: `Qtd/móvel: ${p.qtd}`, producao: m.codigo ?? m.ref, acabamento: esp.mdf ? nomeMdf(esp.mdf) : "", obs: p.subconjunto },
    ],
    arestasOrla(p),
  );
  caixasProcesso(pg, r, 400, ZONA.YB + 8, ["70", ...(furos.length ? ["40"] : [])]);
  const info: InfoFolha = {
    codigo: p.codigo ?? "",
    designacao: `${p.designacao} - ${m.designacao}`.toUpperCase(),
    subtitulo: `${p.c}x${p.l}x${p.e}mm`,
    destino: "MAQUINAÇÃO / ORLA",
    escala: `1:${s}`,
    material: `${p.c}x${p.l}x${p.e}mm`,
    codigoMaterial: descMaterial(esp, p.e),
    acabamento: esp.acabamento,
    desenhou: ctx.desenhou,
    data: ctx.data,
    processo: ctx.processo,
  };
  legenda(pg, r, info);
  return finalizar(r.doc);
}

/* ------------------------------------------------------------------ móvel (10*) */

export async function pdfMovel(mod: Modelos, m: Movel, ctx: Contexto) {
  const r = await criarRecursos(mod);
  const pg = r.doc.addPage([A3.w, A3.h]);
  moldura(pg);
  const gap = Math.max(250, m.L * 0.25);
  const frente = vistaFrenteMovel(m);
  const lado = deslocar(vistaLadoMovel(m), m.L + gap, 0);
  const topo = deslocar(vistaTopoMovel(m), 0, -(m.P + gap));
  const conj = juntar([frente, lado, topo]);
  const area = { x: ZONA.X0 + 15, y: ZONA.YB + 20, w: ZONA.XR - ZONA.X0 - 30, h: ZONA.YT - ZONA.YB - 40 };
  const s = desenharVista(pg, r, conj, area);
  // lista de material
  const linhas: Parameters<typeof listaMaterial>[2] = [];
  let ref = 1;
  const subs = [...new Set(m.pecas.map((p) => p.subconjunto).filter(Boolean))];
  for (const sub of subs) {
    const ps = m.pecas.filter((p) => p.subconjunto === sub);
    linhas.push({ qtd: "1", designacao: `${sub} (pré-montagem)`, codigo: ps[0]?.codigo_sub ?? "", material: "", ref: String(ref++), peso: kg(ps.reduce((a, p) => a + pesoPeca(p), 0)) });
  }
  for (const p of m.pecas.filter((x) => !x.subconjunto)) {
    linhas.push({ qtd: String(p.qtd), designacao: `${p.designacao} ${p.c}x${p.l}x${p.e}mm`, codigo: p.codigo ?? "", material: descMaterial(especDaPeca(m, p), p.e), ref: String(ref++), peso: kg(pesoPeca(p)) });
  }
  for (const f of m.ferragens) {
    linhas.push({ qtd: String(f.qtd), designacao: f.descricao, codigo: f.ref_famo ?? "", material: "", ref: String(ref++), peso: "" });
  }
  const topoLista = listaMaterial(pg, r, linhas);
  // perspectiva com balões (nº de referência da lista)
  const numeros: Record<string, string> = {};
  linhas.forEach((l) => { if (l.codigo && !numeros[l.codigo]) numeros[l.codigo] = l.ref; });
  const pm = paineisMundo(m);
  const livre = ZONA.YT - 45 - topoLista;
  if (livre > 110) desenharVista(pg, r, baloes(vistaIso(pm), alvosIso(pm, numeros)), { x: ZONA.XR + 10, y: topoLista + 8, w: ZONA.X1 - ZONA.XR - 20, h: livre - 10 });
  caixasProcesso(pg, r, ZONA.X1 - 160, ZONA.YT - 30, ["10"]);
  const pesoTotal = m.pecas.reduce((a, p) => a + pesoPeca(p), 0);
  legenda(pg, r, {
    codigo: m.codigo ?? m.ref,
    designacao: m.designacao.toUpperCase(),
    subtitulo: `${m.L}x${m.P}x${m.A}mm`,
    destino: "MONTAGEM",
    escala: `1:${s}`,
    material: kg(pesoTotal),
    codigoMaterial: descMaterial(m.corpo, 19),
    acabamento: [m.corpo.acabamento, m.frente.acabamento !== m.corpo.acabamento ? m.frente.acabamento : ""].filter(Boolean).join(" / "),
    desenhou: ctx.desenhou,
    data: ctx.data,
    processo: ctx.processo,
  });
  return finalizar(r.doc);
}

/* ------------------------------------------------------------------ conjunto (produto completo) */

export async function pdfConjunto(mod: Modelos, d: Divisao, moveis: Movel[], codigoProduto: string, ctx: Contexto, tampo?: Tampo | null) {
  const r = await criarRecursos(mod);
  const pg = r.doc.addPage([A3.w, A3.h]);
  moldura(pg);
  const linhas = moveis.map((m, i) => ({
    qtd: String(m.qtd),
    designacao: `${m.designacao} ${m.L}x${m.P}x${m.A}mm`,
    codigo: m.codigo ?? m.ref,
    material: descMaterial(m.corpo, 19),
    ref: m.ref,
    peso: kg(m.pecas.reduce((a, p) => a + pesoPeca(p), 0) * m.qtd),
    _i: i,
  }));
  if (tampo?.incluir)
    linhas.unshift({
      qtd: "1",
      designacao: `Tampo de bancada ${comprimentoTampo(tampo, moveis)}x${tampo.profundidade}x${tampo.espessura}mm${tampo.terceiros ? " (terceiros)" : ""}`,
      codigo: tampo.codigo ?? "",
      material: `${tampo.material} ${tampo.acabamento}`.trim(),
      ref: "TB",
      peso: "",
      _i: -1,
    });
  const topoLista = listaMaterial(pg, r, linhas, ZONA.YT - 200);
  const alc = alcadoConjunto(moveis, tampo);
  const lado = ladoConjunto(moveis, tampo);
  const gap = 600;
  const vistaEsq = lado ? juntar([alc, deslocar(lado, alc.x1 + gap - lado.x0, 0)]) : alc;
  const s = desenharVista(pg, r, vistaEsq, { x: ZONA.X0 + 15, y: ZONA.YB + 20, w: ZONA.XR - ZONA.X0 - 30, h: ZONA.YT - ZONA.YB - 40 });
  const livre = ZONA.YT - 20 - topoLista;
  if (livre > 100) desenharVista(pg, r, perspectivaConjunto(moveis, tampo), { x: ZONA.XR + 15, y: topoLista + 10, w: ZONA.X1 - ZONA.XR - 30, h: livre - 15 });
  legenda(pg, r, {
    codigo: codigoProduto,
    designacao: `${d.designacao} - ${nomeDivisao(d.tipo)}`.toUpperCase(),
    subtitulo: `${moveis.length} móveis · quantidade ${d.quantidade}`,
    destino: "CONJUNTO / APROVAÇÃO",
    escala: `1:${s}`,
    material: nomeMaterial(d.material),
    codigoMaterial: d.mdf ? nomeMdf(d.mdf) : "",
    acabamento: d.descritivo?.acabamento_ref ?? d.acabamento ?? "",
    desenhou: ctx.desenhou,
    data: ctx.data,
    processo: ctx.processo,
  });
  return finalizar(r.doc);
}

/* ------------------------------------------------------------------ tampo de bancada (peça) */

/** Converte cada troço do tampo numa peça para folha PDF/DXF. */
export function pecasTampo(t: Tampo, moveis: Movel[]): { peca: Peca; movel: Movel }[] {
  const comp = comprimentoTampo(t, moveis);
  const n = Math.max(1, Math.ceil(comp / Math.max(500, t.comp_max_troco)));
  const espec: EspecMaterial = { material: t.material === "laminado" ? "laminado" : "madeira", mdf: "", acabamento: `${t.material} ${t.acabamento}`.trim(), grupo: "", extra_m2: null };
  const base = moveis[0];
  return Array.from({ length: n }, (_, i) => {
    const c = i < n - 1 ? Math.round(comp / n) : comp - Math.round(comp / n) * (n - 1);
    const peca: Peca = {
      id: `tampo-${i}`, designacao: n > 1 ? `Tampo de bancada (troço ${i + 1}/${n})` : "Tampo de bancada", qtd: 1,
      c, l: t.profundidade, e: t.espessura, sup: "manual", oc: 2, ol: 0, orlas: [true, false, false, false], subconjunto: "",
      preco_m2: t.preco_m2, preco_extra_m2: null, faces_extra: 0, preco_orla_ml: t.orla_ml,
      nota: [t.terceiros ? "Fornecido/aplicado por terceiros" : "", t.recortes.map((r) => `${r.qtd}x ${r.descricao}`).join(", "), t.notas].filter(Boolean).join(" · "),
      codigo: n > 1 ? `${t.codigo ?? "TAMPO"}-${i + 1}` : t.codigo ?? "TAMPO",
    };
    const movel: Movel = { ...base, designacao: "Conjunto", codigo: t.codigo, ref: "TB", corpo: espec, frente: espec, pecas: [peca], prateleiras: 0, portas: 0, gavetas: 0, tipo: "outro" };
    return { peca, movel };
  });
}
