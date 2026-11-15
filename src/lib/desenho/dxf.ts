/** DXF (R12, ASCII, mm) de uma peça: contorno e furações por camada, para SolidWorks/CNC. */
import type { Peca } from "../orcamento";
import type { Furo } from "./geometria";

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

export function dxfPeca(p: Peca, furos: Furo[]): string {
  const camadas = new Set<string>(["CONTORNO", "TEXTO"]);
  const ents: string[] = [];
  const linha = (x1: number, y1: number, x2: number, y2: number, c = "CONTORNO") =>
    ents.push(`0\nLINE\n8\n${c}\n10\n${n(x1)}\n20\n${n(y1)}\n30\n0\n11\n${n(x2)}\n21\n${n(y2)}\n31\n0`);
  const W = p.l, H = p.c;
  linha(0, 0, W, 0); linha(W, 0, W, H); linha(W, H, 0, H); linha(0, H, 0, 0);
  for (const f of furos) {
    const prof = f.prof === "vazado" ? "VAZ" : `P${f.prof}`;
    if (f.face === "F") {
      const c = `FURO_D${f.d}_${prof}`;
      camadas.add(c);
      ents.push(`0\nCIRCLE\n8\n${c}\n10\n${n(f.v)}\n20\n${n(f.u)}\n30\n0\n40\n${n(f.d / 2)}`);
    } else {
      // furo em topo: marca na aresta (eixo do furo), na camada própria
      const c = `TOPO_D${f.d}_${prof}`;
      camadas.add(c);
      const dir = f.u === 0 ? 1 : -1;
      linha(f.v, f.u, f.v, f.u + dir * (typeof f.prof === "number" ? f.prof : 10), c);
    }
  }
  camadas.add("TEXTO");
  ents.push(`0\nTEXT\n8\nTEXTO\n10\n0\n20\n${n(-15)}\n30\n0\n40\n6\n1\n${(p.codigo ?? "").replace(/\n/g, " ")} ${p.c}x${p.l}x${p.e}`);
  const tabelaCamadas = [...camadas]
    .map((c, i) => `0\nLAYER\n2\n${c}\n70\n0\n62\n${c === "CONTORNO" ? 7 : c === "TEXTO" ? 3 : (i % 6) + 1}\n6\nCONTINUOUS`)
    .join("\n");
  return [
    "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC",
    `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${camadas.size}\n${tabelaCamadas}\n0\nENDTAB\n0\nENDSEC`,
    `0\nSECTION\n2\nENTITIES\n${ents.join("\n")}\n0\nENDSEC`,
    "0\nEOF\n",
  ].join("\n");
}
