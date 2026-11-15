"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ESTADOS, type EstadoPedido, type Membro } from "@/lib/pedido";
import TabelaFiltravel, { type Coluna } from "@/components/TabelaFiltravel";

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
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Linha[]>([]);
  const [equipa, setEquipa] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<EstadoPedido | "todos">("todos");
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

  const linhas = useMemo(() => (filtro === "todos" ? pedidos : pedidos.filter((p) => p.estado === filtro)), [pedidos, filtro]);

  const colunas: Coluna<Linha>[] = [
    { k: "ref", titulo: "Referência", valor: (p) => p.referencia, render: (p) => <span className="font-mono font-semibold text-marca">{p.referencia}</span> },
    { k: "num", titulo: "Nº projecto", valor: (p) => p.numero_projecto ?? "", render: (p) => <span className="font-mono">{p.numero_projecto ?? "—"}</span> },
    {
      k: "proj",
      titulo: "Projecto",
      valor: (p) => p.nome_projecto,
      render: (p) => {
        const porVer = p.comentarios.filter((c) => !c.resolvido).length;
        return (
          <span className="font-medium">
            {p.nome_projecto}
            {porVer > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800" title="Comentários por aplicar">💬 {porVer}</span>}
          </span>
        );
      },
    },
    { k: "div", titulo: "Divisões", valor: (p) => p.pedido_divisoes.map((d) => `${d.quantidade}× ${d.designacao}`).join(", ") },
    {
      k: "cli",
      titulo: "Cliente",
      valor: (p) => [p.contacto_nome, p.contacto_empresa].filter(Boolean).join(" · "),
      render: (p) => (
        <>
          {p.contacto_nome}
          {p.contacto_empresa && <span className="block text-xs text-slate-500">{p.contacto_empresa}</span>}
        </>
      ),
    },
    { k: "resp", titulo: "Responsável", filtro: "opcoes", valor: (p) => (p.responsavel ? equipa[p.responsavel] ?? "" : "") },
    { k: "data", titulo: "Data", valor: (p) => p.created_at.slice(0, 10), render: (p) => new Date(p.created_at).toLocaleDateString("pt-PT") },
    {
      k: "estado",
      titulo: "Estado",
      filtro: "opcoes",
      valor: (p) => ESTADOS[p.estado].nome,
      render: (p) => (
        <>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADOS[p.estado].cor}`}>{ESTADOS[p.estado].nome}</span>
          {p.origem === "interno" && <span className="ml-1 text-xs text-slate-400">interno</span>}
        </>
      ),
    },
    { k: "origem", titulo: "Origem", filtro: "opcoes", valor: (p) => (p.origem === "interno" ? "Interno" : "Cliente") },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Orçamentos</h1>
      <div className="mt-4 flex flex-wrap gap-2">
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
      <div className="mt-4">
        <TabelaFiltravel
          colunas={colunas}
          linhas={linhas}
          chave={(p) => p.id}
          aCarregar={aCarregar}
          vazio="Sem pedidos."
          onLinha={(p) => router.push(`/interno/pedidos/${p.id}`)}
        />
      </div>
    </div>
  );
}
