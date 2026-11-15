"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dataHora } from "@/lib/pedido";
import DialogoMotivo from "@/components/DialogoMotivo";
import { eGestao, usePerfil } from "@/components/interno/ContextoInterno";
import { TABELAS, type Campo, type ConfigTabela } from "./config";

type Linha = Record<string, unknown> & { id: string };

export default function BaseDados() {
  const perfil = usePerfil();
  const [activa, setActiva] = useState(TABELAS[0].id);
  const config = TABELAS.find((t) => t.id === activa)!;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Base de dados de apoio ao orçamento</h1>
      <p className="mt-1 text-sm text-slate-600">
        {eGestao(perfil.nivel)
          ? "Pode editar. Todas as alterações pedem motivo e ficam no histórico."
          : "Só consulta. As alterações são feitas pela administração ou pelo orçamentista chefe."}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {TABELAS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiva(t.id)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              activa === t.id ? "bg-marca text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:ring-slate-400"
            }`}
          >
            {t.nome}
          </button>
        ))}
      </div>
      <TabelaBD key={config.id} config={config} podeEditar={eGestao(perfil.nivel)} />
    </div>
  );
}

function formatar(c: Campo, v: unknown, fks: Record<string, Record<string, string>>) {
  if (v === null || v === undefined || v === "") return <span className="text-slate-300">—</span>;
  if (c.tipo === "bool") return v ? "Sim" : <span className="text-slate-400">Não</span>;
  if (c.tipo === "opcoes") return c.opcoes?.find((o) => o.v === v)?.l ?? String(v);
  if (c.tipo === "fk") return fks[c.k]?.[String(v)] ?? "—";
  if (c.tipo === "numero") {
    const n = Number(v);
    const txt = n.toLocaleString("pt-PT", { maximumFractionDigits: 4 });
    return c.sufixo ? `${txt} ${c.sufixo}` : txt;
  }
  return String(v);
}

function TabelaBD({ config, podeEditar }: { config: ConfigTabela; podeEditar: boolean }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fks, setFks] = useState<Record<string, Record<string, string>>>({});
  const [pesquisa, setPesquisa] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [edicao, setEdicao] = useState<Linha | null>(null);
  const [apagar, setApagar] = useState<Linha | null>(null);
  const [historico, setHistorico] = useState<{ quando: string; accao: string; quem: string; motivo: string | null }[] | null>(null);
  const limite = config.limite ?? 1000;

  const carregar = useCallback(async () => {
    setACarregar(true);
    const sb = supabase();
    let q = sb.from(config.id).select("*").limit(limite);
    const termo = pesquisa.trim().replace(/[%,()]/g, " ");
    if (termo) q = q.or(config.pesquisa.map((c) => `${c}.ilike.%${termo}%`).join(","));
    for (const o of config.ordem) q = q.order(o.col, { ascending: o.asc ?? true, nullsFirst: false });
    const { data } = await q;
    setLinhas((data as Linha[]) ?? []);
    setACarregar(false);
  }, [config, pesquisa, limite]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const res: Record<string, Record<string, string>> = {};
      for (const c of config.campos.filter((x) => x.tipo === "fk")) {
        let q = sb.from(c.fk!.tabela).select(`id,${c.fk!.rotulo}`).order(c.fk!.rotulo);
        if (c.fk!.soComValor) q = q.not(c.fk!.soComValor, "is", null);
        const { data } = await q;
        res[c.k] = Object.fromEntries(((data as unknown as Record<string, string>[]) ?? []).map((r) => [r.id, r[c.fk!.rotulo]]));
      }
      setFks(res);
    })();
  }, [config]);

  const colunas = useMemo(() => config.campos.filter((c) => c.lista), [config]);

  function novo() {
    const base: Linha = { id: "" };
    for (const c of config.campos) {
      if (c.tipo === "bool") base[c.k] = true;
      else if (c.k === "unidade") base[c.k] = config.id === "ferragens" ? "un" : "m2";
      else base[c.k] = null;
    }
    setHistorico(null);
    setEdicao(base);
  }

  async function verHistorico(id: string) {
    const { data } = await supabase().rpc("historico_registo", { p_tabela: config.id, p_id: id });
    setHistorico((data as { quando: string; accao: string; quem: string; motivo: string | null }[]) ?? []);
  }

  const faltaObrigatorio = edicao
    ? config.campos.some((c) => c.obrigatorio && (edicao[c.k] === null || edicao[c.k] === undefined || edicao[c.k] === ""))
    : true;

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">{config.descricao}</p>
        <div className="flex gap-2">
          <input
            type="search"
            className="campo w-64"
            placeholder="Pesquisar…"
            aria-label={`Pesquisar em ${config.nome}`}
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
          />
          {podeEditar && <button className="btn-primario whitespace-nowrap" onClick={novo}>+ Novo</button>}
        </div>
      </div>

      <div className="cartao mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {colunas.map((c) => (
                <th key={c.k} className={`px-3 py-2 ${c.tipo === "numero" ? "text-right" : ""}`}>{c.l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aCarregar && linhas.length === 0 && (
              <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-slate-500">A carregar…</td></tr>
            )}
            {!aCarregar && linhas.length === 0 && (
              <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-slate-500">Sem registos.</td></tr>
            )}
            {linhas.map((l) => (
              <tr
                key={l.id}
                onClick={() => { setHistorico(null); setEdicao({ ...l }); }}
                className={`cursor-pointer border-b last:border-0 hover:bg-slate-50 ${l.ativo === false ? "opacity-50" : ""}`}
              >
                {colunas.map((c) => (
                  <td key={c.k} className={`px-3 py-2 ${c.tipo === "numero" ? "text-right tabular-nums" : ""}`}>
                    {formatar(c, l[c.k], fks)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {linhas.length} registo(s){linhas.length >= limite ? ` — a mostrar os primeiros ${limite}; use a pesquisa` : ""}.
      </p>

      {/* Edição (gestão) ou consulta (restantes) */}
      {podeEditar ? (
        <DialogoMotivo
          aberto={!!edicao}
          titulo={edicao?.id ? `Editar · ${config.nome}` : `Novo · ${config.nome}`}
          motivoPadrao={edicao?.id ? "" : "Novo registo"}
          podeConfirmar={!faltaObrigatorio}
          onFechar={() => setEdicao(null)}
          onConfirmar={async (motivo) => {
            if (!edicao) return null;
            const dados: Record<string, unknown> = {};
            for (const c of config.campos) dados[c.k] = edicao[c.k] === "" ? null : edicao[c.k];
            const { error } = await supabase().rpc("guardar_bd", {
              p_tabela: config.id,
              p_id: edicao.id || null,
              p_dados: dados,
              p_motivo: motivo,
            });
            if (error) return error.message;
            await carregar();
            return null;
          }}
        >
          {edicao && (
            <>
              <Formulario config={config} linha={edicao} fks={fks} onChange={setEdicao} />
              {edicao.id && (
                <div className="flex flex-wrap gap-4 text-sm">
                  <button type="button" className="text-marca hover:underline" onClick={() => verHistorico(edicao.id)}>Ver histórico</button>
                  <button type="button" className="text-rose-700 hover:underline" onClick={() => { setApagar(edicao); setEdicao(null); }}>Apagar registo</button>
                </div>
              )}
              {historico && <ListaHistorico registos={historico} />}
            </>
          )}
        </DialogoMotivo>
      ) : (
        edicao && (
          <ConsultaRegisto config={config} linha={edicao} fks={fks} onFechar={() => setEdicao(null)} />
        )
      )}

      <DialogoMotivo
        aberto={!!apagar}
        titulo="Apagar registo"
        descricao="Se o registo já foi usado, prefira desactivá-lo (desmarcar «Activo») em vez de apagar."
        textoConfirmar="Apagar"
        onFechar={() => setApagar(null)}
        onConfirmar={async (motivo) => {
          const { error } = await supabase().rpc("apagar_bd", { p_tabela: config.id, p_id: apagar!.id, p_motivo: motivo });
          if (error) return error.message;
          await carregar();
          return null;
        }}
      />
    </section>
  );
}

function Formulario({
  config,
  linha,
  fks,
  onChange,
}: {
  config: ConfigTabela;
  linha: Linha;
  fks: Record<string, Record<string, string>>;
  onChange: (l: Linha) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...linha, [k]: v });
  return (
    <div className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
      {config.campos.map((c) => {
        const id = `f-${c.k}`;
        const v = linha[c.k];
        const largo = c.tipo === "textarea";
        if (c.tipo === "bool")
          return (
            <label key={c.k} className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={!!v} onChange={(e) => set(c.k, e.target.checked)} /> {c.l}
            </label>
          );
        return (
          <div key={c.k} className={largo ? "sm:col-span-2" : ""}>
            <label className="rotulo" htmlFor={id}>
              {c.l}
              {c.obrigatorio && " *"}
              {c.sufixo && <span className="font-normal text-slate-400"> ({c.sufixo})</span>}
            </label>
            {c.tipo === "textarea" ? (
              <textarea id={id} rows={2} className="campo" value={(v as string) ?? ""} onChange={(e) => set(c.k, e.target.value)} />
            ) : c.tipo === "opcoes" ? (
              <select id={id} className="campo" value={(v as string) ?? ""} onChange={(e) => set(c.k, e.target.value || null)}>
                <option value="">—</option>
                {c.opcoes!.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            ) : c.tipo === "fk" ? (
              <select id={id} className="campo" value={(v as string) ?? ""} onChange={(e) => set(c.k, e.target.value || null)}>
                <option value="">—</option>
                {Object.entries(fks[c.k] ?? {}).map(([fid, r]) => <option key={fid} value={fid}>{r}</option>)}
              </select>
            ) : c.tipo === "numero" ? (
              <input
                id={id}
                type="number"
                step="any"
                className="campo"
                value={v === null || v === undefined ? "" : String(v)}
                onChange={(e) => set(c.k, e.target.value === "" ? null : Number(e.target.value))}
              />
            ) : (
              <input id={id} className="campo" value={(v as string) ?? ""} onChange={(e) => set(c.k, e.target.value)} />
            )}
            {c.ajuda && <p className="mt-1 text-xs text-slate-500">{c.ajuda}</p>}
          </div>
        );
      })}
    </div>
  );
}

function ConsultaRegisto({
  config,
  linha,
  fks,
  onFechar,
}: {
  config: ConfigTabela;
  linha: Linha;
  fks: Record<string, Record<string, string>>;
  onFechar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onFechar}>
      <div className="cartao w-full max-w-lg space-y-3 p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <h2 className="text-lg font-semibold">{config.nome}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {config.campos.map((c) => (
            <div key={c.k} className={c.tipo === "textarea" ? "sm:col-span-2" : ""}>
              <dt className="text-xs uppercase text-slate-500">{c.l}</dt>
              <dd>{formatar(c, linha[c.k], fks)}</dd>
            </div>
          ))}
        </dl>
        <div className="text-right">
          <button className="btn-secundario" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function ListaHistorico({ registos }: { registos: { quando: string; accao: string; quem: string; motivo: string | null }[] }) {
  if (registos.length === 0) return <p className="text-sm text-slate-500">Sem histórico.</p>;
  const nome: Record<string, string> = { INSERT: "Criado", UPDATE: "Alterado", DELETE: "Apagado" };
  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto rounded bg-slate-50 p-2 text-xs">
      {registos.map((r, i) => (
        <li key={i}>
          <strong>{nome[r.accao] ?? r.accao}</strong> · {r.quem} · {dataHora(r.quando)}
          {r.motivo && <span className="italic text-slate-600"> — “{r.motivo}”</span>}
        </li>
      ))}
    </ul>
  );
}
