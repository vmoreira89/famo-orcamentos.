"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { carregarCatalogo, listaGrupos } from "@/lib/catalogo";
import { ESTADOS, MATERIAIS, MDFS, nomeDivisao, type Divisao, type Pedido, type Permissoes } from "@/lib/pedido";
import {
  CHECKLIST,
  TIPOS_MOVEL,
  actualizarPrecos,
  calcularTotais,
  codigoProduto,
  codigos,
  arestasOrla,
  custoPeca,
  decompor,
  euro,
  novoMovel,
  proporMoveis,
  uid,
  type Catalogo,
  type DadosOrcamento,
  type EspecMaterial,
  type Movel,
  type Parametros,
  type TipoMovel,
} from "@/lib/orcamento";
import DialogoMotivo from "@/components/DialogoMotivo";

type LinhaOrc = { versao: number; dados: DadosOrcamento; parametros: Parametros; margem_pct: number };

export default function EditorOrcamento() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [divisoes, setDivisoes] = useState<Divisao[]>([]);
  const [perm, setPerm] = useState<Permissoes | null>(null);
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [decors, setDecors] = useState<{ referencia: string; descricao: string }[]>([]);
  const [dados, setDados] = useState<DadosOrcamento>({ moveis: [], extras_gerais: [] });
  const [par, setPar] = useState<Parametros | null>(null);
  const [margem, setMargem] = useState(0);
  const [versao, setVersao] = useState<number | null>(null);
  const [sujo, setSujo] = useState(false);
  const [guardar, setGuardar] = useState(false);
  const [relatorio, setRelatorio] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [p, d, o, pm, c, g, ac] = await Promise.all([
      sb.from("pedidos").select("*").eq("id", id).single(),
      sb.from("pedido_divisoes").select("*").eq("pedido_id", id).order("ordem"),
      sb.from("orcamentos").select("versao,dados,parametros,margem_pct").eq("pedido_id", id).maybeSingle(),
      sb.rpc("minhas_permissoes", { p_id: id }),
      carregarCatalogo(),
      listaGrupos(),
      sb.from("acabamentos").select("referencia,descricao").in("tipo", ["Laminado", "Termolaminado"]).eq("ativo", true).order("referencia").limit(2000),
    ]);
    if (p.error) return setErro("Pedido não encontrado.");
    setPedido(p.data as Pedido);
    setDivisoes((d.data as Divisao[]) ?? []);
    setPerm(pm.data as Permissoes);
    setCat(c);
    setGrupos(g);
    setDecors((ac.data as { referencia: string; descricao: string }[]) ?? []);
    const orc = o.data as LinhaOrc | null;
    if (orc) {
      setDados({ moveis: orc.dados.moveis ?? [], extras_gerais: orc.dados.extras_gerais ?? [] });
      setPar(orc.parametros?.custo_minuto != null ? orc.parametros : c.parametros);
      setMargem(Number(orc.margem_pct));
      setVersao(orc.versao);
    } else {
      setPar(c.parametros);
      setVersao(null);
    }
    setSujo(false);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // aviso ao sair com alterações por guardar
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (sujo) e.preventDefault(); };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [sujo]);

  const moveisComCodigo = useMemo(
    () => (pedido ? codigos(pedido.numero_projecto, divisoes, dados.moveis) : dados.moveis),
    [pedido, divisoes, dados.moveis],
  );
  const totais = useMemo(() => (par ? calcularTotais(dados, divisoes, par, margem) : null), [dados, divisoes, par, margem]);

  if (erro) return <p className="p-10 text-center text-slate-500">{erro}</p>;
  if (!pedido || !perm || !cat || !par || !totais) return <p className="p-10 text-center text-slate-500">A carregar…</p>;

  const pode = perm.pode_editar && !!pedido.numero_projecto;
  const gestao = perm.pode_gerir;

  const alterar = (fn: (d: DadosOrcamento) => DadosOrcamento) => {
    setDados((d) => fn(d));
    setSujo(true);
  };
  const alterarMovel = (mid: string, fn: (m: Movel) => Movel) =>
    alterar((d) => ({ ...d, moveis: d.moveis.map((m) => (m.id === mid ? fn(m) : m)) }));

  function propor(div: Divisao) {
    const novos = proporMoveis(div).map((m) => decompor(m, cat!));
    alterar((d) => ({ ...d, moveis: [...d.moveis, ...novos] }));
  }
  function acrescentar(div: Divisao, tipo: TipoMovel) {
    const n = dados.moveis.filter((m) => m.divisao_id === div.id && m.tipo === tipo).length + 1;
    const m = decompor(novoMovel(div, tipo, n), cat!);
    alterar((d) => ({ ...d, moveis: [...d.moveis, m] }));
    setAberto(m.id);
  }
  function actualizarTudo() {
    alterar((d) => ({ ...d, moveis: d.moveis.map((m) => actualizarPrecos(m, cat!)) }));
    setPar(cat!.parametros);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link href={`/interno/pedidos/${id}`} className="text-sm text-slate-500 hover:underline">← {pedido.referencia} · {pedido.nome_projecto}</Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Orçamento</h1>
          <p className="text-sm text-slate-600">
            Nº projecto <span className="font-mono font-semibold">{pedido.numero_projecto ?? "por atribuir"}</span> ·{" "}
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADOS[pedido.estado].cor}`}>{ESTADOS[pedido.estado].nome}</span>
            {versao && <span className="ml-2 text-slate-400">versão {versao}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pode && (
            <>
              <button className="btn-secundario" onClick={actualizarTudo} title="Volta a ler preços e parâmetros da base de dados">
                Actualizar preços
              </button>
              <button className="btn-primario" disabled={!sujo} onClick={() => setGuardar(true)}>
                {sujo ? "Guardar orçamento" : "Guardado"}
              </button>
            </>
          )}
          {gestao && versao && (
            <button className="btn-secundario" disabled={sujo} onClick={() => setRelatorio(true)} title={sujo ? "Guarde primeiro" : ""}>
              Relatório
            </button>
          )}
        </div>
      </div>

      {!pedido.numero_projecto && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Para preencher o orçamento, inicie primeiro o pedido e atribua o nº de projecto.
        </p>
      )}
      {!perm.pode_editar && (
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          Só consulta{pedido.estado === "terminado" ? ": orçamento terminado. Os valores ficam congelados tal como foram guardados." : "."}
        </p>
      )}

      {/* Resumo */}
      <section className="cartao mt-4 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Resumo titulo="Custo total" valor={euro(totais.custo)} />
        <div>
          <label className="text-xs uppercase text-slate-500" htmlFor="margem">Margem</label>
          <div className="mt-1 flex items-center gap-1">
            <input id="margem" type="number" step="0.5" className="campo w-24" disabled={!pode} value={margem} onChange={(e) => { setMargem(Number(e.target.value)); setSujo(true); }} />
            <span className="text-sm">%</span>
          </div>
        </div>
        <Resumo titulo="Preço final (s/ IVA)" valor={euro(totais.preco)} destaque />
        <Resumo titulo="Linhas sem preço" valor={String(totais.pendentes)} aviso={totais.pendentes > 0} />
        <div className="text-xs text-slate-500">
          <p>Custo/minuto: {euro(par.custo_minuto)}</p>
          <p>Desperdício matéria: {par.desperdicio_pct}%</p>
          <p>Orla (não laminado): {euro(par.orla_preco_ml)}/ml</p>
          <p className="mt-1 italic">Valores guardados neste orçamento.</p>
        </div>
      </section>
      {totais.pendentes > 0 && (
        <p className="mt-2 text-sm text-amber-700">
          Há linhas sem preço (assinaladas a amarelo). Pode guardar como pendente, mas não é possível terminar o orçamento enquanto houver preços em falta.
        </p>
      )}

      {/* Divisões */}
      {divisoes.map((div) => {
        const moveis = moveisComCodigo.filter((m) => m.divisao_id === div.id);
        const td = totais.porDivisao[div.id];
        return (
          <section key={div.id} className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-2">
              <div>
                <h2 className="text-lg font-semibold">
                  {div.designacao} <span className="font-normal text-slate-500">· {nomeDivisao(div.tipo)} · {div.quantidade} un.</span>
                </h2>
                <p className="text-sm text-slate-600">
                  Produto <span className="font-mono">{codigoProduto(pedido.numero_projecto, div) ?? "—"}</span> · custo por unidade {euro(td?.custo)} · preço por unidade {euro(td?.preco)}
                  {div.quantidade > 1 && <> · total {euro((td?.preco ?? 0) * div.quantidade)}</>}
                </p>
                {div.descritivo?.n_componentes && <p className="text-xs text-slate-500">Pedido: {div.descritivo.n_componentes}{div.descritivo.dimensoes ? ` · ${div.descritivo.dimensoes}` : ""}</p>}
              </div>
              {pode && (
                <div className="flex flex-wrap gap-2">
                  {moveis.length === 0 && <button className="btn-primario" onClick={() => propor(div)}>Propor móveis a partir do pedido</button>}
                  <select
                    className="campo w-auto"
                    aria-label="Acrescentar móvel"
                    value=""
                    onChange={(e) => e.target.value && acrescentar(div, e.target.value as TipoMovel)}
                  >
                    <option value="">+ Acrescentar móvel…</option>
                    {(Object.keys(TIPOS_MOVEL) as TipoMovel[]).map((t) => <option key={t} value={t}>{TIPOS_MOVEL[t].nome}</option>)}
                  </select>
                </div>
              )}
            </div>
            {moveis.length === 0 && <p className="mt-3 text-sm text-slate-400">Ainda sem móveis.</p>}
            <div className="mt-3 space-y-3">
              {moveis.map((m) => (
                <CartaoMovel
                  key={m.id}
                  m={m}
                  custo={totais.porMovel[m.id]}
                  aberto={aberto === m.id}
                  onAbrir={() => setAberto(aberto === m.id ? null : m.id)}
                  pode={pode}
                  grupos={grupos}
                  onAlterar={(fn) => alterarMovel(m.id, fn)}
                  onRegenerar={() => alterarMovel(m.id, (x) => decompor(x, cat))}
                  onRemover={() => alterar((d) => ({ ...d, moveis: d.moveis.filter((x) => x.id !== m.id) }))}
                  onDuplicar={() => alterar((d) => {
                    const i = d.moveis.findIndex((x) => x.id === m.id);
                    const copia: Movel = JSON.parse(JSON.stringify(d.moveis[i]));
                    copia.id = uid();
                    copia.designacao += " (cópia)";
                    copia.ref = copia.ref + "B";
                    const arr = [...d.moveis];
                    arr.splice(i + 1, 0, copia);
                    return { ...d, moveis: arr };
                  })}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Extras gerais */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Operações e custos extra do projecto</h2>
        <p className="text-sm text-slate-600">Transporte, montagem em obra, embalagem especial… (não ligados a um móvel).</p>
        <ListaExtras
          extras={dados.extras_gerais}
          pode={pode}
          onChange={(ex) => alterar((d) => ({ ...d, extras_gerais: ex }))}
        />
      </section>

      <datalist id="decors">
        {decors.map((d) => <option key={d.referencia} value={d.referencia}>{d.descricao}</option>)}
      </datalist>

      <DialogoMotivo
        aberto={guardar}
        titulo="Guardar orçamento"
        descricao={totais.pendentes > 0 ? `Atenção: ficam ${totais.pendentes} linha(s) sem preço.` : undefined}
        motivoPadrao={versao ? "" : "Primeira versão do orçamento"}
        onFechar={() => setGuardar(false)}
        onConfirmar={async (motivo) => {
          const final = { moveis: moveisComCodigo, extras_gerais: dados.extras_gerais };
          const { data, error } = await supabase().rpc("guardar_orcamento", {
            p_pedido: id,
            p_versao: versao,
            p_dados: final,
            p_parametros: par,
            p_margem: margem,
            p_custo: totais.custo,
            p_preco: totais.preco,
            p_pendentes: totais.pendentes,
            p_motivo: motivo,
          });
          if (error) return error.message;
          setVersao(data as number);
          setDados(final);
          setSujo(false);
          return null;
        }}
      />

      <DialogoRelatorio aberto={relatorio} onFechar={() => setRelatorio(false)} onEscolher={(tipo, formato) => router.push(`/interno/pedidos/${id}/relatorio?tipo=${tipo}&formato=${formato}`)} />
    </div>
  );
}

function Resumo({ titulo, valor, destaque, aviso }: { titulo: string; valor: string; destaque?: boolean; aviso?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">{titulo}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${destaque ? "text-marca" : ""} ${aviso ? "text-amber-600" : ""}`}>{valor}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ móvel */

