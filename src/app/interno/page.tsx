"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ESTADOS, type EstadoPedido, type Membro } from "@/lib/pedido";

type Linha = {
  id: string;
  referencia: string;
  nome_projecto: string;
  contacto_nome: string;
  contacto_empresa: string | null;
  estado: EstadoPedido;
  numero_projecto: string | null;
  origem: string;
  responsavel: string | null;
  created_at: string;
  pedido_divisoes: { designacao: string; quantidade: number }[];
  comentarios: { resolvido: boolean }[];
};

export default function ListaOrcamentos() {
  const [pedidos, setPedidos] = useState<Linha[]>([]);
  const [equipa, setEquipa] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<EstadoPedido | "todos">("todos");
  const [pesquisa, setPesquisa] = useState("");
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [{ data }, { data: eq }] = await Promise.all([
        sb
          .from("pedidos")
          .select(
            "id,referencia,nome_projecto,contacto_nome,contacto_empresa,estado,numero_projecto,origem,responsavel,created_at,pedido_divisoes(designacao,quantidade),comentarios(resolvido)",
          )
          .order("created_at", { ascending: false }),
        sb.rpc("equipa"),
      ]);
      setPedidos((data as Linha[]) ?? []);
      setEquipa(Object.fromEntries(((eq as Membro[]) ?? []).map((m) => [m.id, m.nome])));
      setACarregar(false);
    })();
  }, []);

  const visiveis = useMemo(() => {
    const q = pesquisa.trim().toLowerCase();
    return pedidos.filter(
      (p) =>
        (filtro === "todos" || p.estado === filtro) &&
        (!q ||
          [p.referencia, p.numero_projecto, p.nome_projecto, p.contacto_nome, p.contacto_empresa]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q))),
    );
  }, [pedidos, filtro, pesquisa]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">Orçamentos</h1>
        <input
          type="search"
          className="campo max-w-xs"
          placeholder="Pesquisar referência, nº, projecto, cliente…"
          aria-label="Pesquisar orçamentos"
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["todos", "novo", "aberto", "pendente", "terminado"] as const).map((e) => {
          const n = e === "todos" ? pedidos.length : pedidos.filter((p) => p.estado === e).length;
          return (
            <button
              key={e}
              onClick={() => setFiltro(e)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${filtro === e ? "bg-marca text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
            >
              {e === "todos" ? "Todos" : ESTADOS[e].nome} ({n})
            </button>
          );
        })}
      </div>

      <div className="cartao mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Referência</th>
              <th className="px-4 py-3">Nº projecto</th>
              <th className="px-4 py-3">Projecto</th>
              <th className="px-4 py-3">Divisões</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {aCarregar && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">A carregar…</td></tr>
            )}
            {!aCarregar && visiveis.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Sem pedidos.</td></tr>
            )}
            {visiveis.map((p) => {
              const porVer = p.comentarios.filter((c) => !c.resolvido).length;
              return (
                <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono">
                    <Link href={`/interno/pedidos/${p.id}`} className="font-semibold text-marca hover:underline">
                      {p.referencia}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono">{p.numero_projecto ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    {p.nome_projecto}
                    {porVer > 0 && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800" title="Comentários por aplicar">
                        💬 {porVer}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{p.pedido_divisoes.map((d) => `${d.quantidade}× ${d.designacao}`).join(", ")}</td>
                  <td className="px-4 py-3">
                    {p.contacto_nome}
                    {p.contacto_empresa && <span className="block text-xs text-slate-500">{p.contacto_empresa}</span>}
                  </td>
                  <td className="px-4 py-3">{p.responsavel ? equipa[p.responsavel] ?? "—" : "—"}</td>
                  <td className="px-4 py-3">{new Date(p.created_at).toLocaleDateString("pt-PT")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADOS[p.estado].cor}`}>{ESTADOS[p.estado].nome}</span>
                    {p.origem === "interno" && <span className="ml-1 text-xs text-slate-400">interno</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
