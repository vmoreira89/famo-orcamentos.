import JSZip from "jszip";
import type { Divisao } from "../pedido";
import type { Movel, Tampo } from "../orcamento";
import { movelTampo } from "../orcamento";
import { codigoProduto } from "../orcamento";
import { furacao } from "./geometria";
import { dxfPeca } from "./dxf";
import { pdfConjunto, pdfMovel, pdfPeca, type Contexto } from "./folhas";
import { carregarModelos } from "./pdf";

export type OpcoesPacote = { conjunto: boolean; moveis: boolean; pecasPdf: boolean; pecasDxf: boolean };

const seguro = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_");

/** Gera os ficheiros pedidos e devolve um ZIP organizado por pastas. */
export async function gerarPacote(
  numero: string,
  divisoes: Divisao[],
  moveis: Movel[],
  op: OpcoesPacote,
  ctx: Contexto,
  progresso?: (feito: number, total: number) => void,
  tampos: Record<string, Tampo> = {},
) {
  const mod = await carregarModelos();
  const zip = new JSZip();
  const raiz = zip.folder(seguro(numero))!;
  const lista: string[] = [];
  const tarefas: (() => Promise<void>)[] = [];

  for (const d of divisoes) {
    const doProduto = moveis.filter((m) => m.divisao_id === d.id);
    if (!doProduto.length) continue;
    const cod = codigoProduto(numero, d) ?? d.designacao;
    const pasta = raiz.folder(seguro(`${String(d.ordem).padStart(2, "0")}_${cod}`))!;
    if (op.conjunto) tarefas.push(async () => {
      const nome = `${cod}.pdf`;
      pasta.file(nome, await pdfConjunto(mod, d, doProduto, cod, ctx, tampos[d.id]));
      lista.push(`${cod}/${nome}`);
    });
    const t = tampos[d.id];
    const comTampo = t?.incluir ? [...doProduto, movelTampo(t, d, doProduto, numero)] : doProduto;
    for (const m of comTampo) {
      const pm = pasta.folder(seguro(m.codigo ?? m.ref))!;
      if (op.moveis) tarefas.push(async () => {
        const nome = `${m.codigo ?? m.ref}.pdf`;
        pm.file(seguro(nome), await pdfMovel(mod, m, ctx));
        lista.push(`${cod}/${m.codigo}/${nome}`);
      });
      for (const p of m.pecas) {
        const base = seguro(p.codigo ?? `${m.ref}_${p.designacao}`);
        if (op.pecasPdf) tarefas.push(async () => {
          pm.folder("PDF")!.file(`${base}.pdf`, await pdfPeca(mod, m, p, ctx));
          lista.push(`${cod}/${m.codigo}/PDF/${base}.pdf`);
        });
        if (op.pecasDxf) tarefas.push(async () => {
          pm.folder("DXF")!.file(`${base}.dxf`, dxfPeca(p, furacao(p, m)));
          lista.push(`${cod}/${m.codigo}/DXF/${base}.dxf`);
        });
      }
    }
  }
  let feito = 0;
  for (const t of tarefas) {
    await t();
    progresso?.(++feito, tarefas.length);
  }
  raiz.file(
    "LEIA-ME.txt",
    [
      `Projecto ${numero} — desenhos gerados a ${ctx.data} por ${ctx.desenhou}.`,
      "Codificação provisória. Furações propostas segundo a INT.231 (a validar pelo gabinete técnico).",
      "DXF em mm: camada CONTORNO, furos de face em FURO_D<diâmetro>_P<profundidade>, furos de topo em TOPO_D<d>_P<p>.",
      "",
      ...lista.sort(),
    ].join("\r\n"),
  );
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { blob, lista };
}
