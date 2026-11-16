"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Divisao, Ficheiro } from "@/lib/pedido";
import { TIPOS_MOVEL } from "@/lib/orcamento";
import { cotasSoltas, extrairTexto, proporDeTexto, type PropostaMovel, type ResultadoLeitura } from "@/lib/leitura";
import CampoNumero from "@/components/CampoNumero";

const ESTADO: Record<ResultadoLeitura["estado"], { t: string; c: string }> = {
  lido: { t: "lido", c: "bg-emerald-100 text-emerald-800" },
  sem_texto: { t: "sem texto", c: "bg-amber-100 text-amber-800" },
  nao_suportado: { t: "não lido", c: "bg-slate-100 text-slate-600" },
  erro: { t: "erro", c: "bg-rose-100 text-rose-800" },
};

/**
 * Lê os ficheiros de apoio de uma divisão, propõe móveis e deixa o orçamentista
 * rever tudo (tipo, quantidade, medidas, portas, gavetas) antes de os acrescentar.
 */
export default function DialogoLeitura({
  divisao,
  aberto,
  onFechar,
  onAcrescentar,
}: {
  divisao: Divisao;
  aberto: boolean;
  onFechar: () => void;
  onAcrescentar: (p: PropostaMovel[]) => void;
}) {
  const [estado, setEstado] = useState("");
  const [lidos, setLidos] = useState<ResultadoLeitura[]>([]);
  const [props, setProps] = useState<PropostaMovel[]>([]);
  const [verTexto, setVerTexto] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    (async () => {
      setEstado("A procurar ficheiros…");
      setLidos([]);
      setProps([]);
      const sb = supabase();
      const { data } = await sb.from("pedido_ficheiros").select("*").eq("pedido_id", divisao.pedido_id).or(`divisao_id.eq.${divisao.id},divisao_id.is.null`).order("created_at");
      const fs = (data as Ficheiro[]) ?? [];
      if (!fs.length) return setEstado("Esta divisão não tem ficheiros de apoio.");
      const res: ResultadoLeitura[] = [];
      const todas: PropostaMovel[] = [];
      for (const [i, f] of fs.entries()) {
        if (cancelado) return;
        setEstado(`A ler ${i + 1}/${fs.length}: ${f.nome_original}`);
        const dl = await sb.storage.from("pedidos").download(f.storage_path);
        if (dl.error || !dl.data) {
          res.push({ nome: f.nome_original, estado: "erro", texto: "", nota: dl.error?.message ?? "Não foi possível descarregar." });
          continue;
        }
        const r = await extrairTexto(await dl.data.arrayBuffer(), f.nome_original, f.mime ?? "");
        res.push(r);
        if (r.estado === "lido") todas.push(...proporDeTexto(r.texto, f.nome_original, divisao.tipo));
      }
      if (cancelado) return;
      setLidos(res);
      setProps(todas);
      setEstado(todas.length ? "" : "Não foram encontradas medidas de móveis (L × P × A) no texto dos ficheiros.");
    })();
    return () => { cancelado = true; };
  }, [aberto, divisao]);

  if (!aberto) return null;
  const set = (k: string, a: Partial<PropostaMovel>) => setProps((ps) => ps.map((p) => (p.chave === k ? { ...p, ...a } : p)));
  const escolhidas = props.filter((p) => p.incluir);
  const num = (k: string, campo: keyof PropostaMovel, v: number, w = "w-16") => (
    <CampoNumero className={`rounded border border-slate-300 px-1 py-0.5 text-sm ${w}`} valor={v} onValor={(n) => set(k, { [campo]: Math.max(0, Math.round(n ?? 0)) })} />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onFechar}>
      <div className="cartao max-h-[90vh] w-full max-w-5xl space-y-4 overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <h2 className="text-lg font-semibold">Ler ficheiros de apoio · {divisao.designacao}</h2>
        <p className="text-sm text-slate-600">
          A app lê o texto dos ficheiros (PDF com texto, DXF, Excel, Word, TXT/CSV) e procura móveis com medidas. Reveja a proposta antes de a acrescentar ao orçamento.
        </p>

        {lidos.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="py-1">Ficheiro</th><th>Leitura</th><th>Observação</th><th></th></tr></thead>
            <tbody>
              {lidos.map((r) => (
                <tr key={r.nome} className="border-b last:border-0 align-top">
                  <td className="py-1 pr-2">{r.nome}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO[r.estado].c}`}>{ESTADO[r.estado].t}</span></td>
                  <td className="text-xs text-slate-600">
                    {r.nota || `${props.filter((p) => p.origem.startsWith(r.nome)).length} móvel(eis) encontrado(s)`}
                    {r.estado === "lido" && !props.some((p) => p.origem.startsWith(r.nome)) && cotasSoltas(r.texto).length > 0 && (
                      <span className="block">Cotas encontradas: {cotasSoltas(r.texto).join(", ")} mm</span>
                    )}
                  </td>
                  <td>{r.texto && <button className="text-xs text-marca hover:underline" onClick={() => setVerTexto(verTexto === r.nome ? null : r.nome)}>{verTexto === r.nome ? "Esconder texto" : "Ver texto"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {verTexto && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{lidos.find((r) => r.nome === verTexto)?.texto}</pre>}

        {estado && <p className="rounded bg-slate-50 p-2 text-sm text-slate-700" role="status">{estado}</p>}

        {props.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr><th></th><th className="py-1">Tipo</th><th>Designação</th><th>Qtd</th><th>Largura</th><th>Profund.</th><th>Altura</th><th>Portas</th><th>Gavetas</th></tr>
              </thead>
              <tbody>
                {props.map((p) => (
                  <tr key={p.chave} className={`border-b last:border-0 align-top ${p.incluir ? "" : "opacity-50"}`} title={p.origem}>
                    <td className="py-1 pr-1"><input type="checkbox" checked={p.incluir} onChange={(e) => set(p.chave, { incluir: e.target.checked })} aria-label="Incluir" /></td>
                    <td>
                      <select className="rounded border border-slate-300 px-1 py-0.5 text-sm" value={p.tipo} onChange={(e) => set(p.chave, { tipo: e.target.value as PropostaMovel["tipo"] })}>
                        {Object.entries(TIPOS_MOVEL).filter(([t]) => t !== "tampo").map(([t, v]) => <option key={t} value={t}>{v.nome}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="w-56 rounded border border-slate-300 px-1 py-0.5 text-sm" value={p.designacao} onChange={(e) => set(p.chave, { designacao: e.target.value })} />
                      <span className="block max-w-56 truncate text-[11px] text-slate-400">{p.origem}</span>
                    </td>
                    <td>{num(p.chave, "qtd", p.qtd, "w-12")}</td>
                    <td>{num(p.chave, "L", p.L)}</td>
                    <td>{num(p.chave, "P", p.P)}</td>
                    <td>{num(p.chave, "A", p.A)}</td>
                    <td>{num(p.chave, "portas", p.portas, "w-12")}</td>
                    <td>{num(p.chave, "gavetas", p.gavetas, "w-12")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-500">
          Imagens e esboços à mão não são lidos automaticamente: isso precisa de IA (pode ser activada mais tarde). Para DWG, exporte para DXF ou PDF.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={onFechar}>Fechar</button>
          <button className="btn-primario" disabled={escolhidas.length === 0} onClick={() => { onAcrescentar(escolhidas); onFechar(); }}>
            Acrescentar {escolhidas.length} móvel(eis) ao orçamento
          </button>
        </div>
      </div>
    </div>
  );
}
