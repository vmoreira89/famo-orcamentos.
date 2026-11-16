/**
 * Leitura dos ficheiros de apoio de um pedido e proposta de móveis a partir do texto.
 *
 * Lê texto de PDF (com texto, não digitalizados), DXF (textos e cotas), Excel,
 * Word (.docx), TXT e CSV. Imagens, DWG e STEP não têm texto legível sem IA/OCR.
 * A proposta é sempre revista pelo orçamentista antes de entrar no orçamento.
 */
import type { TipoMovel } from "./orcamento";
import { TIPOS_MOVEL } from "./orcamento";

export type EstadoLeitura = "lido" | "sem_texto" | "nao_suportado" | "erro";
export type ResultadoLeitura = { nome: string; estado: EstadoLeitura; texto: string; nota: string };

export type PropostaMovel = {
  chave: string;
  incluir: boolean;
  tipo: Exclude<TipoMovel, "tampo">;
  designacao: string;
  qtd: number;
  L: number;
  P: number;
  A: number;
  portas: number;
  gavetas: number;
  origem: string; // ficheiro e linha de onde veio
};

const ext = (nome: string) => (nome.split(".").pop() ?? "").toLowerCase();

/* ------------------------------------------------------------------ extracção de texto */

export async function extrairTexto(dados: ArrayBuffer, nome: string, mime = ""): Promise<ResultadoLeitura> {
  const e = ext(nome);
  try {
    if (e === "pdf" || mime === "application/pdf") return finalizar(nome, await textoPdf(dados), "PDF sem texto (provavelmente digitalizado ou só com linhas).");
    if (e === "dxf") return finalizar(nome, textoDxf(new TextDecoder("latin1").decode(dados)), "DXF sem textos nem cotas.");
    if (e === "txt" || e === "csv" || mime.startsWith("text/")) return finalizar(nome, decodificar(dados), "Ficheiro vazio.");
    if (e === "xlsx" || e === "xlsm") return finalizar(nome, await textoExcel(dados), "Folha de cálculo sem dados.");
    if (e === "docx") return finalizar(nome, await textoDocx(dados), "Documento sem texto.");
    if (["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "tif", "tiff"].includes(e) || mime.startsWith("image/"))
      return { nome, estado: "nao_suportado", texto: "", nota: "Imagem: a leitura automática de esboços e fotografias precisa de IA (não activa). Consulte o ficheiro." };
    if (["dwg", "step", "stp", "skp", "3dm", "sldprt", "sldasm"].includes(e))
      return { nome, estado: "nao_suportado", texto: "", nota: "Formato CAD binário: exporte para DXF ou PDF para ser lido." };
    return { nome, estado: "nao_suportado", texto: "", nota: "Formato não lido automaticamente." };
  } catch (err) {
    return { nome, estado: "erro", texto: "", nota: err instanceof Error ? err.message : "Erro ao ler o ficheiro." };
  }
}

function finalizar(nome: string, texto: string, notaVazio: string): ResultadoLeitura {
  const t = texto.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t ? { nome, estado: "lido", texto: t, nota: "" } : { nome, estado: "sem_texto", texto: "", nota: notaVazio };
}

function decodificar(dados: ArrayBuffer) {
  const utf = new TextDecoder("utf-8", { fatal: false }).decode(dados);
  return utf.includes("�") ? new TextDecoder("latin1").decode(dados) : utf;
}

async function textoPdf(dados: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc)
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(dados.slice(0))});
  const doc = await tarefa.promise;
  const paginas: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    // agrupa os pedaços de texto por linha (mesma altura na página)
    const linhas = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as { str?: string; transform?: number[] }[]) {
      if (!it.str?.trim() || !it.transform) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!linhas.has(y)) linhas.set(y, []);
      linhas.get(y)!.push({ x: it.transform[4], s: it.str });
    }
    const ord = [...linhas.entries()].sort((a, b) => b[0] - a[0]).map(([, xs]) => xs.sort((a, b) => a.x - b.x).map((x) => x.s).join(" "));
    paginas.push(ord.join("\n"));
  }
  await tarefa.destroy();
  return paginas.join("\n\n");
}

