"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { carregarCatalogo } from "@/lib/catalogo";
import { ESTADOS, MATERIAIS, MDFS, nomeDivisao, type Divisao, type Pedido, type Permissoes } from "@/lib/pedido";
import {
  CHECKLIST,
  TIPOS_MOVEL,
  actualizarPrecos,
  aplicarEscalao,
  aplicarFrentes,
  disposicaoPortas,
  ESCALOES,
  FRENTES,
  RODAPES,
  type Escalao,
  type TipoRodape,
  calcularTotais,
  codigoProduto,
  codigos,
  arestasOrla,
  aplicarOrlas,
  custoOperacao,
  custoPeca,
  nPecasMovel,
  decompor,
  euro,
  novoMovel,
  proporMoveis,
  movelTampo,
  precosTampo,
  tampoPorDefeito,
  trocosTampo,
  uid,
  type Catalogo,
  type DadosOrcamento,
  type EspecMaterial,
  type FaceDentro,
  type Movel,
  type Parametros,
  type Tampo,
  type TipoMovel,
} from "@/lib/orcamento";
import DialogoMotivo from "@/components/DialogoMotivo";
import CampoNumero from "@/components/CampoNumero";
import { disposicao, paineisTampo } from "@/lib/desenho/vistas";
import DialogoDesenhos from "@/components/interno/DialogoDesenhos";
import DialogoLeitura from "@/components/interno/DialogoLeitura";
import SeletorDecor, { type Decor } from "@/components/interno/SeletorDecor";
import type { PropostaMovel } from "@/lib/leitura";
import { eOrcamentista, usePerfil } from "@/components/interno/ContextoInterno";

type LinhaOrc = { versao: number; dados: DadosOrcamento; parametros: Parametros; margem_pct: number };
type Rascunho = { versao_base: number | null; dados: DadosOrcamento; parametros: Parametros | null; margem_pct: number | null; updated_at: string };
const hora = (s: string) => new Date(s).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
const AUTOGRAVAR_MS = 30000;

