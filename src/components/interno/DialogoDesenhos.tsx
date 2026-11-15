"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Divisao } from "@/lib/pedido";
import type { Movel, Tampo } from "@/lib/orcamento";

type Opcoes = { conjunto: boolean; moveis: boolean; pecasPdf: boolean; pecasDxf: boolean };

/** Pergunta que ficheiros gerar, cria o ZIP, guarda-o no projecto e descarrega-o. */
export default function DialogoDesenhos({
  aberto,
  onFechar,
  pedidoId,
  numero,
  referencia,
  versao,
  divisoes,
  moveis,
  tampos = {},
  autor,
}: {
  tampos?: Record<string, Tampo>;
  aberto: boolean;
  onFechar: () => void;
  pedidoId: string;
  numero: string;
  referencia: string;
  versao: number | null;
  divisoes: Divisao[];
  moveis: Movel[];
  autor: string;
}) {
  const [op, setOp] = useState<Opcoes>({ conjunto: true, moveis: true, pecasPdf: true, pecasDxf: true });
  const [estado, setEstado] = useState("");
  const [aGerar, setAGerar] = useState(false);
  if (!aberto) return null;

  const nPecas = moveis.reduce((s, m) => s + m.pecas.length, 0);
  const total =
    (op.conjunto ? divisoes.filter((d) => moveis.some((m) => m.divisao_id === d.id)).length : 0) +
    (op.moveis ? moveis.length : 0) +
    (op.pecasPdf ? nPecas : 0) +
    (op.pecasDxf ? nPecas : 0);

  async function gerar() {
    setAGerar(true);
    setEstado("A preparar…");
    try {
      const { gerarPacote } = await import("@/lib/desenho/pacote");
      const agora = new Date();
      const ctx = { numero, data: agora.toLocaleDateString("pt-PT"), desenhou: autor, processo: referencia };
      const { blob, lista } = await gerarPacote(numero, divisoes, moveis, op, ctx, (f, t) => setEstado(`A gerar ficheiros… ${f}/${t}`), tampos);
      const carimbo = agora.toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const nome = `${numero}_desenhos_${carimbo}.zip`;
      // descarrega já
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nome;
      a.click();
      URL.revokeObjectURL(a.href);
      // guarda uma cópia junto do projecto
      setEstado("A guardar cópia no projecto…");
      const path = `desenhos/${pedidoId}/${carimbo}_${numero}.zip`;
      const up = await supabase().storage.from("pedidos").upload(path, blob, { contentType: "application/zip" });
      if (up.error) throw new Error(`Descarregado, mas não foi possível guardar a cópia: ${up.error.message}`);
      const { error } = await supabase().rpc("registar_desenhos", {
        p_pedido: pedidoId,
        p_path: path,
        p_versao: versao,
        p_conteudo: { opcoes: op, ficheiros: lista },
        p_n: lista.length,
        p_tamanho: blob.size,
      });
      if (error) throw new Error(error.message);
      setEstado(`Pronto: ${lista.length} ficheiros. A cópia fica disponível na página do pedido.`);
    } catch (e) {
      setEstado(e instanceof Error ? e.message : "Erro ao gerar os desenhos.");
    } finally {
      setAGerar(false);
    }
  }

  const caixa = (k: keyof Opcoes, titulo: string, desc: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={op[k]} disabled={aGerar} onChange={(e) => setOp({ ...op, [k]: e.target.checked })} />
      <span><strong>{titulo}</strong> — {desc}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !aGerar && onFechar()}>
      <div className="cartao w-full max-w-lg space-y-4 p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <h2 className="text-lg font-semibold">Gerar desenhos</h2>
        <p className="text-sm text-slate-600">Que ficheiros pretende? Ficam numa pasta ZIP organizada por produto e móvel, e é guardada uma cópia junto do projecto.</p>
        <div className="space-y-2">
          {caixa("conjunto", "PDF do conjunto", "alçado frontal e perspectiva de cada produto (ex.: cozinha completa)")}
          {caixa("moveis", "PDF de montagem dos móveis (10…) e sub-conjuntos (13.4…)", "vistas, perspectiva, balões e lista de material; gavetas como pré-montagem")}
          {caixa("pecasPdf", "PDF das peças (03.4…)", "geometria cotada, furação, orlas e material")}
          {caixa("pecasDxf", "DXF das peças", "contorno e furações por camada, para SolidWorks/CNC")}
        </div>
        <p className="text-xs text-slate-500">
          {total} ficheiro(s). Usa a versão guardada do orçamento{versao ? ` (v${versao})` : ""}. Codificação provisória; furação segundo a INT.231, a validar pelo gabinete técnico. STEP numa fase seguinte.
        </p>
        {estado && <p className="rounded bg-slate-50 p-2 text-sm text-slate-700" role="status">{estado}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" disabled={aGerar} onClick={onFechar}>Fechar</button>
          <button className="btn-primario" disabled={aGerar || total === 0} onClick={gerar}>{aGerar ? "A gerar…" : "Gerar e descarregar"}</button>
        </div>
      </div>
    </div>
  );
}