/** Textos (TEXT/MTEXT/ATTRIB) e cotas (DIMENSION) de um DXF ASCII. */
export function textoDxf(conteudo: string): string {
  const l = conteudo.split(/\r?\n/);
  const out: string[] = [];
  let ent = "";
  let mtext = "";
  let medida: number | null = null;
  let substituto = "";
  const fechar = () => {
    if ((ent === "MTEXT" || ent === "TEXT" || ent === "ATTRIB") && mtext) out.push(limparMtext(mtext));
    if (ent === "DIMENSION") {
      const txt = substituto && substituto !== "<>" ? limparMtext(substituto).replace("<>", medida != null ? String(Math.round(medida)) : "") : medida != null ? String(Math.round(medida)) : "";
      if (txt) out.push(`cota ${txt}`);
    }
    mtext = ""; medida = null; substituto = "";
  };
  for (let i = 0; i + 1 < l.length; i += 2) {
    const cod = l[i].trim(), val = l[i + 1];
    if (cod === "0") { fechar(); ent = val.trim(); continue; }
    if (ent === "MTEXT" && (cod === "1" || cod === "3")) mtext += val;
    else if ((ent === "TEXT" || ent === "ATTRIB") && cod === "1") mtext = val;
    else if (ent === "DIMENSION" && cod === "42") medida = parseFloat(val);
    else if (ent === "DIMENSION" && cod === "1") substituto = val;
  }
  fechar();
  return out.join("\n");
}

function limparMtext(s: string) {
  return s
    .replace(/\\P/g, "\n")
    .replace(/\\[ACFHQTWfhqtw][^;]*;/g, "")
    .replace(/\\[LlOoKk]/g, "")
    .replace(/[{}]/g, "")
    .replace(/%%c/gi, "Ø")
    .replace(/%%d/gi, "°")
    .trim();
}

async function textoExcel(dados: ArrayBuffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dados);
  const out: string[] = [];
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      const v = (row.values as unknown[]).slice(1).map((c) => (c == null ? "" : typeof c === "object" ? String((c as { result?: unknown; text?: unknown }).result ?? (c as { text?: unknown }).text ?? "") : String(c)));
      const linha = v.join(" ").trim();
      if (linha) out.push(linha);
    });
  });
  return out.join("\n");
}

