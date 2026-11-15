"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { NIVEIS, type Membro, type Nivel } from "@/lib/pedido";
import { usePerfil } from "@/components/interno/ContextoInterno";
import DialogoMotivo from "@/components/DialogoMotivo";

export default function Utilizadores() {
  const perfil = usePerfil();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [edicao, setEdicao] = useState<Membro | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase().rpc("equipa");
    setMembros((data as Membro[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (perfil.nivel !== "admin")
    return <p className="p-10 text-center text-slate-500">Só a administração gere utilizadores.</p>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">Utilizadores</h1>
      <p className="mt-1 text-sm text-slate-600">
        Para criar uma conta nova: Supabase → Authentication → Users → <em>Add user</em>. A pessoa aparece aqui como
        colaborador inactivo; depois atribua-lhe o nível e active a conta.
      </p>

      <div className="cartao mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Nível</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{m.nome}</td>
                <td className="px-4 py-3">{m.email}</td>
                <td className="px-4 py-3">{NIVEIS[m.nivel]}</td>
                <td className="px-4 py-3">
                  {m.ativo ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Activo</span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sm font-medium text-marca hover:underline" onClick={() => setEdicao({ ...m })}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DialogoMotivo
        aberto={!!edicao}
        titulo={`Editar ${edicao?.email ?? ""}`}
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
              <select
                id="u-nivel"
                className="campo"
                value={edicao.nivel}
                onChange={(e) => setEdicao({ ...edicao, nivel: e.target.value as Nivel })}
              >
                {(Object.keys(NIVEIS) as Nivel[]).map((n) => (
                  <option key={n} value={n}>{NIVEIS[n]}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edicao.ativo} onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })} />
              Conta activa
            </label>
          </div>
        )}
      </DialogoMotivo>
    </div>
  );
}
