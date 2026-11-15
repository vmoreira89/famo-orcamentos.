"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import DialogoMotivo from "@/components/DialogoMotivo";
import {
  DESCRITIVO_COMUM,
  DESCRITIVO_POR_TIPO,
  DIVISOES,
  ESTADOS,
  MATERIAIS,
  MDFS,
  dataHora,
  nomeDivisao,
  nomeFicheiroSeguro,
  nomeMaterial,
  nomeMdf,
  precisaMdf,
  type Comentario,
  type Divisao,
  type EstadoPedido,
  type Ficheiro,
  type Material,
  type Mdf,
  type Pedido,
  type TipoDivisao,
} from "@/lib/pedido";

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<string | null>;

export type Autorizacao = {
  id: string;
  utilizador: string;
  concedida_por: string;
  motivo: string;
  valida_ate: string;
  revogada_em: string | null;
};

function Cabecalho({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="font-semibold">{titulo}</h2>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- Dados gerais */

export function SecaoDados({ pedido, podeEditar, rpc }: { pedido: Pedido; podeEditar: boolean; rpc: Rpc }) {
  const inicial = {
    nome_projecto: pedido.nome_projecto,
    identificacao_projecto: pedido.identificacao_projecto ?? "",
    contacto_nome: pedido.contacto_nome,
    contacto_empresa: pedido.contacto_empresa ?? "",
    contacto_email: pedido.contacto_email ?? "",
    contacto_telefone: pedido.contacto_telefone ?? "",
    observacoes: pedido.observacoes ?? "",
  };
  const [editar, setEditar] = useState(false);
  const [d, setD] = useState(inicial);
  const [confirmar, setConfirmar] = useState(false);

  const campos: { k: keyof typeof inicial; l: string; largo?: boolean }[] = [
    { k: "nome_projecto", l: "Nome do projecto" },
    { k: "identificacao_projecto", l: "Identificação" },
    { k: "contacto_nome", l: "Contacto" },
    { k: "contacto_empresa", l: "Empresa" },
    { k: "contacto_email", l: "Email" },
    { k: "contacto_telefone", l: "Telefone" },
    { k: "observacoes", l: "Observações", largo: true },
  ];

  return (
    <section className="cartao p-5">
      <Cabecalho titulo="Dados do pedido">
        {podeEditar && !editar && (
          <button className="text-sm font-medium text-marca hover:underline" onClick={() => setEditar(true)}>Editar</button>
        )}
        {editar && (
          <>
            <button className="btn-secundario" onClick={() => { setD(inicial); setEditar(false); }}>Cancelar</button>
            <button className="btn-primario" onClick={() => setConfirmar(true)}>Guardar</button>
          </>
        )}
      </Cabecalho>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {campos.map((c) => (
          <div key={c.k} className={c.largo ? "sm:col-span-2" : ""}>
            <dt className="text-xs uppercase text-slate-500">{c.l}</dt>
            {editar ? (
              c.largo ? (
                <textarea aria-label={c.l} rows={3} className="campo mt-1" value={d[c.k]} onChange={(e) => setD({ ...d, [c.k]: e.target.value })} />
              ) : (
                <input aria-label={c.l} className="campo mt-1" value={d[c.k]} onChange={(e) => setD({ ...d, [c.k]: e.target.value })} />
              )
            ) : (
              <dd className="whitespace-pre-wrap">{d[c.k] || <span className="text-slate-400">—</span>}</dd>
            )}
          </div>
        ))}
      </dl>
      <DialogoMotivo
        aberto={confirmar}
        titulo="Guardar alterações aos dados do pedido"
        onFechar={() => setConfirmar(false)}
        onConfirmar={async (m) => {
          const e = await rpc("atualizar_pedido", { p_id: pedido.id, p_dados: d, p_motivo: m });
          if (!e) setEditar(false);
          return e;
        }}
      />
    </section>
  );
}

/* ---------------------------------------------------------------- Divisões */

type DivisaoEditavel = {
  id: string | null;
  tipo: TipoDivisao;
  designacao: string;
  quantidade: number;
  material: Material;
  mdf: Mdf | "";
  requer_desenho: boolean;
  descritivo: Record<string, string>;
};

const paraEditavel = (v: Divisao): DivisaoEditavel => ({
  id: v.id,
  tipo: v.tipo,
  designacao: v.designacao,
  quantidade: v.quantidade,
  material: v.material,
  mdf: v.mdf ?? "",
  requer_desenho: v.requer_desenho,
  descritivo: v.descritivo ?? {},
});

export function SecaoDivisoes({
  pedidoId,
  divisoes,
  podeEditar,
  rpc,
}: {
  pedidoId: string;
  divisoes: Divisao[];
  podeEditar: boolean;
  rpc: Rpc;
}) {
  const [emEdicao, setEmEdicao] = useState<DivisaoEditavel | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [remover, setRemover] = useState<Divisao | null>(null);

  return (
    <section className="cartao p-5">
      <Cabecalho titulo={`Divisões (${divisoes.length})`}>
        {podeEditar && !emEdicao && (
          <button
            className="text-sm font-medium text-marca hover:underline"
            onClick={() =>
              setEmEdicao({ id: null, tipo: "cozinha", designacao: "", quantidade: 1, material: "laminado", mdf: "", requer_desenho: false, descritivo: {} })
            }
          >
            + Divisão
          </button>
        )}
      </Cabecalho>

      {emEdicao && emEdicao.id === null && (
        <EditorDivisao d={emEdicao} onChange={setEmEdicao} onCancelar={() => setEmEdicao(null)} onGuardar={() => setConfirmar(true)} />
      )}

      <div className="space-y-4">
        {divisoes.map((v) =>
          emEdicao?.id === v.id ? (
            <EditorDivisao key={v.id} d={emEdicao} onChange={setEmEdicao} onCancelar={() => setEmEdicao(null)} onGuardar={() => setConfirmar(true)} />
          ) : (
            <VistaDivisao
              key={v.id}
              v={v}
              podeEditar={podeEditar && !emEdicao}
              onEditar={() => setEmEdicao(paraEditavel(v))}
              onRemover={() => setRemover(v)}
            />
          ),
        )}
      </div>

      <DialogoMotivo
        aberto={confirmar}
        titulo={emEdicao?.id ? `Guardar alterações a "${emEdicao.designacao}"` : "Acrescentar divisão"}
        onFechar={() => setConfirmar(false)}
        onConfirmar={async (m) => {
          if (!emEdicao) return null;
          const { id, ...dados } = emEdicao;
          const e = await rpc("guardar_divisao", { p_pedido: pedidoId, p_divisao: id, p_dados: dados, p_motivo: m });
          if (!e) setEmEdicao(null);
          return e;
        }}
      />
      <DialogoMotivo
        aberto={!!remover}
        titulo={`Remover "${remover?.designacao ?? ""}"`}
        descricao="A divisão e as respostas do descritivo deixam de fazer parte do pedido. Fica registado no histórico."
        textoConfirmar="Remover"
        onFechar={() => setRemover(null)}
        onConfirmar={(m) => rpc("remover_divisao", { p_divisao: remover!.id, p_motivo: m })}
      />
    </section>
  );
}

function VistaDivisao({ v, podeEditar, onEditar, onRemover }: { v: Divisao; podeEditar: boolean; onEditar: () => void; onRemover: () => void }) {
  const campos = [...(DESCRITIVO_POR_TIPO[v.tipo] ?? []), ...DESCRITIVO_COMUM].filter((c) => v.descritivo?.[c.id]);
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {v.quantidade}× {v.designacao} <span className="font-normal text-slate-500">· {nomeDivisao(v.tipo)}</span>
          </p>
          <p className="text-sm text-slate-600">
            {nomeMaterial(v.material)}
            {v.mdf && ` · ${nomeMdf(v.mdf)}`} · Desenho: {v.requer_desenho ? "sim" : "não"}
          </p>
        </div>
        {podeEditar && (
          <div className="flex gap-3 text-sm">
            <button className="font-medium text-marca hover:underline" onClick={onEditar}>Editar</button>
            <button className="text-rose-700 hover:underline" onClick={onRemover}>Remover</button>
          </div>
        )}
      </div>
      {campos.length > 0 ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {campos.map((c) => (
            <div key={c.id} className={c.tipo === "textarea" ? "sm:col-span-2" : ""}>
              <dt className="text-xs uppercase text-slate-500">{c.label}</dt>
              <dd className="whitespace-pre-wrap">{v.descritivo[c.id]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-slate-400">Descritivo por preencher.</p>
      )}
    </div>
  );
}

function EditorDivisao({
  d,
  onChange,
  onCancelar,
  onGuardar,
}: {
  d: DivisaoEditavel;
  onChange: (d: DivisaoEditavel) => void;
  onCancelar: () => void;
  onGuardar: () => void;
}) {
  const campos = [...(DESCRITIVO_POR_TIPO[d.tipo] ?? []), ...DESCRITIVO_COMUM];
  const valido = d.designacao.trim() && d.quantidade > 0 && (!precisaMdf(d.material) || d.mdf);
  return (
    <div className="mb-4 space-y-4 rounded-lg border-2 border-marca/40 bg-marca-claro/30 p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="rotulo" htmlFor="ed-tipo">Tipo</label>
          <select id="ed-tipo" className="campo" value={d.tipo} onChange={(e) => onChange({ ...d, tipo: e.target.value as TipoDivisao })}>
            {DIVISOES.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="ed-des">Designação</label>
          <input id="ed-des" className="campo" value={d.designacao} onChange={(e) => onChange({ ...d, designacao: e.target.value })} />
        </div>
        <div>
          <label className="rotulo" htmlFor="ed-qtd">Quantidade</label>
          <input id="ed-qtd" type="number" min={1} className="campo" value={d.quantidade} onChange={(e) => onChange({ ...d, quantidade: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
        </div>
        <div>
          <label className="rotulo" htmlFor="ed-mat">Material</label>
          <select id="ed-mat" className="campo" value={d.material} onChange={(e) => onChange({ ...d, material: e.target.value as Material, mdf: precisaMdf(e.target.value as Material) ? d.mdf : "" })}>
            {MATERIAIS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        {precisaMdf(d.material) && (
          <div>
            <label className="rotulo" htmlFor="ed-mdf">Tipo de MDF</label>
            <select id="ed-mdf" className="campo" value={d.mdf} onChange={(e) => onChange({ ...d, mdf: e.target.value as Mdf })}>
              <option value="">—</option>
              {MDFS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
        )}
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={d.requer_desenho} onChange={(e) => onChange({ ...d, requer_desenho: e.target.checked })} />
          Pretende desenho
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {campos.map((c) => (
          <div key={c.id} className={c.tipo === "textarea" ? "sm:col-span-2" : ""}>
            <label className="rotulo" htmlFor={`ed-${c.id}`}>{c.label}</label>
            {c.tipo === "opcoes" ? (
              <select id={`ed-${c.id}`} className="campo" value={d.descritivo[c.id] ?? ""} onChange={(e) => onChange({ ...d, descritivo: { ...d.descritivo, [c.id]: e.target.value } })}>
                <option value="">—</option>
                {c.opcoes!.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : c.tipo === "textarea" ? (
              <textarea id={`ed-${c.id}`} rows={2} className="campo" value={d.descritivo[c.id] ?? ""} onChange={(e) => onChange({ ...d, descritivo: { ...d.descritivo, [c.id]: e.target.value } })} />
            ) : (
              <input id={`ed-${c.id}`} className="campo" value={d.descritivo[c.id] ?? ""} onChange={(e) => onChange({ ...d, descritivo: { ...d.descritivo, [c.id]: e.target.value } })} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button className="btn-primario" disabled={!valido} onClick={onGuardar}>Guardar</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Ficheiros */

export function SecaoFicheiros({
  pedidoId,
  ficheiros,
  divisoes,
  podeEditar,
  rpc,
}: {
  pedidoId: string;
  ficheiros: Ficheiro[];
  divisoes: Divisao[];
  podeEditar: boolean;
  rpc: Rpc;
}) {
  const [novo, setNovo] = useState<File | null>(null);
  const [divisaoNovo, setDivisaoNovo] = useState("");
  const [remover, setRemover] = useState<Ficheiro | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function abrir(f: Ficheiro) {
    const { data, error } = await supabase().storage.from("pedidos").createSignedUrl(f.storage_path, 300, { download: f.nome_original });
    if (error || !data) alert("Não foi possível abrir o ficheiro.");
    else window.open(data.signedUrl, "_blank", "noopener");
  }

  const grupos = [
    ...divisoes.map((d) => ({ id: d.id, nome: d.designacao })),
    { id: null as string | null, nome: "Geral" },
  ]
    .map((g) => ({ ...g, itens: ficheiros.filter((f) => f.divisao_id === g.id) }))
    .filter((g) => g.itens.length > 0);

  return (
    <section className="cartao p-5">
      <Cabecalho titulo={`Ficheiros (${ficheiros.length})`}>
        {podeEditar && (
          <>
            <input
              ref={input}
              type="file"
              className="hidden"
              aria-label="Carregar ficheiro"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 50 * 1024 * 1024) alert("Máximo 50 MB por ficheiro.");
                  else setNovo(f);
                }
                e.target.value = "";
              }}
            />
            <button className="text-sm font-medium text-marca hover:underline" onClick={() => input.current?.click()}>
              + Carregar
            </button>
          </>
        )}
      </Cabecalho>
      {ficheiros.length === 0 && <p className="text-sm text-slate-400">Sem ficheiros anexos.</p>}
      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g.id ?? "geral"}>
            <p className="text-xs uppercase text-slate-500">{g.nome}</p>
            <ul className="mt-1 space-y-1">
              {g.itens.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-3 py-1.5 text-sm">
                  <button className="truncate text-left text-marca hover:underline" onClick={() => abrir(f)}>
                    📎 {f.nome_original}
                  </button>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                    {f.tamanho ? `${(f.tamanho / 1024 / 1024).toFixed(1)} MB` : ""}
                    {podeEditar && (
                      <button className="text-rose-700 hover:underline" onClick={() => setRemover(f)}>retirar</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <DialogoMotivo
        aberto={!!novo}
        titulo={`Carregar "${novo?.name ?? ""}"`}
        onFechar={() => setNovo(null)}
        onConfirmar={async (m) => {
          if (!novo) return null;
          const path = `uploads/interno/${pedidoId}/${Date.now()}-${nomeFicheiroSeguro(novo.name)}`;
          const up = await supabase().storage.from("pedidos").upload(path, novo, { contentType: novo.type || "application/octet-stream" });
          if (up.error) return `Falhou o carregamento: ${up.error.message}`;
          return rpc("adicionar_ficheiro", {
            p_pedido: pedidoId,
            p_divisao: divisaoNovo || null,
            p_path: path,
            p_nome: novo.name,
            p_tamanho: novo.size,
            p_mime: novo.type,
            p_motivo: m,
          });
        }}
      >
        <div>
          <label className="rotulo" htmlFor="fic-div">Associar a</label>
          <select id="fic-div" className="campo" value={divisaoNovo} onChange={(e) => setDivisaoNovo(e.target.value)}>
            <option value="">Geral (todo o pedido)</option>
            {divisoes.map((d) => <option key={d.id} value={d.id}>{d.designacao}</option>)}
          </select>
        </div>
      </DialogoMotivo>
      <DialogoMotivo
        aberto={!!remover}
        titulo={`Retirar "${remover?.nome_original ?? ""}"`}
        textoConfirmar="Retirar"
        onFechar={() => setRemover(null)}
        onConfirmar={(m) => rpc("remover_ficheiro", { p_ficheiro: remover!.id, p_motivo: m })}
      />
    </section>
  );
}

/* ---------------------------------------------------------------- Comentários */

export function SecaoComentarios({
  pedidoId,
  comentarios,
  nomeDe,
  podeResolver,
  onAlterado,
}: {
  pedidoId: string;
  comentarios: Comentario[];
  nomeDe: (id: string | null) => string;
  podeResolver: boolean;
  onAlterado: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [aEnviar, setAEnviar] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setAEnviar(true);
    const { error } = await supabase().from("comentarios").insert({ pedido_id: pedidoId, texto: texto.trim() });
    setAEnviar(false);
    if (error) setErro(error.message);
    else {
      setTexto("");
      setErro("");
      onAlterado();
    }
  }

  async function alternar(c: Comentario) {
    const { error } = await supabase().rpc("resolver_comentario", { p_id: c.id, p_resolvido: !c.resolvido });
    if (error) alert(error.message);
    else onAlterado();
  }

  return (
    <section className="cartao p-5">
      <Cabecalho titulo={`Comentários (${comentarios.filter((c) => !c.resolvido).length} por aplicar)`} />
      <ul className="space-y-3">
        {comentarios.map((c) => (
          <li key={c.id} className={`rounded-md border p-3 text-sm ${c.resolvido ? "border-slate-200 bg-slate-50 text-slate-500" : "border-amber-200 bg-amber-50"}`}>
            <p className="whitespace-pre-wrap">{c.texto}</p>
            <p className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{nomeDe(c.autor)} · {dataHora(c.created_at)}</span>
              {podeResolver ? (
                <button className="font-medium text-marca hover:underline" onClick={() => alternar(c)}>
                  {c.resolvido ? "reabrir" : "marcar como aplicado"}
                </button>
              ) : (
                c.resolvido && <span>aplicado</span>
              )}
            </p>
          </li>
        ))}
        {comentarios.length === 0 && <li className="text-sm text-slate-400">Ainda sem comentários.</li>}
      </ul>
      <form onSubmit={enviar} className="mt-4 space-y-2">
        <label className="sr-only" htmlFor="novo-comentario">Novo comentário</label>
        <textarea id="novo-comentario" rows={3} className="campo" placeholder="Deixe uma nota para o orçamentista…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        {erro && <p className="text-sm text-rose-700">{erro}</p>}
        <button className="btn-primario w-full" disabled={aEnviar || !texto.trim()}>Comentar</button>
      </form>
    </section>
  );
}

/* ---------------------------------------------------------------- Histórico */

type Registo = { id: number; quando: string; tabela: string; accao: string; quem: string | null; motivo: string | null; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null };

const ROTULOS: Record<string, string> = {
  estado: "Estado",
  numero_projecto: "Nº projecto",
  responsavel: "Responsável",
  nome_projecto: "Nome do projecto",
  identificacao_projecto: "Identificação",
  contacto_nome: "Contacto",
  contacto_email: "Email",
  contacto_telefone: "Telefone",
  contacto_empresa: "Empresa",
  observacoes: "Observações",
  designacao: "Designação",
  quantidade: "Quantidade",
  material: "Material",
  mdf: "MDF",
  tipo: "Tipo",
  requer_desenho: "Desenho",
  descritivo: "Descritivo",
  acabamento: "Acabamento",
  resolvido: "Aplicado",
  margem_pct: "Margem %",
  custo_total: "Custo total",
  preco_venda: "Preço final",
  pendentes: "Linhas sem preço",
  revogada_em: "Revogada",
};
const IGNORAR = new Set(["updated_at", "created_at", "notificado_em", "ordem", "dados", "parametros", "versao", "calculado_em"]);

function valorLegivel(k: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (k === "estado") return ESTADOS[v as EstadoPedido]?.nome ?? String(v);
  if (k === "material") return nomeMaterial(String(v));
  if (k === "mdf") return nomeMdf(String(v));
  if (k === "tipo") return nomeDivisao(String(v));
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "object") return "(alterado)";
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

function descrever(r: Registo): { titulo: string; mudancas: string[] } {
  const nome = (r.depois?.designacao ?? r.antes?.designacao ?? r.depois?.nome_original ?? r.antes?.nome_original ?? "") as string;
  const t: Record<string, Record<string, string>> = {
    pedidos: { INSERT: "Pedido criado", UPDATE: "Pedido alterado", DELETE: "Pedido apagado" },
    pedido_divisoes: { INSERT: `Divisão acrescentada: ${nome}`, UPDATE: `Divisão alterada: ${nome}`, DELETE: `Divisão removida: ${nome}` },
    pedido_ficheiros: { INSERT: `Ficheiro anexado: ${nome}`, UPDATE: `Ficheiro alterado: ${nome}`, DELETE: `Ficheiro retirado: ${nome}` },
    comentarios: { INSERT: "Comentário adicionado", UPDATE: "Comentário actualizado", DELETE: "Comentário apagado" },
    autorizacoes: { INSERT: "Autorização de edição concedida", UPDATE: "Autorização alterada", DELETE: "Autorização apagada" },
    desenhos_gerados: { INSERT: "Desenhos gerados", UPDATE: "Desenhos alterados", DELETE: "Desenhos apagados" },
    orcamentos: { INSERT: "Orçamento guardado (1.ª versão)", UPDATE: `Orçamento guardado (versão ${r.depois?.versao ?? "?"})`, DELETE: "Orçamento apagado" },
  };
  const titulo = t[r.tabela]?.[r.accao] ?? `${r.tabela} ${r.accao}`;
  const mudancas: string[] = [];
  if (r.accao === "UPDATE" && r.antes && r.depois) {
    for (const k of Object.keys(r.depois)) {
      if (IGNORAR.has(k)) continue;
      if (JSON.stringify(r.antes[k]) !== JSON.stringify(r.depois[k])) {
        if (k === "responsavel") mudancas.push("Responsável alterado");
        else mudancas.push(`${ROTULOS[k] ?? k}: ${valorLegivel(k, r.antes[k])} → ${valorLegivel(k, r.depois[k])}`);
      }
    }
  }
  return { titulo, mudancas };
}

export function SecaoHistorico({ pedidoId }: { pedidoId: string }) {
  const [registos, setRegistos] = useState<Registo[]>([]);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    supabase()
      .rpc("historico_pedido", { p_id: pedidoId })
      .then(({ data }) => setRegistos(((data as Registo[]) ?? []).filter((r) => {
        // esconde a marcação técnica do envio de email
        if (r.tabela === "pedidos" && r.accao === "UPDATE") return descrever(r).mudancas.length > 0 || !!r.motivo;
        return true;
      })));
  }, [pedidoId]);

  const visiveis = todos ? registos : registos.slice(0, 12);

  return (
    <section className="cartao p-5">
      <Cabecalho titulo="Histórico" />
      <ol className="relative space-y-4 border-l border-slate-200 pl-4">
        {visiveis.map((r) => {
          const { titulo, mudancas } = descrever(r);
          return (
            <li key={r.id} className="text-sm">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-marca" aria-hidden />
              <p className="font-medium">{titulo}</p>
              {mudancas.length > 0 && (
                <ul className="text-slate-600">
                  {mudancas.map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
              {r.motivo && <p className="italic text-slate-600">“{r.motivo}”</p>}
              <p className="text-xs text-slate-500">{r.quem ?? "Sistema"} · {dataHora(r.quando)}</p>
            </li>
          );
        })}
        {registos.length === 0 && <li className="text-sm text-slate-400">Sem registos.</li>}
      </ol>
      {registos.length > 12 && (
        <button className="mt-3 text-sm font-medium text-marca hover:underline" onClick={() => setTodos(!todos)}>
          {todos ? "Mostrar menos" : `Ver tudo (${registos.length})`}
        </button>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- Desenhos gerados */

type PacoteDesenhos = { id: string; storage_path: string; versao_orcamento: number | null; n_ficheiros: number | null; tamanho: number | null; criado_por: string; created_at: string };

export function SecaoDesenhos({ pedidoId, nomeDe }: { pedidoId: string; nomeDe: (id: string | null) => string }) {
  const [pacotes, setPacotes] = useState<PacoteDesenhos[]>([]);
  useEffect(() => {
    supabase()
      .from("desenhos_gerados")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setPacotes((data as PacoteDesenhos[]) ?? []));
  }, [pedidoId]);
  async function abrir(p: PacoteDesenhos) {
    const nome = p.storage_path.split("/").pop();
    const { data, error } = await supabase().storage.from("pedidos").createSignedUrl(p.storage_path, 300, { download: nome });
    if (error || !data) alert("Não foi possível descarregar.");
    else window.location.href = data.signedUrl;
  }
  return (
    <section className="cartao p-5">
      <Cabecalho titulo={`Desenhos gerados (${pacotes.length})`} />
      {pacotes.length === 0 && <p className="text-sm text-slate-400">Ainda não foram gerados desenhos. Use o botão «Desenhos» na página do orçamento.</p>}
      <ul className="space-y-1">
        {pacotes.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-3 py-1.5 text-sm">
            <button className="text-left text-marca hover:underline" onClick={() => abrir(p)}>📦 {p.storage_path.split("/").pop()}</button>
            <span className="text-xs text-slate-500">
              {p.n_ficheiros ?? "?"} ficheiros · {p.tamanho ? `${(p.tamanho / 1024 / 1024).toFixed(1)} MB` : ""} · orçamento v{p.versao_orcamento ?? "?"} · {nomeDe(p.criado_por)} · {dataHora(p.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