const SEPARADORES = ["Dados", "Peças", "Ferragens", "Operações", "Extras"] as const;

function CartaoMovel({
  m,
  custo,
  aberto,
  onAbrir,
  pode,
  grupos,
  onAlterar,
  onRegenerar,
  onRemover,
  onDuplicar,
}: {
  m: Movel;
  custo: ReturnType<typeof calcularTotais>["porMovel"][string];
  aberto: boolean;
  onAbrir: () => void;
  pode: boolean;
  grupos: string[];
  onAlterar: (fn: (m: Movel) => Movel) => void;
  onRegenerar: () => void;
  onRemover: () => void;
  onDuplicar: () => void;
}) {
  const [sep, setSep] = useState<(typeof SEPARADORES)[number]>("Dados");
  const set = <K extends keyof Movel>(k: K, v: Movel[K]) => onAlterar((x) => ({ ...x, [k]: v }));

  return (
    <div className={`cartao ${custo?.pendentes ? "border-amber-300" : ""}`}>
      <button className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left" onClick={onAbrir} aria-expanded={aberto}>
        <span>
          <span className="font-mono text-xs text-slate-500">{m.codigo ?? m.ref}</span>
          <span className="ml-2 font-semibold">{m.qtd > 1 ? `${m.qtd}× ` : ""}{m.designacao}</span>
          <span className="ml-2 text-sm text-slate-500">{m.L}×{m.P}×{m.A} mm · {m.portas} porta(s) · {m.gavetas} gaveta(s)</span>
        </span>
        <span className="flex items-center gap-3 text-sm">
          {custo?.pendentes > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{custo.pendentes} sem preço</span>}
          <span className="font-semibold tabular-nums">{euro(custo?.total)}</span>
          <span className="text-slate-400">{aberto ? "▲" : "▼"}</span>
        </span>
      </button>
      {aberto && (
        <div className="border-t border-slate-200 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {SEPARADORES.map((s) => (
                <button key={s} onClick={() => setSep(s)} className={`rounded px-3 py-1 text-sm ${sep === s ? "bg-marca text-white" : "bg-slate-100 text-slate-700"}`}>{s}</button>
              ))}
            </div>
            {pode && (
              <div className="flex gap-3 text-sm">
                <button className="text-marca hover:underline" onClick={() => { if (confirm("Voltar a gerar peças, ferragens e operações a partir dos dados do móvel? As alterações manuais nessas listas perdem-se.")) onRegenerar(); }}>Regenerar listas</button>
                <button className="text-marca hover:underline" onClick={onDuplicar}>Duplicar</button>
                <button className="text-rose-700 hover:underline" onClick={() => { if (confirm("Remover este móvel do orçamento?")) onRemover(); }}>Remover</button>
              </div>
            )}
          </div>

          {sep === "Dados" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
                <Campo l="Ref." v={m.ref} on={(v) => set("ref", v.toUpperCase().replace(/\s/g, ""))} pode={pode} />
                <div className="sm:col-span-2"><Campo l="Designação" v={m.designacao} on={(v) => set("designacao", v)} pode={pode} /></div>
                <Num l="Qtd." v={m.qtd} on={(v) => set("qtd", Math.max(1, v))} pode={pode} />
                <Num l="Largura" v={m.L} on={(v) => set("L", v)} pode={pode} />
                <Num l="Altura" v={m.A} on={(v) => set("A", v)} pode={pode} />
                <Num l="Profund." v={m.P} on={(v) => set("P", v)} pode={pode} />
                <Num l="Costa (mm)" v={m.costa_e} on={(v) => set("costa_e", v)} pode={pode} />
                <Num l="Portas" v={m.portas} on={(v) => set("portas", Math.max(0, v))} pode={pode} />
                <Num l="Gavetas" v={m.gavetas} on={(v) => set("gavetas", Math.max(0, v))} pode={pode} />
                <Num l="Prateleiras" v={m.prateleiras} on={(v) => set("prateleiras", Math.max(0, v))} pode={pode} />
                <Sel l="Tipo de porta" v={m.tipo_porta} op={["Batente", "Correr", "Basculante"]} on={(v) => set("tipo_porta", v)} pode={pode} />
                <Sel l="Puxador" v={m.puxador} op={["Puxador exterior", "Gola / perfil", "Push-to-open", "Puxador embutido / fresado", "A definir"]} on={(v) => set("puxador", v)} pode={pode} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <EditorEspec titulo="Corpo" e={m.corpo} grupos={grupos} pode={pode} on={(e) => set("corpo", e)} />
                <EditorEspec titulo="Frentes (portas, gavetas, rodapé)" e={m.frente} grupos={grupos} pode={pode} on={(e) => set("frente", e)} />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Checklist para o desenho</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {CHECKLIST.map((q) =>
                    q.opcoes ? (
                      <Sel key={q.id} l={q.l} v={m.checklist[q.id] ?? ""} op={q.opcoes} on={(v) => onAlterar((x) => ({ ...x, checklist: { ...x.checklist, [q.id]: v } }))} pode={pode} />
                    ) : (
                      <Campo key={q.id} l={q.l} v={m.checklist[q.id] ?? ""} on={(v) => onAlterar((x) => ({ ...x, checklist: { ...x.checklist, [q.id]: v } }))} pode={pode} />
                    ),
                  )}
                </div>
              </div>
              <Campo l="Notas" v={m.notas} on={(v) => set("notas", v)} pode={pode} />
              {pode && <p className="text-xs text-slate-500">Depois de mudar medidas, portas ou gavetas, use «Regenerar listas» para recalcular peças e ferragens.</p>}
              {custo && (
                <p className="text-xs text-slate-500">
                  Material {euro(custo.material)} · orla {euro(custo.orla)} · desperdício {euro(custo.desperdicio)} · ferragens {euro(custo.ferragens)} · mão de obra {euro(custo.mao_obra)} · extras {euro(custo.extras)} · {custo.area_m2} m² · {custo.orla_ml} ml de orla
                </p>
              )}
            </div>
          )}

          {sep === "Peças" && <TabelaPecas m={m} pode={pode} onAlterar={onAlterar} />}
          {sep === "Ferragens" && <TabelaFerragens m={m} pode={pode} onAlterar={onAlterar} />}
          {sep === "Operações" && <TabelaOperacoes m={m} pode={pode} onAlterar={onAlterar} />}
          {sep === "Extras" && (
            <>
              <p className="mb-2 text-sm text-slate-600">Operações extra neste móvel que a app não calcula (ex.: fresagem especial, recorte, acabamento manual).</p>
              <ListaExtras extras={m.extras} pode={pode} onChange={(ex) => onAlterar((x) => ({ ...x, extras: ex }))} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EditorEspec({ titulo, e, grupos, pode, on }: { titulo: string; e: EspecMaterial; grupos: string[]; pode: boolean; on: (e: EspecMaterial) => void }) {
  const extraRotulo = e.material === "folheado" ? "Folha de madeira (€/m² por face)" : e.material === "lacado" ? "Lacagem (€/m² por face)" : e.material === "madeira" ? "Madeira maciça (€/m²)" : "";
  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold">{titulo}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Sel l="Material" v={e.material} op={MATERIAIS.map((m) => m.id)} rot={Object.fromEntries(MATERIAIS.map((m) => [m.id, m.nome]))} on={(v) => on({ ...e, material: v as EspecMaterial["material"] })} pode={pode} semVazio />
        {(e.material === "folheado" || e.material === "lacado") && (
          <Sel l="MDF" v={e.mdf} op={MDFS.map((m) => m.id)} rot={Object.fromEntries(MDFS.map((m) => [m.id, m.nome]))} on={(v) => on({ ...e, mdf: v as EspecMaterial["mdf"] })} pode={pode} />
        )}
        <div>
          <label className="rotulo">{e.material === "laminado" ? "Decor (referência)" : e.material === "lacado" ? "Cor (RAL / ref.)" : "Folha / madeira"}</label>
          <input className="campo" list={e.material === "laminado" ? "decors" : undefined} disabled={!pode} value={e.acabamento} onChange={(x) => on({ ...e, acabamento: x.target.value })} />
        </div>
        {e.material === "laminado" && (
          <Sel l="Grupo (se o decor não tiver)" v={e.grupo} op={grupos} on={(v) => on({ ...e, grupo: v })} pode={pode} />
        )}
        {extraRotulo && (
          <div>
            <label className="rotulo">{extraRotulo}</label>
            <input type="number" step="any" className="campo" disabled={!pode} value={e.extra_m2 ?? ""} onChange={(x) => on({ ...e, extra_m2: x.target.value === "" ? null : Number(x.target.value) })} />
          </div>
        )}
      </div>
      {pode && <p className="mt-2 text-xs text-slate-500">Depois de mudar o material, use «Actualizar preços» ou «Regenerar listas».</p>}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ tabelas de linhas */

function celula(pode: boolean, v: string | number | null, on: (v: string) => void, tipo: "text" | "number" = "text", largura = "w-20", pendente = false) {
  if (!pode) return <span className={pendente ? "rounded bg-amber-100 px-1" : ""}>{v ?? "—"}</span>;
  return (
    <input
      type={tipo}
      step="any"
      className={`rounded border px-1 py-0.5 text-sm ${largura} ${pendente ? "border-amber-400 bg-amber-50" : "border-slate-300"}`}
      value={v ?? ""}
      onChange={(e) => on(e.target.value)}
    />
  );
}
const numOuNull = (s: string) => (s === "" ? null : Number(s));

function TabelaPecas({ m, pode, onAlterar }: { m: Movel; pode: boolean; onAlterar: (fn: (m: Movel) => Movel) => void }) {
  const setP = (pid: string, k: string, v: unknown) => onAlterar((x) => ({ ...x, pecas: x.pecas.map((p) => (p.id === pid ? { ...p, [k]: v } : p)) }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1 pr-2">Código</th><th>Designação</th><th>Qtd</th><th>Comp.</th><th>Larg.</th><th>Esp.</th><th>Sup.</th>
            <th title="Clique nas arestas da peça que levam orla">Orlas</th><th>€/m²</th><th>Folha/laca €/m²</th><th>Orla €/ml</th><th className="text-right">Custo</th><th></th>
          </tr>
        </thead>
        <tbody>
          {m.pecas.map((p) => {
            const c = custoPeca(p);
            return (
              <tr key={p.id} className={`border-b last:border-0 ${c.pendente ? "bg-amber-50" : ""}`}>
                <td className="py-1 pr-2 font-mono text-xs text-slate-500">{p.codigo}{p.subconjunto && <span className="block text-[10px] text-slate-400">{p.subconjunto}</span>}</td>
                <td>{celula(pode, p.designacao, (v) => setP(p.id, "designacao", v), "text", "w-40")}{p.nota && <span className="block text-[11px] text-slate-500">{p.nota}</span>}</td>
                <td>{celula(pode, p.qtd, (v) => setP(p.id, "qtd", Number(v) || 1), "number", "w-14")}</td>
                <td>{celula(pode, p.c, (v) => setP(p.id, "c", Number(v)), "number", "w-20")}</td>
                <td>{celula(pode, p.l, (v) => setP(p.id, "l", Number(v)), "number", "w-20")}</td>
                <td>{celula(pode, p.e, (v) => setP(p.id, "e", Number(v)), "number", "w-14")}</td>
                <td className="text-xs">{p.sup}</td>
                <td>
                  <SeletorOrlas
                    p={p}
                    pode={pode}
                    onChange={(a) => onAlterar((x) => ({ ...x, pecas: x.pecas.map((q) => (q.id === p.id ? { ...q, orlas: a, oc: Number(a[0]) + Number(a[1]), ol: Number(a[2]) + Number(a[3]) } : q)) }))}
                  />
                </td>
                <td>{celula(pode, p.preco_m2, (v) => setP(p.id, "preco_m2", numOuNull(v)), "number", "w-20", p.preco_m2 == null)}</td>
                <td>{p.faces_extra > 0 ? celula(pode, p.preco_extra_m2, (v) => setP(p.id, "preco_extra_m2", numOuNull(v)), "number", "w-20", p.preco_extra_m2 == null) : <span className="text-slate-300">—</span>}</td>
                <td>{celula(pode, p.preco_orla_ml, (v) => setP(p.id, "preco_orla_ml", numOuNull(v)), "number", "w-16")}</td>
                <td className="text-right tabular-nums">{euro(c.material + c.orla)}</td>
                <td>{pode && <button className="text-xs text-rose-700" aria-label="Remover peça" onClick={() => onAlterar((x) => ({ ...x, pecas: x.pecas.filter((q) => q.id !== p.id) }))}>✕</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pode && (
        <button
          className="mt-2 text-sm font-medium text-marca hover:underline"
          onClick={() => onAlterar((x) => ({ ...x, pecas: [...x.pecas, { id: uid(), designacao: "Nova peça", qtd: 1, c: 500, l: 300, e: 19, sup: "manual", oc: 2, ol: 2, subconjunto: "", preco_m2: null, preco_extra_m2: null, faces_extra: 0, preco_orla_ml: null, nota: "" }] }))}
        >
          + Peça
        </button>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Orlas: por norma todas as peças são orladas em todo o perímetro. O rectângulo representa a peça (comprimento na horizontal); clique numa aresta para a excluir ou voltar a incluir (azul = com orla).
        Ao custo de material e orla soma-se o desperdício definido no orçamento.
      </p>
    </div>
  );
}

function SeletorOrlas({ p, pode, onChange }: { p: Movel["pecas"][number]; pode: boolean; onChange: (a: [boolean, boolean, boolean, boolean]) => void }) {
  const a = arestasOrla(p);
  const ml = (p.qtd * ((Number(a[0]) + Number(a[1])) * p.c + (Number(a[2]) + Number(a[3])) * p.l)) / 1000;
  const nomes = ["comprimento (frente)", "comprimento (trás)", "largura (esquerda)", "largura (direita)"];
  const alternar = (i: number) => {
    if (!pode) return;
    const n = [...a] as [boolean, boolean, boolean, boolean];
    n[i] = !n[i];
    onChange(n);
  };
  const aresta = (i: number, cls: string) => (
    <button
      type="button"
      disabled={!pode}
      title={`${a[i] ? "Com" : "Sem"} orla no ${nomes[i]}${pode ? " — clique para alterar" : ""}`}
      aria-label={`Orla no ${nomes[i]}`}
      aria-pressed={a[i]}
      onClick={() => alternar(i)}
      className={`absolute ${cls} ${a[i] ? "bg-marca" : "bg-slate-200 hover:bg-slate-400"} ${pode ? "cursor-pointer" : "cursor-default"}`}
    />
  );
  return (
    <span className="flex items-center gap-2">
      <span className="relative inline-block h-6 w-10 rounded-sm bg-slate-50 ring-1 ring-slate-300">
        {aresta(0, "bottom-0 left-1 right-1 h-1.5")}
        {aresta(1, "left-1 right-1 top-0 h-1.5")}
        {aresta(2, "bottom-1 left-0 top-1 w-1.5")}
        {aresta(3, "bottom-1 right-0 top-1 w-1.5")}
      </span>
      <span className="text-xs tabular-nums text-slate-500">{ml > 0 ? `${ml.toFixed(2)} ml` : "sem orla"}</span>
    </span>
  );
}

function TabelaFerragens({ m, pode, onAlterar }: { m: Movel; pode: boolean; onAlterar: (fn: (m: Movel) => Movel) => void }) {
  const setF = (fid: string, k: string, v: unknown) => onAlterar((x) => ({ ...x, ferragens: x.ferragens.map((f) => (f.id === fid ? { ...f, [k]: v } : f)) }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-slate-500">
          <tr><th className="py-1">Ref. FAMO</th><th>Descrição</th><th>Qtd</th><th>Preço un.</th><th className="text-right">Total</th><th></th></tr>
        </thead>
        <tbody>
          {m.ferragens.map((f) => (
            <tr key={f.id} className={`border-b last:border-0 ${f.preco == null ? "bg-amber-50" : ""}`}>
              <td className="py-1">{celula(pode, f.ref_famo, (v) => setF(f.id, "ref_famo", v || null), "text", "w-28")}</td>
              <td>{celula(pode, f.descricao, (v) => setF(f.id, "descricao", v), "text", "w-72")}</td>
              <td>{celula(pode, f.qtd, (v) => setF(f.id, "qtd", Number(v)), "number", "w-16")}</td>
              <td>{celula(pode, f.preco, (v) => setF(f.id, "preco", numOuNull(v)), "number", "w-20", f.preco == null)}</td>
              <td className="text-right tabular-nums">{f.preco == null ? "—" : euro(f.qtd * f.preco)}</td>
              <td>{pode && <button className="text-xs text-rose-700" aria-label="Remover ferragem" onClick={() => onAlterar((x) => ({ ...x, ferragens: x.ferragens.filter((q) => q.id !== f.id) }))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pode && (
        <button className="mt-2 text-sm font-medium text-marca hover:underline" onClick={() => onAlterar((x) => ({ ...x, ferragens: [...x.ferragens, { id: uid(), ref_famo: null, descricao: "Nova ferragem", qtd: 1, preco: null }] }))}>
          + Ferragem
        </button>
      )}
      <p className="mt-1 text-xs text-slate-500">Linhas a amarelo não têm preço na base de dados: preencha aqui ou actualize a base de dados.</p>
    </div>
  );
}

function TabelaOperacoes({ m, pode, onAlterar }: { m: Movel; pode: boolean; onAlterar: (fn: (m: Movel) => Movel) => void }) {
  const setO = (oid: string, k: string, v: unknown) => onAlterar((x) => ({ ...x, operacoes: x.operacoes.map((o) => (o.id === oid ? { ...o, [k]: v } : o)) }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-slate-500">
          <tr><th className="py-1">Posto</th><th>Descrição</th><th>Minutos</th><th>€/min</th><th className="text-right">Total</th><th></th></tr>
        </thead>
        <tbody>
          {m.operacoes.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="py-1">{celula(pode, o.posto, (v) => setO(o.id, "posto", v), "text", "w-28")}</td>
              <td>{celula(pode, o.descricao, (v) => setO(o.id, "descricao", v), "text", "w-56")}</td>
              <td>{celula(pode, o.minutos, (v) => setO(o.id, "minutos", Number(v)), "number", "w-20")}</td>
              <td>{celula(pode, o.custo_minuto, (v) => setO(o.id, "custo_minuto", numOuNull(v)), "number", "w-16")}</td>
              <td className="text-right tabular-nums">{euro(o.minutos * (o.custo_minuto ?? 0))}</td>
              <td>{pode && <button className="text-xs text-rose-700" aria-label="Remover operação" onClick={() => onAlterar((x) => ({ ...x, operacoes: x.operacoes.filter((q) => q.id !== o.id) }))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pode && (
        <button className="mt-2 text-sm font-medium text-marca hover:underline" onClick={() => onAlterar((x) => ({ ...x, operacoes: [...x.operacoes, { id: uid(), posto: "TRABALHADOR", descricao: "Mão de obra", minutos: 10, custo_minuto: null }] }))}>
          + Operação
        </button>
      )}
      <p className="mt-1 text-xs text-slate-500">Tempos propostos automaticamente; ajuste conforme a experiência. €/min vazio usa o custo por minuto do orçamento.</p>
    </div>
  );
}

function ListaExtras({ extras, pode, onChange }: { extras: { id: string; descricao: string; valor: number | null }[]; pode: boolean; onChange: (e: { id: string; descricao: string; valor: number | null }[]) => void }) {
  return (
    <div className="mt-2">
      {extras.length === 0 && <p className="text-sm text-slate-400">Sem extras.</p>}
      <ul className="space-y-1">
        {extras.map((x) => (
          <li key={x.id} className="flex items-center gap-2 text-sm">
            {celula(pode, x.descricao, (v) => onChange(extras.map((y) => (y.id === x.id ? { ...y, descricao: v } : y))), "text", "w-80")}
            {celula(pode, x.valor, (v) => onChange(extras.map((y) => (y.id === x.id ? { ...y, valor: numOuNull(v) } : y))), "number", "w-24", x.valor == null)}
            <span className="text-slate-500">€</span>
            {pode && <button className="text-xs text-rose-700" aria-label="Remover extra" onClick={() => onChange(extras.filter((y) => y.id !== x.id))}>✕</button>}
          </li>
        ))}
      </ul>
      {pode && <button className="mt-2 text-sm font-medium text-marca hover:underline" onClick={() => onChange([...extras, { id: uid(), descricao: "Operação extra", valor: null }])}>+ Extra</button>}
    </div>
  );
}

/* ------------------------------------------------------------------ campos */

function Campo({ l, v, on, pode }: { l: string; v: string; on: (v: string) => void; pode: boolean }) {
  return (
    <div>
      <label className="rotulo">{l}</label>
      <input className="campo" disabled={!pode} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
function Num({ l, v, on, pode }: { l: string; v: number; on: (v: number) => void; pode: boolean }) {
  return (
    <div>
      <label className="rotulo">{l}</label>
      <input type="number" className="campo" disabled={!pode} value={v} onChange={(e) => on(Number(e.target.value))} />
    </div>
  );
}
function Sel({ l, v, op, on, pode, rot, semVazio }: { l: string; v: string; op: string[]; on: (v: string) => void; pode: boolean; rot?: Record<string, string>; semVazio?: boolean }) {
  return (
    <div>
      <label className="rotulo">{l}</label>
      <select className="campo" disabled={!pode} value={v} onChange={(e) => on(e.target.value)}>
        {!semVazio && <option value="">—</option>}
        {op.map((o) => <option key={o} value={o}>{rot?.[o] ?? o}</option>)}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ relatório */

function DialogoRelatorio({ aberto, onFechar, onEscolher }: { aberto: boolean; onFechar: () => void; onEscolher: (tipo: string, formato: string) => void }) {
  const [tipo, setTipo] = useState("simples");
  const [formato, setFormato] = useState("pdf");
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onFechar}>
      <div className="cartao w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <h2 className="text-lg font-semibold">Gerar relatório</h2>
        <fieldset>
          <legend className="rotulo">Tipo</legend>
          <label className="flex items-start gap-2 text-sm"><input type="radio" checked={tipo === "simples"} onChange={() => setTipo("simples")} /> <span><strong>Simples</strong>: preço por móvel e preço final (para o cliente)</span></label>
          <label className="mt-1 flex items-start gap-2 text-sm"><input type="radio" checked={tipo === "detalhado"} onChange={() => setTipo("detalhado")} /> <span><strong>Detalhado</strong>: peças, ferragens, operações, custos e margem</span></label>
        </fieldset>
        <fieldset>
          <legend className="rotulo">Formato</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={formato === "pdf"} onChange={() => setFormato("pdf")} /> PDF</label>
            <label className="flex items-center gap-2"><input type="radio" checked={formato === "excel"} onChange={() => setFormato("excel")} /> Excel</label>
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={onFechar}>Cancelar</button>
          <button className="btn-primario" onClick={() => onEscolher(tipo, formato)}>Gerar</button>
        </div>
      </div>
    </div>
  );
}