async function textoDocx(dados: ArrayBuffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(dados);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/* ------------------------------------------------------------------ proposta de móveis */

const PALAVRAS: [RegExp, PropostaMovel["tipo"]][] = [
  [/gaveteiro/, "gaveteiro"],
  [/roupeiro|guarda[- ]?roupa|closet/, "roupeiro"],
  [/coluna|torre|despensa|frigor[ií]fico encastr/, "coluna"],
  [/superior|mural|\balto\b|\baltos\b|suspens/, "superior"],
  [/inferior|\bbase\b|\bbaixo\b|lava[- ]?lou[cç]a|banca/, "inferior"],
  [/estante|\baberto\b|nicho|livreiro/, "estante"],
  [/lavat[óo]rio|\bwc\b|casa de banho/, "wc"],
];

const NUM = String.raw`(\d{2,4}(?:[.,]\d)?)`;
const TRIPLO = new RegExp(String.raw`${NUM}\s*(?:mm)?\s*[x×X*]\s*${NUM}\s*(?:mm)?\s*[x×X*]\s*${NUM}`, "g");
const n = (s: string) => Math.round(parseFloat(s.replace(",", ".")));
const plausivel = (v: number) => v >= 150 && v <= 3200;

function tipoPorMedidas(L: number, P: number, A: number, tipoDivisao?: string): PropostaMovel["tipo"] {
  if (tipoDivisao === "quarto" && A >= 1800) return "roupeiro";
  if (A >= 1800) return P >= 450 ? "coluna" : "estante";
  if (P <= 400 && A <= 1200) return "superior";
  if (tipoDivisao === "wc") return "wc";
  if (A <= 950 && P >= 450) return "inferior";
  return "outro";
}

/** Ordem das medidas: L×P×A (como no formulário); se o 2.º valor não parecer profundidade, assume L×A×P. */
function ordenar(a: number, b: number, c: number): { L: number; P: number; A: number } {
  if (b <= 750 && (c > b || c >= 700)) return { L: a, P: b, A: c };
  if (c <= 750) return { L: a, P: c, A: b };
  return { L: a, P: b, A: c };
}

/** Lê o texto e propõe móveis com medidas, quantidades, portas e gavetas. */
export function proporDeTexto(texto: string, origem: string, tipoDivisao?: string): PropostaMovel[] {
  const out: PropostaMovel[] = [];
  const linhas = texto.split(/\n/).map((x) => x.trim()).filter(Boolean);
  linhas.forEach((linha, i) => {
    const baixo = linha.toLowerCase();
    // contexto: a própria linha e a anterior (legendas em duas linhas)
    const ctx = `${linhas[i - 1] ?? ""} ${linha}`.toLowerCase();
    const medidas: { L: number; P: number; A: number }[] = [];
    for (const m of linha.matchAll(TRIPLO)) {
      const [a, b, c] = [n(m[1]), n(m[2]), n(m[3])];
      if ([a, b, c].every(plausivel)) medidas.push(ordenar(a, b, c));
    }
    // medidas com rótulo: L=600 P=560 A=720 / larg. 600 prof. 560 alt. 720
    const rot = (re: RegExp) => { const m = baixo.match(re); return m ? n(m[1]) : null; };
    const Lr = rot(/\b(?:l|larg(?:ura)?\.?|comp(?:rimento)?\.?)\s*[=:]?\s*(\d{3,4})/);
    const Pr = rot(/\b(?:p|prof(?:undidade)?\.?)\s*[=:]?\s*(\d{2,4})/);
    const Ar = rot(/\b(?:a|h|alt(?:ura)?\.?)\s*[=:]?\s*(\d{3,4})/);
    if (!medidas.length && Lr && Ar && plausivel(Lr) && plausivel(Ar)) medidas.push({ L: Lr, P: Pr && plausivel(Pr) ? Pr : 0, A: Ar });
    if (!medidas.length) return;
    let tipo: PropostaMovel["tipo"] | null = null;
    for (const [re, t] of PALAVRAS) if (re.test(baixo)) { tipo = t; break; }
    if (!tipo) for (const [re, t] of PALAVRAS) if (re.test(ctx)) { tipo = t; break; }
    const qtdM = baixo.match(/^\s*(\d{1,2})\s*(?:x\s|×\s|un\b|un\.|unid|pe[çc]as?\b)/) ?? baixo.match(/\b(?:qtd|quant(?:idade)?)\.?\s*[=:]?\s*(\d{1,2})\b/);
    const gav = baixo.match(/(\d{1,2})\s*gavet/);
    const por = baixo.match(/(\d{1,2})\s*portas?/);
    for (const md of medidas) {
      const t = tipo ?? tipoPorMedidas(md.L, md.P, md.A, tipoDivisao);
      const P = md.P || TIPOS_MOVEL[t].P;
      out.push({
        chave: `${origem}-${i}-${out.length}`,
        incluir: true,
        tipo: t,
        designacao:
          linha
            .replace(TRIPLO, "")
            .replace(/^\s*\d{1,2}\s*(?:x|×|un\.?|unid\.?|pe[çc]as?)\s*/i, "")
            .replace(/\b\d{1,2}\s*(?:portas?|gavetas?)\b/gi, "")
            .replace(/\b(?:l|p|a|h|larg\.?|prof\.?|alt\.?)\s*[=:]\s*\d+/gi, "")
            .replace(/\bmm\b/gi, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 60) || TIPOS_MOVEL[t].nome,
        qtd: qtdM ? Math.max(1, parseInt(qtdM[1], 10)) : 1,
        L: md.L, P, A: md.A,
        portas: por ? parseInt(por[1], 10) : t === "gaveteiro" || t === "estante" ? 0 : md.L > 600 ? 2 : 1,
        gavetas: gav ? parseInt(gav[1], 10) : t === "gaveteiro" ? 3 : 0,
        origem: `${origem}: «${linha.slice(0, 90)}»`,
      });
    }
  });
  // a mesma peça aparece muitas vezes num desenho (vistas, legendas): junta iguais
  const unicos = new Map<string, PropostaMovel>();
  for (const p of out) {
    const k = `${p.tipo}|${p.L}|${p.P}|${p.A}|${p.portas}|${p.gavetas}`;
    const j = unicos.get(k);
    if (!j) unicos.set(k, p);
    else j.qtd = Math.max(j.qtd, p.qtd);
  }
  return [...unicos.values()];
}

/** Cotas soltas encontradas (ajudam quando não há medidas «L×P×A»). */
export function cotasSoltas(texto: string): number[] {
  const v = [...texto.matchAll(/(?<![\d.,])(\d{3,4})(?![\d.,])/g)].map((m) => parseInt(m[1], 10)).filter(plausivel);
  return [...new Set(v)].sort((a, b) => b - a).slice(0, 30);
}