export default function EditorOrcamento() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [divisoes, setDivisoes] = useState<Divisao[]>([]);
  const [perm, setPerm] = useState<Permissoes | null>(null);
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [decors, setDecors] = useState<Decor[]>([]);
  const [dados, setDados] = useState<DadosOrcamento>({ moveis: [], extras_gerais: [] });
  const [par, setPar] = useState<Parametros | null>(null);
  const [margem, setMargem] = useState(0);
  const [versao, setVersao] = useState<number | null>(null);
  const [sujo, setSujo] = useState(false);
  const [guardar, setGuardar] = useState(false);
  const [relatorio, setRelatorio] = useState(false);
  const [desenhos, setDesenhos] = useState(false);
  const perfil = usePerfil();
  const [aberto, setAberto] = useState<string | null>(null);
  const [nFicheiros, setNFicheiros] = useState<Record<string, number>>({});
  const [leitura, setLeitura] = useState<Divisao | null>(null);
  const [erro, setErro] = useState("");
  // rascunho: trabalho a meio, gravado sem motivo nem nova versão
  const [rascunho, setRascunho] = useState<Rascunho | null>(null); // rascunho encontrado ao abrir, por decidir
  const [rascunhoEm, setRascunhoEm] = useState<string | null>(null); // última gravação do rascunho
  const [porGravar, setPorGravar] = useState(false); // alterações desde o último rascunho
  const [aGravar, setAGravar] = useState(false);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [p, d, o, pm, c, ac, gl, fi, ra] = await Promise.all([
      sb.from("pedidos").select("*").eq("id", id).single(),
      sb.from("pedido_divisoes").select("*").eq("pedido_id", id).order("ordem"),
      sb.from("orcamentos").select("versao,dados,parametros,margem_pct").eq("pedido_id", id).maybeSingle(),
      sb.rpc("minhas_permissoes", { p_id: id }),
      carregarCatalogo(),
      sb.from("acabamentos").select("referencia,descricao,grupo_id").or("tipo.ilike.lam%,tipo.ilike.termolam%,grupo_id.not.is.null").eq("ativo", true).order("referencia").limit(3000),
      sb.from("grupos_laminado").select("id,codigo"),
      sb.from("pedido_ficheiros").select("divisao_id").eq("pedido_id", id),
      sb.from("orcamento_rascunhos").select("versao_base,dados,parametros,margem_pct,updated_at").eq("pedido_id", id).maybeSingle(),
    ]);
    const r = ra.data as Rascunho | null;
    setRascunho(r);
    setRascunhoEm(r?.updated_at ?? null);
    setPorGravar(false);
    const nf: Record<string, number> = {};
    for (const f of (fi.data as { divisao_id: string | null }[]) ?? []) nf[f.divisao_id ?? "geral"] = (nf[f.divisao_id ?? "geral"] ?? 0) + 1;
    setNFicheiros(nf);
    const codGrupo = Object.fromEntries((((gl.data as { id: string; codigo: string }[]) ?? [])).map((x) => [x.id, x.codigo]));
    if (p.error) return setErro("Pedido não encontrado.");
    setPedido(p.data as Pedido);
    setDivisoes((d.data as Divisao[]) ?? []);
    setPerm(pm.data as Permissoes);
    setCat(c);
    const vistos = new Set<string>();
    setDecors(
      ((ac.data as { referencia: string; descricao: string; grupo_id: string | null }[]) ?? [])
        .filter((x) => x.referencia && !vistos.has(x.referencia) && vistos.add(x.referencia))
        .map((x) => ({ referencia: x.referencia, descricao: x.descricao, grupo: x.grupo_id ? codGrupo[x.grupo_id] ?? "" : "" })),
    );
    const orc = o.data as LinhaOrc | null;
    if (orc) {
      setDados({ moveis: orc.dados.moveis ?? [], extras_gerais: orc.dados.extras_gerais ?? [], tampos: orc.dados.tampos ?? {}, escalao_laminado: orc.dados.escalao_laminado ?? "placa" });
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

  /** Grava o ponto em que está (rascunho); não cria versão nem pede motivo. */
  const gravarRascunho = useCallback(async () => {
    setAGravar(true);
    const { data, error } = await supabase().rpc("guardar_rascunho", { p_pedido: id, p_versao_base: versao, p_dados: dados, p_parametros: par, p_margem: margem });
    setAGravar(false);
    if (error) return alert(`Não foi possível gravar o rascunho: ${error.message}`);
    setRascunhoEm(data as string);
    setPorGravar(false);
  }, [id, versao, dados, par, margem]);

  // gravação automática do rascunho, 30 s depois da última alteração
  useEffect(() => {
    if (!porGravar || rascunho || !perm?.pode_editar) return;
    const t = setTimeout(() => { gravarRascunho(); }, AUTOGRAVAR_MS);
    return () => clearTimeout(t);
  }, [porGravar, rascunho, perm, gravarRascunho]);

  // aviso ao sair com alterações por gravar
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (porGravar) e.preventDefault(); };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [porGravar]);

  const moveisComCodigo = useMemo(
    () => (pedido ? codigos(pedido.numero_projecto, divisoes, dados.moveis) : dados.moveis),
    [pedido, divisoes, dados.moveis],
  );
  const tamposComCodigo = useMemo(() => {
    const out: Record<string, Tampo> = {};
    for (const [k, t] of Object.entries(dados.tampos ?? {})) {
      const d = divisoes.find((x) => x.id === k);
      out[k] = { ...t, codigo: pedido?.numero_projecto && d ? movelTampo(t, d, moveisComCodigo, pedido.numero_projecto).codigo : undefined };
    }
    return out;
  }, [dados.tampos, divisoes, pedido, moveisComCodigo]);
  const totais = useMemo(() => (par ? calcularTotais(dados, divisoes, par, margem) : null), [dados, divisoes, par, margem]);

  if (erro) return <p className="p-10 text-center text-slate-500">{erro}</p>;
  if (!pedido || !perm || !cat || !par || !totais) return <p className="p-10 text-center text-slate-500">A carregar…</p>;

  const pode = perm.pode_editar && !!pedido.numero_projecto;
  const gestao = perm.pode_gerir;
  const escalao: Escalao = dados.escalao_laminado ?? "placa";

  const alterar = (fn: (d: DadosOrcamento) => DadosOrcamento) => {
    setDados((d) => fn(d));
    setSujo(true);
    setPorGravar(true);
  };
  function continuarRascunho(r: Rascunho) {
    setDados({ moveis: r.dados.moveis ?? [], extras_gerais: r.dados.extras_gerais ?? [], tampos: r.dados.tampos ?? {}, escalao_laminado: r.dados.escalao_laminado ?? "placa" });
    if (r.parametros?.custo_minuto != null) setPar(r.parametros);
    if (r.margem_pct != null) setMargem(Number(r.margem_pct));
    setRascunho(null);
    setSujo(true);
    setPorGravar(false);
  }
  async function descartarRascunho() {
    if (!confirm("Descartar o rascunho? O trabalho não guardado como versão perde-se.")) return;
    await supabase().rpc("apagar_rascunho", { p_pedido: id });
    setRascunho(null);
    setRascunhoEm(null);
  }
  const alterarMovel = (mid: string, fn: (m: Movel) => Movel) =>
    alterar((d) => ({ ...d, moveis: d.moveis.map((m) => (m.id === mid ? fn(m) : m)) }));

  function propor(div: Divisao) {
    const novos = proporMoveis(div).map((m) => decompor(m, cat!, escalao));
    alterar((d) => ({ ...d, moveis: [...d.moveis, ...novos] }));
  }
  /** Acrescenta os móveis lidos dos ficheiros de apoio (já revistos pelo orçamentista). */
  function acrescentarLidos(div: Divisao, ps: PropostaMovel[]) {
    const cont: Partial<Record<TipoMovel, number>> = {};
    for (const m of dados.moveis) if (m.divisao_id === div.id) cont[m.tipo] = (cont[m.tipo] ?? 0) + 1;
    const novos = ps.map((p) => {
      cont[p.tipo] = (cont[p.tipo] ?? 0) + 1;
      const m = novoMovel(div, p.tipo, cont[p.tipo]!);
      return decompor({ ...m, designacao: p.designacao || m.designacao, qtd: Math.max(1, p.qtd), L: p.L, P: p.P, A: p.A, portas: p.portas, gavetas: p.gavetas, notas: p.origem.slice(0, 200) }, cat!, escalao);
    });
    alterar((d) => ({ ...d, moveis: [...d.moveis, ...novos] }));
  }
  function acrescentar(div: Divisao, tipo: TipoMovel) {
    const n = dados.moveis.filter((m) => m.divisao_id === div.id && m.tipo === tipo).length + 1;
    const m = decompor(novoMovel(div, tipo, n), cat!, escalao);
    alterar((d) => ({ ...d, moveis: [...d.moveis, m] }));
    setAberto(m.id);
  }
  /** Troca o móvel com o anterior/seguinte da mesma divisão. */
  function mover(mid: string, dir: -1 | 1) {
    alterar((d) => {
      const arr = [...d.moveis];
      const i = arr.findIndex((m) => m.id === mid);
      const div = arr[i].divisao_id;
      let j = i + dir;
      while (j >= 0 && j < arr.length && arr[j].divisao_id !== div) j += dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, moveis: arr };
    });
  }
  /** Aplica o escalão de preço dos laminados (placa / palete / camião) a todo o orçamento. */
  function mudarEscalao(e: Escalao) {
    if (e === escalao) return;
    alterar((d) => ({
      ...d,
      escalao_laminado: e,
      moveis: d.moveis.map((m) => aplicarEscalao(m, cat!, e)),
      tampos: Object.fromEntries(Object.entries(d.tampos ?? {}).map(([k, t]) => [k, t.material === "laminado" ? precosTampo(t, cat!, e) : t])),
    }));
  }
  function actualizarTudo() {
    alterar((d) => ({
      ...d,
      moveis: d.moveis.map((m) => actualizarPrecos(m, cat!, escalao)),
      tampos: Object.fromEntries(Object.entries(d.tampos ?? {}).map(([k, t]) => [k, precosTampo(t, cat!, escalao)])),
    }));
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
              <button className="btn-secundario" disabled={!porGravar || aGravar || !!rascunho} onClick={gravarRascunho} title="Grava o ponto em que está, para continuar mais tarde (não cria versão)">
                {aGravar ? "A gravar…" : porGravar ? "Guardar rascunho" : "Rascunho gravado"}
              </button>
              <button className="btn-primario" disabled={!sujo} onClick={() => setGuardar(true)} title="Grava uma versão oficial do orçamento (pede motivo)">
                {sujo ? "Guardar orçamento" : "Guardado"}
              </button>
            </>
          )}
          {eOrcamentista(perfil.nivel) && versao && pedido.numero_projecto && (
            <button className="btn-secundario" disabled={sujo} onClick={() => setDesenhos(true)} title={sujo ? "Guarde primeiro" : "Gerar PDF e DXF"}>
              Desenhos
            </button>
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

      {pode && rascunho && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm">
          <span>
            <strong>Tem um rascunho gravado em {hora(rascunho.updated_at)}.</strong> Quer continuar a partir daí?
            {rascunho.versao_base !== versao && <span className="block text-amber-800">Atenção: o orçamento foi guardado como versão {versao} depois de o rascunho ter começado (v{rascunho.versao_base ?? "—"}).</span>}
          </span>
          <span className="flex gap-2">
            <button className="btn-primario" onClick={() => continuarRascunho(rascunho)}>Continuar o rascunho</button>
            <button className="btn-secundario" onClick={descartarRascunho}>Descartar</button>
          </span>
        </div>
      )}

      {/* Resumo */}
      <section className="cartao mt-4 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Resumo titulo="Custo total" valor={euro(totais.custo)} />
        <div>
          <label className="text-xs uppercase text-slate-500" htmlFor="margem">Margem</label>
          <div className="mt-1 flex items-center gap-1">
            <CampoNumero id="margem" className="campo w-24" disabled={!pode} valor={margem} onValor={(v) => { setMargem(v ?? 0); setSujo(true); setPorGravar(true); }} />
            <span className="text-sm">%</span>
          </div>
        </div>
        <Resumo titulo="Preço final (s/ IVA)" valor={euro(totais.preco)} destaque />
        <Resumo titulo="Linhas sem preço" valor={String(totais.pendentes)} aviso={totais.pendentes > 0} />
        <div className="text-xs text-slate-500">
          <p>Custo/minuto: {euro(par.custo_minuto)}</p>
          <p>Desperdício matéria: {par.desperdicio_pct}%</p>
          <p>Orla (não laminado): {euro(par.orla_preco_ml)}/ml</p>
          <p>Laminados: {ESCALOES.find((x) => x.id === escalao)?.nome.replace("Preço m² ", "")}</p>
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
                  {(nFicheiros[div.id] ?? 0) + (nFicheiros.geral ?? 0) > 0 && (
                    <button className={moveis.length === 0 ? "btn-primario" : "btn-secundario"} onClick={() => setLeitura(div)}>
                      Ler ficheiros de apoio ({(nFicheiros[div.id] ?? 0) + (nFicheiros.geral ?? 0)})
                    </button>
                  )}
                  {moveis.length === 0 && <button className={(nFicheiros[div.id] ?? 0) + (nFicheiros.geral ?? 0) > 0 ? "btn-secundario" : "btn-primario"} onClick={() => propor(div)}>Propor a partir do descritivo</button>}
                  <select
                    className="campo w-auto"
                    aria-label="Acrescentar móvel"
                    value=""
                    onChange={(e) => e.target.value && acrescentar(div, e.target.value as TipoMovel)}
                  >
                    <option value="">+ Acrescentar móvel…</option>
                    {(Object.keys(TIPOS_MOVEL) as TipoMovel[]).filter((t) => t !== "tampo").map((t) => <option key={t} value={t}>{TIPOS_MOVEL[t].nome}</option>)}
                  </select>
                </div>
              )}
            </div>
            {moveis.length === 0 && <p className="mt-3 text-sm text-slate-400">Ainda sem móveis.</p>}
            {moveis.length > 0 && <MiniAlcado moveis={moveis} tampo={tamposComCodigo[div.id]} activo={aberto} onEscolher={setAberto} />}
            {moveis.some((m) => m.tipo !== "superior" && m.tipo !== "coluna") && (
              <CartaoTampo
                divisao={div}
                moveis={moveis}
                tampo={tamposComCodigo[div.id]}
                custo={totais.porTampo[div.id]}
                cat={cat}
                escalao={escalao}
                decors={decors}
                pode={pode}
                onChange={(t) => alterar((d) => ({ ...d, tampos: { ...(d.tampos ?? {}), [div.id]: t } }))}
              />
            )}
            <div className="mt-3 space-y-3">
              {moveis.map((m) => (
                <CartaoMovel
                  key={m.id}
                  m={m}
                  custo={totais.porMovel[m.id]}
                  aberto={aberto === m.id}
                  onAbrir={() => setAberto(aberto === m.id ? null : m.id)}
                  pode={pode}
                  decors={decors}
                  cozinha={div.tipo === "cozinha"}
                  cat={cat}
                  custoMinuto={par.custo_minuto}
                  onAlterar={(fn) => alterarMovel(m.id, fn)}
                  onRegenerar={() => alterarMovel(m.id, (x) => decompor(x, cat, escalao))}
                  onMover={(dir) => mover(m.id, dir)}
                  posicao={moveis.indexOf(m) + 1}
                  totalPos={moveis.length}
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


      {/* Pergunta final: que preço de laminado aplicar */}
      <section className="cartao mt-8 p-5">
        <h2 className="text-lg font-semibold">Preço dos laminados a aplicar</h2>
        <p className="text-sm text-slate-600">
          Por norma as contas usam o preço m² à placa. Escolha o preço a aplicar a este orçamento: os preços das placas laminadas (peças e tampos) são ajustados.
          Se uma referência não tiver preço à palete ou ao camião, fica o preço à placa.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ESCALOES.map((x) => (
            <button
              key={x.id}
              type="button"
              disabled={!pode}
              aria-pressed={escalao === x.id}
              onClick={() => mudarEscalao(x.id)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${escalao === x.id ? "border-marca bg-marca text-white" : "border-slate-300 bg-white hover:border-slate-500"}`}
            >
              {x.nome}
            </button>
          ))}
        </div>
      </section>

      <DialogoMotivo
        aberto={guardar}
        titulo="Guardar orçamento"
        descricao={totais.pendentes > 0 ? `Atenção: ficam ${totais.pendentes} linha(s) sem preço.` : undefined}
        motivoPadrao={versao ? "" : "Primeira versão do orçamento"}
        onFechar={() => setGuardar(false)}
        onConfirmar={async (motivo) => {
          const final = { moveis: moveisComCodigo, extras_gerais: dados.extras_gerais, tampos: tamposComCodigo, escalao_laminado: escalao };
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
          // a versão oficial passa a ser o ponto de partida: o rascunho deixa de ser preciso
          await supabase().rpc("apagar_rascunho", { p_pedido: id });
          setRascunhoEm(null);
          setPorGravar(false);
          return null;
        }}
      />

      {pedido.numero_projecto && (
        <DialogoDesenhos
          aberto={desenhos}
          onFechar={() => setDesenhos(false)}
          pedidoId={id}
          numero={pedido.numero_projecto}
          referencia={pedido.referencia}
          versao={versao}
          divisoes={divisoes}
          moveis={moveisComCodigo}
          tampos={tamposComCodigo}
          autor={perfil.nome || perfil.email}
        />
      )}

      {leitura && <DialogoLeitura divisao={leitura} aberto onFechar={() => setLeitura(null)} onAcrescentar={(ps) => acrescentarLidos(leitura, ps)} />}

      {pode && sujo && !rascunho && (
        <div className="sticky bottom-0 z-40 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] backdrop-blur">
          <span className="text-sm text-slate-600">
            {porGravar ? "Alterações por gravar." : "Trabalho gravado em rascunho."}
            {rascunhoEm && <> Último rascunho: {hora(rascunhoEm)}.</>} O rascunho grava-se sozinho 30 s depois de cada alteração.
          </span>
          <span className="flex gap-2">
            <button className="btn-secundario" disabled={!porGravar || aGravar} onClick={gravarRascunho}>{aGravar ? "A gravar…" : "Guardar rascunho"}</button>
            <button className="btn-primario" onClick={() => setGuardar(true)}>Guardar orçamento (nova versão)</button>
          </span>
        </div>
      )}

      <DialogoRelatorio aberto={relatorio} onFechar={() => setRelatorio(false)} onEscolher={(tipo, formato) => router.push(`/interno/pedidos/${id}/relatorio?tipo=${tipo}&formato=${formato}`)} />
    </div>
  );
}

/** Alçado em miniatura de uma divisão: mostra a posição dos móveis; clicar abre o móvel. */
function MiniAlcado({ moveis, tampo, activo, onEscolher }: { moveis: Movel[]; tampo?: Tampo; activo: string | null; onEscolher: (id: string) => void }) {
  const disp = disposicao(moveis);
  const tps = paineisTampo(moveis, tampo);
  const pes = (m: Movel) => (TIPOS_MOVEL[m.tipo].pes ? 100 : 0);
  const W = Math.max(...disp.map((d) => d.x + d.m.L), 1);
  const H = Math.max(...disp.map((d) => d.y + d.m.A + pes(d.m)), ...tps.map((t) => t.y + t.h), 1);
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
      <p className="mb-1 text-xs text-slate-500">Posição dos móveis (vista de frente). Use ▲▼ em cada móvel para mudar a ordem; «Espaço antes» deixa um vão (janela, electrodoméstico…).</p>
      <svg viewBox={`-20 -20 ${W + 40} ${H + 40}`} className="h-40 w-full" role="img" aria-label="Alçado da divisão">
        <line x1={-20} y1={H} x2={W + 20} y2={H} stroke="#94a3b8" strokeWidth={6} />
        {disp.map(({ m, x, y }, i) => {
          const top = H - (y + pes(m) + m.A);
          const sel = m.id === activo;
          return (
            <g key={`${m.id}-${i}`} onClick={() => onEscolher(m.id)} className="cursor-pointer">
              <rect x={x + 4} y={top} width={m.L - 8} height={m.A} fill={sel ? "#e8eef6" : "#f8fafc"} stroke={sel ? "#1f3a5f" : "#64748b"} strokeWidth={sel ? 12 : 6} />
              {m.gavetas > 0 && Array.from({ length: m.gavetas - 1 }, (_, g) => (
                <line key={g} x1={x + 4} x2={x + m.L - 4} y1={top + ((g + 1) * m.A) / m.gavetas} y2={top + ((g + 1) * m.A) / m.gavetas} stroke="#94a3b8" strokeWidth={4} />
              ))}
              {m.portas > 1 && <line x1={x + m.L / 2} x2={x + m.L / 2} y1={top} y2={top + m.A} stroke="#94a3b8" strokeWidth={4} />}
              <text x={x + m.L / 2} y={top + m.A / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(110, m.L / 4)} fill="#1f3a5f" fontWeight="bold">{m.ref}</text>
            </g>
          );
        })}
        {tps.map((t, i) => (
          <g key={`tb${i}`}>
            <rect x={t.x} y={H - t.y - t.h} width={t.w} height={t.h} fill="#c8742c" stroke="#7c4a1e" strokeWidth={5} />
            <text x={t.x + t.w / 2} y={H - t.y - t.h - 20} textAnchor="middle" fontSize={70} fill="#7c4a1e" fontWeight="bold">TAMPO</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Pergunta e dados do tampo de bancada da divisão (produto 10* com peças 03.4*). */
function CartaoTampo({
  divisao,
  moveis,
  tampo,
  custo,
  cat,
  escalao,
  decors,
  pode,
  onChange,
}: {
  escalao: Escalao;
  decors: Decor[];
  divisao: Divisao;
  moveis: Movel[];
  tampo: Tampo | undefined;
  custo: ReturnType<typeof calcularTotais>["porTampo"][string] | undefined;
  cat: Catalogo;
  pode: boolean;
  onChange: (t: Tampo) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (!tampo)
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
        <span>
          <strong>Tampo de bancada:</strong> adicionar como elemento do conjunto?
          {divisao.descritivo?.tampo && <span className="text-slate-600"> · Pedido do cliente: «{divisao.descritivo.tampo}»</span>}
        </span>
        {pode && (
          <span className="flex gap-2">
            <button className="btn-primario" onClick={() => { onChange(tampoPorDefeito(divisao, moveis, cat, escalao)); setAberto(true); }}>Sim</button>
            <button className="btn-secundario" onClick={() => onChange({ ...tampoPorDefeito(divisao, moveis), incluir: false })}>Não</button>
          </span>
        )}
      </div>
    );
  // alterações que mudam o preço voltam a ler a base de dados
  const set = <K extends keyof Tampo>(k: K, v: Tampo[K]) => {
    const n = { ...tampo, [k]: v };
    onChange(["material", "acabamento", "espessura"].includes(k as string) ? precosTampo(n, cat, escalao) : n);
  };
  if (!tampo.incluir)
    return (
      <div className="mt-3 flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
        <span>Sem tampo de bancada neste conjunto.</span>
        {pode && <button className="text-marca hover:underline" onClick={() => { onChange(precosTampo({ ...tampo, incluir: true }, cat, escalao)); setAberto(true); }}>Adicionar tampo</button>}
      </div>
    );
  const trocos = trocosTampo(moveis);
  const semPreco = !tampo.terceiros && tampo.preco_m2 == null;
  return (
    <div className={`cartao mt-3 ${semPreco ? "border-amber-300" : ""}`}>
      <button className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        <span>
          <span className="font-mono text-xs text-slate-500">{tampo.codigo ?? "TB01"}</span>
          <span className="ml-2 font-semibold">Tampo de bancada</span>
          <span className="ml-2 text-sm text-slate-500">
            {custo?.comprimento ?? "?"}×{tampo.profundidade}×{tampo.espessura} mm · {tampo.material} {tampo.acabamento} · {custo?.pecas ?? 1} peça(s)
          </span>
        </span>
        <span className="flex items-center gap-3 text-sm">
          {semPreco && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">sem preço</span>}
          <span className="font-semibold tabular-nums">{tampo.terceiros ? "terceiros" : euro(custo?.total)}</span>
          <span className="text-slate-400">{aberto ? "▲" : "▼"}</span>
        </span>
      </button>
      {aberto && (
        <div className="border-t border-slate-200 p-4">
          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Sel l="Material" v={tampo.material} op={["laminado", "compacto", "madeira", "pedra", "outro"]} rot={{ laminado: "Laminado", compacto: "Compacto", madeira: "Madeira", pedra: "Pedra / quartzo", outro: "Outro" }} on={(v) => set("material", v as Tampo["material"])} pode={pode} semVazio />
            <div className="sm:col-span-2">
              <label className="rotulo">Decor / referência</label>
              {tampo.material === "laminado" ? (
                <SeletorDecor decors={decors} valor={tampo.acabamento} pode={pode} onChange={(ref) => onChange(precosTampo({ ...tampo, acabamento: ref, grupo: "" }, cat, escalao))} />
              ) : (
                <input className="campo" disabled={!pode} value={tampo.acabamento} onChange={(e) => set("acabamento", e.target.value)} />
              )}
            </div>
            <Num l="Espessura (mm)" v={tampo.espessura} on={(v) => set("espessura", v)} pode={pode} />
            <Num l="Profundidade" v={tampo.profundidade} on={(v) => set("profundidade", v)} pode={pode} />
            <Num l="Saliência frente" v={tampo.saliencia} on={(v) => set("saliencia", v)} pode={pode} />
            <div>
              <label className="rotulo">Comprimento</label>
              <CampoNumero className="campo" disabled={!pode} placeholder={`auto: ${trocos.reduce((s, t) => s + t.comp, 0)}`} valor={tampo.comprimento} onValor={(v) => set("comprimento", v)} />
            </div>
            <div>
              <label className="rotulo" title="Comprimento máximo de cada peça (placa). Só se aplica se não for tampo único.">Máx. por peça</label>
              <CampoNumero className="campo" disabled={!pode || tampo.unico} valor={tampo.comp_max_troco || null} onValor={(v) => set("comp_max_troco", v ?? 0)} />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!pode} checked={!!tampo.unico} onChange={(e) => set("unico", e.target.checked)} />
            <strong>Tampo único</strong>: uma só peça à medida dos móveis de baixo (sem divisões). Desmarque para dividir em peças até ao «Máx. por peça».
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div>
              <label className="rotulo">Preço da placa (€/m²)</label>
              <CampoNumero className={`campo ${semPreco ? "border-amber-400 bg-amber-50" : ""}`} disabled={!pode || tampo.terceiros} valor={tampo.preco_m2} onValor={(v) => onChange({ ...tampo, preco_m2: v })} />
              <p className="mt-1 text-xs text-slate-500">{tampo.material === "laminado" ? "Lido da referência do decor na espessura indicada; pode ajustar." : "Sem tabela para este material: preencha."}</p>
            </div>
            <div>
              <label className="rotulo">Orla (€/ml)</label>
              <CampoNumero className="campo" disabled={!pode || tampo.terceiros} valor={tampo.preco_orla_ml} onValor={(v) => onChange({ ...tampo, preco_orla_ml: v })} />
              <p className="mt-1 text-xs text-slate-500">Orla em todo o perímetro, como nas outras peças.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo">Notas</label>
              <input className="campo" disabled={!pode} value={tampo.notas} onChange={(e) => onChange({ ...tampo, notas: e.target.value })} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!pode} checked={tampo.terceiros} onChange={(e) => onChange({ ...tampo, terceiros: e.target.checked })} />
              Fornecido / aplicado por terceiros (só desenhado, sem custo)
            </label>
            {custo && !tampo.terceiros && (
              <span className="text-xs text-slate-500">
                Material {euro(custo.material)} · orla {euro(custo.orla)} ({custo.orla_ml} ml) · desperdício {euro(custo.desperdicio)} · operações {euro(custo.mao_obra)} = <strong>{euro(custo.total)}</strong>
              </span>
            )}
            {pode && <button className="text-rose-700 hover:underline" onClick={() => onChange({ ...tampo, incluir: false })}>Retirar tampo</button>}
          </div>
        </div>
      )}
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
  decors,
  cozinha,
  cat,
  custoMinuto,
  onAlterar,
  onRegenerar,
  onRemover,
  onDuplicar,
  onMover,
  posicao,
  totalPos,
}: {
  onMover: (dir: -1 | 1) => void;
  posicao: number;
  totalPos: number;
  m: Movel;
  custo: ReturnType<typeof calcularTotais>["porMovel"][string];
  aberto: boolean;
  onAbrir: () => void;
  pode: boolean;
  decors: Decor[];
  cozinha: boolean;
  cat: Catalogo;
  custoMinuto: number;
  onAlterar: (fn: (m: Movel) => Movel) => void;
  onRegenerar: () => void;
  onRemover: () => void;
  onDuplicar: () => void;
}) {
  const [sep, setSep] = useState<(typeof SEPARADORES)[number]>("Dados");
  const set = <K extends keyof Movel>(k: K, v: Movel[K]) => onAlterar((x) => ({ ...x, [k]: v }));
  /** Mudar material/orla aplica logo a regra das orlas às peças dessa superfície. */
  const mudarEspec = (k: "corpo" | "frente", e: EspecMaterial) =>
    onAlterar((x) => {
      const n = { ...x, [k]: e };
      return x[k].material !== e.material || !!x[k].orlar !== !!e.orlar ? aplicarOrlas(n, cat) : n;
    });

  return (
    <div className={`cartao ${custo?.pendentes ? "border-amber-300" : ""}`}>
      <div className="flex items-stretch">
      {pode && (
        <div className="flex flex-col justify-center border-r border-slate-200 px-1">
          <button className="px-1 text-xs text-slate-500 hover:text-marca disabled:opacity-30" disabled={posicao === 1} onClick={() => onMover(-1)} title="Mover para a esquerda / antes" aria-label="Mover para antes">▲</button>
          <span className="text-center text-[10px] text-slate-400">{posicao}</span>
          <button className="px-1 text-xs text-slate-500 hover:text-marca disabled:opacity-30" disabled={posicao === totalPos} onClick={() => onMover(1)} title="Mover para a direita / depois" aria-label="Mover para depois">▼</button>
        </div>
      )}
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
      </div>
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
              <div className="grid gap-3 lg:grid-cols-3">
                <Pergunta
                  l="Frentes do móvel"
                  v={m.frentes}
                  op={FRENTES}
                  pode={pode}
                  on={(v) => onAlterar((x) => aplicarFrentes(x, v))}
                  ajuda={m.frentes ? undefined : `Por responder (agora: ${m.portas} porta(s), ${m.gavetas} gaveta(s))`}
                />
                <Pergunta
                  l="Tampo / travessas superiores"
                  v={m.topo_sobre_ilhargas ? "cima" : "dentro"}
                  op={[{ id: "dentro", nome: "Por dentro das ilhargas" }, { id: "cima", nome: "Por cima das ilhargas" }]}
                  pode={pode}
                  on={(v) => set("topo_sobre_ilhargas", v === "cima")}
                />
                {cozinha && TIPOS_MOVEL[m.tipo].pes && (
                  <Pergunta l="Rodapé" v={m.rodape_tipo} op={RODAPES} pode={pode} on={(v) => set("rodape_tipo", v as TipoRodape)} ajuda={m.rodape_tipo ? undefined : "Por responder (agora: igual às frentes)"} />
                )}
                {cozinha && TIPOS_MOVEL[m.tipo].pes && m.rodape_tipo === "mdf" && (
                  <Pergunta
                    l="Rodapé MDF: acabamento"
                    v={m.rodape_acabamento}
                    op={[{ id: "lacado", nome: "Lacado" }, { id: "folheado", nome: "Folheado" }]}
                    pode={pode}
                    on={(v) => set("rodape_acabamento", v)}
                    ajuda={m.rodape_acabamento ? (m.rodape_acabamento === "folheado" ? "Folha de madeira na face vista e orla em folha de madeira." : "Lacagem na face vista, sem orla.") : "Por responder (agora: MDF em cru)"}
                  />
                )}
              </div>
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
                <Num l="Espaço antes (mm)" v={m.espaco_antes ?? 0} on={(v) => set("espaco_antes", Math.max(0, v))} pode={pode} />
                <Sel l="Tipo de porta" v={m.tipo_porta} op={["Batente", "Correr", "Basculante"]} on={(v) => set("tipo_porta", v)} pode={pode} />
                <Sel l="Puxador" v={m.puxador} op={["Puxador exterior", "Gola / perfil", "Push-to-open", "Puxador embutido / fresado", "A definir"]} on={(v) => set("puxador", v)} pode={pode} />
              </div>
              {m.portas > 1 && m.tipo_porta !== "Correr" && (
                <div className="space-y-3 rounded-md border border-slate-200 p-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <Pergunta
                      l={`Disposição das ${m.portas} portas`}
                      v={m.portas_disposicao}
                      op={[{ id: "lado", nome: "Lado a lado (da esquerda para a direita)" }, { id: "sobrepostas", nome: "Sobrepostas (de cima para baixo)" }]}
                      pode={pode}
                      on={(v) => set("portas_disposicao", v)}
                      ajuda={m.portas_disposicao ? undefined : `Por responder (pela largura: ${disposicaoPortas(m) === "sobrepostas" ? "sobrepostas" : "lado a lado"})`}
                    />
                    <Pergunta
                      l="Acabamento das portas"
                      v={m.portas_diferentes == null ? undefined : m.portas_diferentes ? "dif" : "iguais"}
                      op={[{ id: "iguais", nome: "Todas iguais (como as frentes)" }, { id: "dif", nome: "Diferentes (todas ou algumas)" }]}
                      pode={pode}
                      on={(v) => set("portas_diferentes", v === "dif")}
                    />
                  </div>
                  {m.portas_diferentes && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600">
                        Porta 1 é a {disposicaoPortas(m) === "sobrepostas" ? "de cima; contam de cima para baixo" : "da esquerda; contam da esquerda para a direita"}. Marque só as portas com acabamento diferente das frentes.
                      </p>
                      {Array.from({ length: m.portas }, (_, i) => i + 1).map((n) => {
                        const propria = m.portas_acab?.[String(n)];
                        return (
                          <div key={n} className="rounded border border-slate-200 p-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                disabled={!pode}
                                checked={!!propria}
                                onChange={(ev) =>
                                  onAlterar((x) => {
                                    const acab = { ...(x.portas_acab ?? {}) };
                                    if (ev.target.checked) acab[String(n)] = JSON.parse(JSON.stringify(x.frente));
                                    else delete acab[String(n)];
                                    return { ...x, portas_acab: acab };
                                  })
                                }
                              />
                              <strong>Porta {n}</strong>
                              <span className="text-slate-500">{propria ? "· acabamento próprio" : "· igual às frentes"}</span>
                            </label>
                            {propria && (
                              <div className="mt-2">
                                <EditorEspec
                                  titulo={`Porta ${n}`}
                                  frente
                                  e={propria}
                                  decors={decors}
                                  pode={pode}
                                  on={(e) => onAlterar((x) => ({ ...x, portas_acab: { ...(x.portas_acab ?? {}), [String(n)]: e } }))}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {pode && <p className="text-xs text-amber-700">Depois de mudar a disposição ou os acabamentos das portas, use «Regenerar listas» (cria uma linha por porta).</p>}
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                <EditorEspec titulo="Corpo" e={m.corpo} decors={decors} pode={pode} on={(e) => mudarEspec("corpo", e)} />
                {(() => {
                  // o acabamento das frentes só se pede para o que ainda o usa
                  const proprias = m.portas_diferentes && m.portas > 1 && m.tipo_porta !== "Correr" ? Object.keys(m.portas_acab ?? {}).filter((k) => Number(k) <= m.portas).length : 0;
                  const portasFrente = m.portas - proprias;
                  const rodapeFrente = TIPOS_MOVEL[m.tipo].pes && (m.rodape_tipo == null || m.rodape_tipo === "laminado");
                  const partes = [portasFrente > 0 && (proprias > 0 ? `${portasFrente === 1 ? "porta" : "portas"} sem acabamento próprio` : "portas"), m.gavetas > 0 && "gavetas", rodapeFrente && "rodapé"].filter(Boolean) as string[];
                  if (partes.length === 0)
                    return (
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        <p className="font-semibold text-slate-700">Frentes</p>
                        <p className="mt-1">
                          Não se aplica: {proprias > 0 ? "todas as portas têm acabamento próprio" : "o móvel não tem portas"}
                          {m.gavetas === 0 ? ", não tem gavetas" : ""}
                          {TIPOS_MOVEL[m.tipo].pes ? " e o rodapé tem acabamento próprio" : ""}.
                        </p>
                      </div>
                    );
                  return <EditorEspec titulo={`Frentes (${partes.join(", ")})`} frente={portasFrente > 0 || m.gavetas > 0} e={m.frente} decors={decors} pode={pode} on={(e) => mudarEspec("frente", e)} />;
                })()}
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
          {sep === "Operações" && <TabelaOperacoes m={m} pode={pode} cm={custoMinuto} onAlterar={onAlterar} />}
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

/** Pergunta com botões de escolha; fica a amarelo enquanto não tiver resposta. */
function Pergunta<T extends string>({ l, v, op, on, pode, ajuda }: { l: string; v: T | undefined; op: { id: T; nome: string }[]; on: (v: T) => void; pode: boolean; ajuda?: string }) {
  return (
    <div className={`rounded-md border p-2 ${v ? "border-slate-200" : "border-amber-300 bg-amber-50"}`}>
      <p className="rotulo">{l}</p>
      <div className="flex flex-wrap gap-1">
        {op.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={!pode}
            aria-pressed={v === o.id}
            onClick={() => on(o.id)}
            className={`rounded border px-2 py-1 text-xs font-medium ${v === o.id ? "border-marca bg-marca text-white" : "border-slate-300 bg-white hover:border-slate-500"}`}
          >
            {o.nome}
          </button>
        ))}
      </div>
      {ajuda && <p className={`mt-1 text-xs ${v ? "text-slate-500" : "text-amber-800"}`}>{ajuda}</p>}
    </div>
  );
}

const MATERIAIS_FACE: { id: FaceDentro["material"]; nome: string }[] = [
  { id: "laminado", nome: "Laminado" },
  { id: "folheado", nome: "Folheado" },
  { id: "lacado", nome: "Lacado" },
];

/** Campo do acabamento de uma face: decor (laminado, da lista) ou texto (cor / folha). */
function CampoAcabamento({ material, valor, decors, pode, on }: { material: string; valor: string; decors: Decor[]; pode: boolean; on: (v: string) => void }) {
  if (material === "laminado")
    return (
      <div className="sm:col-span-2">
        <label className="rotulo">Decor (referência)</label>
        <SeletorDecor decors={decors} valor={valor} pode={pode} onChange={on} />
      </div>
    );
  return (
    <div>
      <label className="rotulo">{material === "lacado" ? "Cor (RAL / ref.)" : "Folha / madeira"}</label>
      <input className="campo" disabled={!pode} value={valor} onChange={(x) => on(x.target.value)} />
    </div>
  );
}

function EditorEspec({ titulo, e, decors, pode, on, frente }: { titulo: string; e: EspecMaterial; decors: Decor[]; pode: boolean; on: (e: EspecMaterial) => void; frente?: boolean }) {
  const dif = !!frente && e.faces === "diferentes";
  const de: FaceDentro = e.dentro ?? { material: "laminado", acabamento: "", extra_m2: null };
  // faces diferentes com algum acabamento que não seja laminado: placa de MDF e custo por face
  const mista = dif && !(e.material === "laminado" && de.material === "laminado");
  const rotuloFace = (mat: string) => (mat === "folheado" ? "Folha de madeira (€/m²)" : mat === "lacado" ? "Lacagem (€/m²)" : "Laminado aplicado (€/m²)");
  const extraRotulo = dif
    ? mista ? rotuloFace(e.material) : ""
    : e.material === "folheado" ? "Folha de madeira (€/m² por face)" : e.material === "lacado" ? "Lacagem (€/m² por face)" : e.material === "madeira" ? "Madeira maciça (€/m²)" : "";
  const perguntaOrla = e.material === "madeira" || e.material === "folheado";
  const precisaMdf = dif ? mista : e.material === "folheado" || e.material === "lacado";
  const materiais = dif ? MATERIAIS.filter((m) => m.id !== "madeira") : MATERIAIS;
  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold">{titulo}</legend>
      {frente && (
        <div className="mb-3">
          <Pergunta
            l="Acabamento das faces (dentro / fora)"
            v={e.faces}
            op={[{ id: "iguais", nome: "Igual nas duas faces" }, { id: "diferentes", nome: "Diferente em cada face" }]}
            pode={pode}
            on={(v) => on({ ...e, faces: v, ...(v === "diferentes" ? { dentro: e.dentro ?? { material: e.material === "madeira" ? "laminado" : e.material, acabamento: "", extra_m2: null }, material: e.material === "madeira" ? "laminado" : e.material } : {}) })}
            ajuda={e.faces ? undefined : "Por responder: escolha se portas e gavetas têm o mesmo acabamento por dentro e por fora."}
          />
        </div>
      )}
      {dif && <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Face de fora</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Sel l="Material" v={e.material} op={materiais.map((m) => m.id)} rot={Object.fromEntries(materiais.map((m) => [m.id, m.nome]))} on={(v) => on({ ...e, material: v as EspecMaterial["material"] })} pode={pode} semVazio />
        {precisaMdf && (
          <Sel l="MDF" v={e.mdf} op={MDFS.map((m) => m.id)} rot={Object.fromEntries(MDFS.map((m) => [m.id, m.nome]))} on={(v) => on({ ...e, mdf: v as EspecMaterial["mdf"] })} pode={pode} />
        )}
        <CampoAcabamento material={e.material} valor={e.acabamento} decors={decors} pode={pode} on={(v) => on({ ...e, acabamento: v, grupo: "" })} />
        {extraRotulo && (
          <div>
            <label className="rotulo">{extraRotulo}</label>
            <CampoNumero className="campo" disabled={!pode} valor={e.extra_m2} onValor={(v) => on({ ...e, extra_m2: v })} />
          </div>
        )}
      </div>
      {dif && (
        <>
          <p className="mb-1 mt-4 text-xs font-semibold uppercase text-slate-500">Face de dentro</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Sel l="Material" v={de.material} op={MATERIAIS_FACE.map((m) => m.id)} rot={Object.fromEntries(MATERIAIS_FACE.map((m) => [m.id, m.nome]))} on={(v) => on({ ...e, dentro: { ...de, material: v as FaceDentro["material"] } })} pode={pode} semVazio />
            <CampoAcabamento material={de.material} valor={de.acabamento} decors={decors} pode={pode} on={(v) => on({ ...e, dentro: { ...de, acabamento: v } })} />
            {mista && (
              <div>
                <label className="rotulo">{rotuloFace(de.material)}</label>
                <CampoNumero className="campo" disabled={!pode} valor={de.extra_m2} onValor={(v) => on({ ...e, dentro: { ...de, extra_m2: v } })} />
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {mista ? "Placa de MDF com acabamento próprio em cada face (custo por m² de cada face)." : "Placa laminada bi-decor: conta o preço mais alto das duas referências."}
          </p>
        </>
      )}
      <div className="mt-2 text-sm">
        {e.material === "laminado" && <p className="text-xs text-slate-500">Orla em todo o perímetro das peças.</p>}
        {e.material === "lacado" && <p className="text-xs text-slate-500">Lacado: as peças não levam orla.</p>}
        {perguntaOrla && (
          <div className="flex flex-wrap items-center gap-3 rounded bg-sky-50 px-2 py-1.5">
            <span>Pretende orlar as peças?</span>
            <label className="flex items-center gap-1"><input type="radio" disabled={!pode} checked={!!e.orlar} onChange={() => on({ ...e, orlar: true })} /> Sim</label>
            <label className="flex items-center gap-1"><input type="radio" disabled={!pode} checked={!e.orlar} onChange={() => on({ ...e, orlar: false })} /> Não (orla a 0)</label>
          </div>
        )}
      </div>
      {pode && <p className="mt-2 text-xs text-slate-500">As orlas das peças acompanham logo a mudança de material. Para os preços, use «Actualizar preços» ou «Regenerar listas».</p>}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ tabelas de linhas */

function celula(pode: boolean, v: string | number | null, on: (v: string) => void, tipo: "text" | "number" = "text", largura = "w-20", pendente = false) {
  if (!pode) return <span className={pendente ? "rounded bg-amber-100 px-1" : ""}>{v ?? "—"}</span>;
  const cls = `rounded border px-1 py-0.5 text-sm ${largura} ${pendente ? "border-amber-400 bg-amber-50" : "border-slate-300"}`;
  if (tipo === "number") return <CampoNumero className={cls} valor={typeof v === "number" ? v : v == null || v === "" ? null : Number(v)} onValor={(n) => on(n == null ? "" : String(n))} />;
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
                <td>
                  {p.faces_extra > 0 ? celula(pode, p.preco_extra_m2, (v) => setP(p.id, "preco_extra_m2", numOuNull(v)), "number", "w-20", p.preco_extra_m2 == null) : !p.face_dentro && <span className="text-slate-300">—</span>}
                  {p.face_dentro && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                      {p.faces_extra > 0 && "fora · "}dentro {celula(pode, p.preco_dentro_m2 ?? null, (v) => setP(p.id, "preco_dentro_m2", numOuNull(v)), "number", "w-16", p.preco_dentro_m2 == null)}
                    </span>
                  )}
                </td>
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

function TabelaOperacoes({ m, pode, cm, onAlterar }: { m: Movel; pode: boolean; cm: number; onAlterar: (fn: (m: Movel) => Movel) => void }) {
  const nP = nPecasMovel(m);
  const setO = (oid: string, k: string, v: unknown) => onAlterar((x) => ({ ...x, operacoes: x.operacoes.map((o) => (o.id === oid ? { ...o, [k]: v } : o)) }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-slate-500">
          <tr><th className="py-1">Posto</th><th>Descrição</th><th>Nº peças</th><th>Min. por peça</th><th>€/min</th><th className="text-right">Total</th><th></th></tr>
        </thead>
        <tbody>
          {m.operacoes.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="py-1">{celula(pode, o.posto, (v) => setO(o.id, "posto", v), "text", "w-28")}</td>
              <td>{celula(pode, o.descricao, (v) => setO(o.id, "descricao", v), "text", "w-56")}</td>
              <td className="tabular-nums text-slate-600">{o.por_peca ? nP : <span title="Linha antiga: minutos totais do móvel">— (total)</span>}</td>
              <td>{celula(pode, o.minutos, (v) => setO(o.id, "minutos", Number(v)), "number", "w-20")}</td>
              <td>{celula(pode, o.custo_minuto, (v) => setO(o.id, "custo_minuto", numOuNull(v)), "number", "w-16")}</td>
              <td className="text-right tabular-nums" title={o.por_peca ? `${nP} peças × ${o.minutos} min × ${o.custo_minuto ?? cm} €/min` : undefined}>{euro(custoOperacao(o, nP, cm))}</td>
              <td>{pode && <button className="text-xs text-rose-700" aria-label="Remover operação" onClick={() => onAlterar((x) => ({ ...x, operacoes: x.operacoes.filter((q) => q.id !== o.id) }))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pode && (
        <button className="mt-2 text-sm font-medium text-marca hover:underline" onClick={() => onAlterar((x) => ({ ...x, operacoes: [...x.operacoes, { id: uid(), posto: "TRABALHADOR", descricao: "Mão de obra", minutos: 1, custo_minuto: null, por_peca: true }] }))}>
          + Operação
        </button>
      )}
      <p className="mt-1 text-xs text-slate-500">Custo de cada operação = nº de peças do móvel × minutos por peça × €/min. Tempos propostos automaticamente; ajuste conforme a experiência. €/min vazio usa o custo por minuto do orçamento.</p>
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
      <CampoNumero className="campo" disabled={!pode} valor={v} onValor={(n) => on(n ?? 0)} />
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
