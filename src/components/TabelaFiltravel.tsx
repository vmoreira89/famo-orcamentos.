"use client";

import { useMemo, useState } from "react";

export type Coluna<T> = {
  k: string;
  titulo: string;
  /** Valor usado para filtrar e ordenar. */
  valor: (l: T) => string | number | null | undefined;
  /** Apresentação na célula (por omissão, o valor). */
  render?: (l: T) => React.ReactNode;
  /** "opcoes" mostra uma lista com os valores existentes; "texto" uma caixa de pesquisa. */
  filtro?: "texto" | "opcoes" | "nenhum";
  direita?: boolean;
  classe?: string;
};

const normal = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Tabela com filtro e ordenação em todos os cabeçalhos. */
export default function TabelaFiltravel<T>({
  colunas,
  linhas,
  chave,
  onLinha,
  classeLinha,
  vazio = "Sem registos.",
  aCarregar,
}: {
  colunas: Coluna<T>[];
  linhas: T[];
  chave: (l: T) => string;
  onLinha?: (l: T) => void;
  classeLinha?: (l: T) => string;
  vazio?: string;
  aCarregar?: boolean;
}) {
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [ordem, setOrdem] = useState<{ k: string; asc: boolean } | null>(null);

  const opcoes = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const c of colunas)
      if (c.filtro === "opcoes")
        o[c.k] = [...new Set(linhas.map((l) => String(c.valor(l) ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
    return o;
  }, [colunas, linhas]);

  const visiveis = useMemo(() => {
    let r = linhas.filter((l) =>
      colunas.every((c) => {
        const f = filtros[c.k];
        if (!f) return true;
        const v = c.valor(l);
        return c.filtro === "opcoes" ? String(v ?? "") === f : normal(v).includes(normal(f));
      }),
    );
    if (ordem) {
      const c = colunas.find((x) => x.k === ordem.k);
      if (c)
        r = [...r].sort((a, b) => {
          const va = c.valor(a), vb = c.valor(b);
          const cmp =
            typeof va === "number" && typeof vb === "number"
              ? va - vb
              : String(va ?? "").localeCompare(String(vb ?? ""), "pt", { numeric: true });
          return ordem.asc ? cmp : -cmp;
        });
    }
    return r;
  }, [linhas, colunas, filtros, ordem]);

  const activos = Object.values(filtros).filter(Boolean).length;

  return (
    <div className="cartao overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {colunas.map((c) => (
              <th key={c.k} className={`px-3 pt-2 ${c.direita ? "text-right" : ""}`}>
                <button
                  className="inline-flex items-center gap-1 uppercase hover:text-slate-800"
                  onClick={() => setOrdem((o) => (o?.k === c.k ? (o.asc ? { k: c.k, asc: false } : null) : { k: c.k, asc: true }))}
                  title="Ordenar"
                >
                  {c.titulo}
                  <span className="text-[10px]">{ordem?.k === c.k ? (ordem.asc ? "▲" : "▼") : "↕"}</span>
                </button>
              </th>
            ))}
          </tr>
          <tr>
            {colunas.map((c) => (
              <th key={c.k} className="px-3 pb-2 pt-1 font-normal normal-case">
                {c.filtro === "nenhum" ? null : c.filtro === "opcoes" ? (
                  <select
                    aria-label={`Filtrar ${c.titulo}`}
                    className="w-full min-w-20 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                    value={filtros[c.k] ?? ""}
                    onChange={(e) => setFiltros({ ...filtros, [c.k]: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {opcoes[c.k]?.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    aria-label={`Filtrar ${c.titulo}`}
                    className="w-full min-w-16 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                    placeholder="Filtrar…"
                    value={filtros[c.k] ?? ""}
                    onChange={(e) => setFiltros({ ...filtros, [c.k]: e.target.value })}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aCarregar && linhas.length === 0 && (
            <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-slate-500">A carregar…</td></tr>
          )}
          {!aCarregar && visiveis.length === 0 && (
            <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-slate-500">{linhas.length ? "Nenhum registo corresponde aos filtros." : vazio}</td></tr>
          )}
          {visiveis.map((l) => (
            <tr
              key={chave(l)}
              onClick={onLinha ? () => onLinha(l) : undefined}
              className={`border-b last:border-0 ${onLinha ? "cursor-pointer hover:bg-slate-50" : ""} ${classeLinha?.(l) ?? ""}`}
            >
              {colunas.map((c) => (
                <td key={c.k} className={`px-3 py-2 ${c.direita ? "text-right tabular-nums" : ""} ${c.classe ?? ""}`}>
                  {c.render ? c.render(l) : (c.valor(l) ?? <span className="text-slate-300">—</span>)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t px-3 py-1.5 text-xs text-slate-500">
        <span>{visiveis.length} de {linhas.length} registo(s)</span>
        {activos > 0 && <button className="text-marca hover:underline" onClick={() => setFiltros({})}>Limpar filtros ({activos})</button>}
      </div>
    </div>
  );
}
