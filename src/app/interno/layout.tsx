"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { NIVEIS } from "@/lib/pedido";
import { ContextoInterno, eOrcamentista, type PerfilAtual } from "@/components/interno/ContextoInterno";

export default function LayoutInterno({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [perfil, setPerfil] = useState<PerfilAtual | null>(null);
  const [estado, setEstado] = useState<"a_carregar" | "ok" | "inactivo">("a_carregar");

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: s } = await sb.auth.getSession();
      if (!s.session) {
        router.replace("/login");
        return;
      }
      const { data: p } = await sb
        .from("profiles")
        .select("id,nome,email,nivel,ativo")
        .eq("id", s.session.user.id)
        .single();
      if (!p?.ativo) {
        setEstado("inactivo");
        return;
      }
      setPerfil(p as PerfilAtual);
      setEstado("ok");
    })();
  }, [router]);

  async function sair() {
    await supabase().auth.signOut();
    router.replace("/");
  }

  if (estado === "a_carregar") return <p className="p-10 text-center text-slate-500">A carregar…</p>;

  if (estado === "inactivo" || !perfil)
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Conta a aguardar activação</h1>
        <p className="mt-2 text-slate-600">A administração tem de activar a sua conta e atribuir-lhe um nível de acesso.</p>
        <button className="btn-secundario mt-6" onClick={sair}>Sair</button>
      </div>
    );

  const separadores = [
    { href: "/interno", nome: "Orçamentos", visivel: true },
    { href: "/interno/novo", nome: "Abrir orçamento", visivel: eOrcamentista(perfil.nivel) },
    { href: "/interno/base-dados", nome: "Base de dados", visivel: true },
    { href: "/interno/utilizadores", nome: "Utilizadores", visivel: perfil.nivel === "admin" },
  ].filter((s) => s.visivel);

  const activo = (href: string) =>
    href === "/interno" ? caminho === "/interno" || caminho.startsWith("/interno/pedidos") : caminho.startsWith(href);

  return (
    <ContextoInterno value={perfil}>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {separadores.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${
                  activo(s.href) ? "border-marca text-marca" : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {s.nome}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 py-2 text-sm">
            <span className="text-slate-600">
              {perfil.nome || perfil.email} · <span className="font-medium">{NIVEIS[perfil.nivel]}</span>
            </span>
            <button className="text-marca hover:underline" onClick={sair}>Sair</button>
          </div>
        </div>
      </div>
      {children}
    </ContextoInterno>
  );
}
