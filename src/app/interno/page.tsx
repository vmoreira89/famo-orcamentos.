"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ESTADOS, type EstadoPedido } from "@/lib/pedido";

type Perfil = { nome: string; email: string; nivel: string; ativo: boolean };
type Linha = {
  id: string;
  referencia: string;
  nome_projecto: string;
  contacto_nome: string;
  estado: EstadoPedido;
  numero_projecto: string | null;
  origem: string;
  created_at: string;
  pedido_divisoes: { designacao: string; quantidade: number }[];
};

const NIVEIS: Record<string, string> = {
  admin: "Administração",
  orcamentista_chefe: "Orçamentista chefe",
  orcamentista: "Orçamentista",
  colaborador: "Colaborador",
};

export default function Interno() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [pedidos, setPedidos] = useState<Linha[]>([]);
  const [filtro, setFiltro] = useState<EstadoPedido | "todos">("todos");
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: s } = await sb.auth.getSession();
      if (!s.session) {
        router.replace("/login");
        return;
      }
      const { data: p } = await sb.from("profiles").select("nome,email,nivel,ativo").eq("id", s.session.user.id).single();
      setPerfil(p as Perfil);
      if (p?.ativo) {
        const { data } = await sb
          .from("pedidos")
          .select("id,referencia,nome_projecto,contacto_nome,estado,numero_projecto,origem,created_at,pedido_divisoes(designacao,quantidade)")
          .order("created_at", { ascending: false });
        setPedidos((data as Linha[]) ?? []);
      }
      setACarregar(false);
    })();
  }, [router]);

  async function sair() {
    await supabase().auth.signOut();
    router.replace("/");
  }

  if (aCarregar) return <p className="p-10 text-center text-slate-500">A carregar…</p>;

  if (!perfil?.ativo)
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Conta a aguardar activação</h1>
        <p className="mt-2 text-slate-600">A administração tem de activar a sua conta e atribuir-lhe um nível de acesso.</p>
        <button className="btn-secundario mt-6" onClick={sair}>Sair</button>
      </div>
    );

  const visiveis = filtro === "todos" ? pedidos : pedidos.filter((p) => p.estado === filtro);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Orçamentos</h1>
          <p className="text-sm text-slate-500">
            {perfil.nome || perfil.email} · {NIVEIS[perfil.nivel]}
          </p>
        </div>
        <button className="btn-secundario" onClick={sair}>Sair</button>
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
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Sem pedidos.</td></tr>
            )}
            {visiveis.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono">{p.referencia}</td>
                <td className="px-4 py-3 font-mono">{p.numero_projecto ?? "—"}</td>
                <td className="px-4 py-3 font-medium">{p.nome_projecto}</td>
                <td className="px-4 py-3">{p.pedido_divisoes.map((d) => `${d.quantidade}× ${d.designacao}`).join(", ")}</td>
                <td className="px-4 py-3">{p.contacto_nome}</td>
                <td className="px-4 py-3">{new Date(p.created_at).toLocaleDateString("pt-PT")}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADOS[p.estado].cor}`}>{ESTADOS[p.estado].nome}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Fase 1: consulta. A abertura de orçamentos, atribuição de nº de projecto e edição chegam na Fase 2.
      </p>
    </div>
  );
}
