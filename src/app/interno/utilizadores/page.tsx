"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { NIVEIS, dataHora, type Nivel } from "@/lib/pedido";
import { usePerfil } from "@/components/interno/ContextoInterno";
import DialogoMotivo from "@/components/DialogoMotivo";
import TabelaFiltravel, { type Coluna } from "@/components/TabelaFiltravel";

type Utilizador = { id: string; nome: string; email: string; nivel: Nivel; ativo: boolean; recusado: boolean; recusado_motivo: string | null; created_at: string };

const estadoDe = (u: Utilizador) => (u.ativo ? "Activo" : u.recusado ? "Recusado" : "Pendente");

export default function Utilizadores() {
  const perfil = usePerfil();
  const [membros, setMembros] = useState<Utilizador[]>([]);
  const [edicao, setEdicao] = useState<Utilizador | null>(null);
  const [recusar, setRecusar] = useState<Utilizador | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase().rpc("equipa");
    setMembros((data as Utilizador[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (perfil.nivel !== "admin") return <p className="p-10 text-center text-slate-500">Só a administração gere utilizadores.</p>;

  const pendentes = membros.filter((m) => !m.ativo && !m.recusado);

  const colunas: Coluna<Utilizador>[] = [
    { k: "nome", titulo: "Nome", valor: (m) => m.nome, render: (m) => <span className="font-medium">{m.nome}</span> },
    { k: "email", titulo: "Email", valor: (m) => m.email },
    { k: "nivel", titulo: "Nível", filtro: "opcoes", valor: (m) => NIVEIS[m.nivel] },
    {
      k: "estado",
      titulo: "Estado",
      filtro: "opcoes",
      valor: estadoDe,
      render: (m) => {
        const e = estadoDe(m);
        const cor = e === "Activo" ? "bg-emerald-100 text-emerald-800" : e === "Pendente" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600";
        return (
          <span title={m.recusado_motivo ?? ""} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cor}`}>{e}</span>
        );
      },
    },
    { k: "data", titulo: "Registo", valor: (m) => m.created_at, render: (m) => dataHora(m.created_at) },
    {
      k: "acoes",
      titulo: "",
      filtro: "nenhum",
      valor: () => "",
      render: (m) => (
        <span className="flex justify-end gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
          {!m.ativo && !m.recusado && (
            <>
              <button className="font-medium text-emerald-700 hover:underline" onClick={() => setEdicao({ ...m, ativo: true, nivel: "colaborador" })}>Aceitar</button>
              <button className="text-rose-700 hover:underline" onClick={() => setRecusar(m)}>Recusar</button>
            </>
          )}
          <button className="font-medium text-marca hover:underline" onClick={() => setEdicao({ ...m })}>Editar</button>
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">Utilizadores</h1>
      <p className="mt-1 text-sm text-slate-600">
        Novos colaboradores pedem acesso em «Área de colaboradores → Pedir acesso». Ficam pendentes até a administração os aceitar (com nível de acesso) ou recusar.
      </p>
      {pendentes.length > 0 && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {pendentes.length} pedido(s) de acesso à espera de decisão: {pendentes.map((p) => p.nome).join(", ")}.
        </p>
      )}
      <div className="mt-6">
        <TabelaFiltravel colunas={colunas} linhas={membros} chave={(m) => m.id} classeLinha={(m) => (!m.ativo && !m.recusado ? "bg-amber-50/60" : "")} />
      </div>

      <DialogoMotivo
        aberto={!!edicao}
        titulo={edicao && !membros.find((m) => m.id === edicao.id)?.ativo && edicao.ativo ? `Aceitar ${edicao.email}` : `Editar ${edicao?.email ?? ""}`}
        motivoPadrao={edicao && !membros.find((m) => m.id === edicao.id)?.ativo && edicao.ativo ? "Pedido de acesso aceite" : ""}
        onFechar={() => setEdicao(null)}
        onConfirmar={async (motivo) => {
          if (!edicao) return null;
          const { error } = await supabase().rpc("atualizar_utilizador", {
            p_id: edicao.id,
            p_nome: edicao.nome === edicao.email ? "" : edicao.nome,
            p_nivel: edicao.nivel,
            p_ativo: edicao.ativo,
            p_motivo: motivo,
          });
          if (error) return error.message;
          await carregar();
          return null;
        }}
      >
        {edicao && (
          <div className="space-y-3">
            <div>
              <label className="rotulo" htmlFor="u-nome">Nome</label>
              <input id="u-nome" className="campo" value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
            </div>
            <div>
              <label className="rotulo" htmlFor="u-nivel">Nível de acesso</label>
              <select id="u-nivel" className="campo" value={edicao.nivel} onChange={(e) => setEdicao({ ...edicao, nivel: e.target.value as Nivel })}>
                {(Object.keys(NIVEIS) as Nivel[]).map((n) => <option key={n} value={n}>{NIVEIS[n]}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edicao.ativo} onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })} />
              Conta activa
            </label>
          </div>
        )}
      </DialogoMotivo>

      <DialogoMotivo
        aberto={!!recusar}
        titulo={`Recusar acesso a ${recusar?.email ?? ""}`}
        descricao="A pessoa continua sem acesso. Pode reverter mais tarde editando o utilizador."
        textoConfirmar="Recusar"
        onFechar={() => setRecusar(null)}
        onConfirmar={async (motivo) => {
          const { error } = await supabase().rpc("recusar_utilizador", { p_id: recusar!.id, p_motivo: motivo });
          if (error) return error.message;
          await carregar();
          return null;
        }}
      />
    </div>
  );
}
