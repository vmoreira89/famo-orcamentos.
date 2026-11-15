"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DESCRITIVO_COMUM,
  DESCRITIVO_POR_TIPO,
  DIVISOES,
  MATERIAIS,
  MDFS,
  letra,
  nomeFicheiroSeguro,
  precisaMdf,
  type CampoDescritivo,
  type FicheiroCarregado,
  type TipoDivisao,
  type VarianteDivisao,
} from "@/lib/pedido";

const PASSOS = ["Projecto", "Divisões", "Contacto", "Revisão"];
const TAMANHO_MAX = 50 * 1024 * 1024;

function novaChave() {
  return crypto.randomUUID();
}

function novaVariante(tipo: TipoDivisao, indice: number): VarianteDivisao {
  const d = DIVISOES.find((x) => x.id === tipo)!;
  return {
    chave: novaChave(),
    tipo,
    designacao: `${d.prefixo} ${letra(indice)}`,
    quantidade: 1,
    material: "",
    mdf: "",
    requer_desenho: null,
    descritivo: {},
    ficheiros: [],
  };
}

type Contacto = { nome: string; email: string; telefone: string; empresa: string };

export default function AssistentePedido({ interno = false }: { interno?: boolean }) {
  const router = useRouter();
  const sessao = useRef(novaChave());
  const [passo, setPasso] = useState(0);
  const [nomeProjecto, setNomeProjecto] = useState("");
  const [identificacao, setIdentificacao] = useState("");
  const [variantes, setVariantes] = useState<VarianteDivisao[]>([]);
  const [contacto, setContacto] = useState<Contacto>({ nome: "", email: "", telefone: "", empresa: "" });
  const [observacoes, setObservacoes] = useState("");
  const [erros, setErros] = useState<string[]>([]);
  const [aEnviar, setAEnviar] = useState(false);
  const [uploads, setUploads] = useState(0);

  const tiposEscolhidos = useMemo(() => new Set(variantes.map((v) => v.tipo)), [variantes]);

  function alternarTipo(tipo: TipoDivisao) {
    setVariantes((vs) =>
      tiposEscolhidos.has(tipo) ? vs.filter((v) => v.tipo !== tipo) : [...vs, novaVariante(tipo, 0)],
    );
  }

  function adicionarVariante(tipo: TipoDivisao) {
    setVariantes((vs) => {
      const n = vs.filter((v) => v.tipo === tipo).length;
      const ultimoIdx = vs.map((v) => v.tipo).lastIndexOf(tipo);
      const copia = [...vs];
      copia.splice(ultimoIdx + 1, 0, novaVariante(tipo, n));
      return copia;
    });
  }

  function removerVariante(chave: string) {
    setVariantes((vs) => vs.filter((v) => v.chave !== chave));
  }

  function actualizar(chave: string, alteracao: Partial<VarianteDivisao>) {
    setVariantes((vs) => vs.map((v) => (v.chave === chave ? { ...v, ...alteracao } : v)));
  }

  function actualizarDescritivo(chave: string, campo: string, valor: string) {
    setVariantes((vs) =>
      vs.map((v) => (v.chave === chave ? { ...v, descritivo: { ...v.descritivo, [campo]: valor } } : v)),
    );
  }

  async function carregarFicheiros(chave: string, lista: FileList | null) {
    if (!lista?.length) return;
    const novosErros: string[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > TAMANHO_MAX) {
        novosErros.push(`"${f.name}" ultrapassa 50 MB.`);
        continue;
      }
      const seguro = nomeFicheiroSeguro(f.name);
      const path = `uploads/${sessao.current}/${chave}/${Date.now()}-${seguro}`;
      setUploads((n) => n + 1);
      const { error } = await supabase().storage.from("pedidos").upload(path, f, {
        contentType: f.type || "application/octet-stream",
        upsert: false,
      });
      setUploads((n) => n - 1);
      if (error) {
        novosErros.push(`Não foi possível carregar "${f.name}": ${error.message}`);
        continue;
      }
      const ficheiro: FicheiroCarregado = { path, nome: f.name, tamanho: f.size, mime: f.type };
      setVariantes((vs) => vs.map((v) => (v.chave === chave ? { ...v, ficheiros: [...v.ficheiros, ficheiro] } : v)));
    }
    if (novosErros.length) setErros(novosErros);
  }

  function validar(p: number): string[] {
    const e: string[] = [];
    if (p === 0) {
      if (!nomeProjecto.trim()) e.push("Indique o nome do projecto.");
      if (variantes.length === 0) e.push("Escolha pelo menos uma divisão.");
    }
    if (p === 1) {
      variantes.forEach((v) => {
        if (!v.designacao.trim()) e.push("Todas as divisões precisam de uma designação.");
        if (!v.quantidade || v.quantidade < 1) e.push(`${v.designacao}: indique a quantidade.`);
        if (!v.material) e.push(`${v.designacao}: escolha o material.`);
        if (v.material && precisaMdf(v.material) && !v.mdf) e.push(`${v.designacao}: escolha o tipo de MDF.`);
        if (v.requer_desenho === null) e.push(`${v.designacao}: indique se pretende desenho.`);
      });
    }
    if (p === 2) {
      if (!contacto.nome.trim()) e.push("Indique o nome de contacto.");
      if (!contacto.email.trim() && !contacto.telefone.trim()) e.push("Indique um email ou um telefone.");
      if (contacto.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto.email.trim()))
        e.push("O email não parece válido.");
    }
    return e;
  }

  function seguinte() {
    const e = validar(passo);
    setErros(e);
    if (e.length === 0) {
      setPasso((p) => p + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function anterior() {
    setErros([]);
    setPasso((p) => Math.max(0, p - 1));
  }

  async function submeter() {
    const todos = [0, 1, 2].flatMap(validar);
    if (todos.length) {
      setErros(todos);
      return;
    }
    setAEnviar(true);
    setErros([]);
    const payload = {
      nome_projecto: nomeProjecto,
      identificacao_projecto: identificacao,
      observacoes,
      contacto,
      divisoes: variantes.map((v) => ({
        tipo: v.tipo,
        designacao: v.designacao,
        quantidade: v.quantidade,
        material: v.material,
        mdf: v.mdf,
        acabamento: v.descritivo.acabamento_ref ?? "",
        requer_desenho: v.requer_desenho,
        descritivo: v.descritivo,
        ficheiros: v.ficheiros,
      })),
    };
    const { data, error } = await supabase().rpc("submeter_pedido", { payload });
    if (error || !data) {
      setAEnviar(false);
      setErros([`Não foi possível enviar o pedido: ${error?.message ?? "erro desconhecido"}`]);
      return;
    }
    const { id, referencia } = data as { id: string; referencia: string };
    // Aviso ao orçamentista chefe (não bloqueia o utilizador se falhar)
    fetch("/api/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {});
    router.push(interno ? `/interno/pedidos/${id}` : `/living/pedido/sucesso?ref=${encodeURIComponent(referencia)}`);
  }

  return (
    <div className="mt-8">
      <ol className="mb-6 flex flex-wrap gap-2">
        {PASSOS.map((nome, i) => (
          <li
            key={nome}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              i === passo ? "bg-marca text-white" : i < passo ? "bg-marca-claro text-marca" : "bg-slate-200 text-slate-500"
            }`}
          >
            {i + 1}. {nome}
          </li>
        ))}
      </ol>

      {erros.length > 0 && (
        <div role="alert" className="mb-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <ul className="list-disc space-y-1 pl-5">
            {[...new Set(erros)].map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {passo === 0 && (
        <section className="cartao space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="nome">Nome do projecto *</label>
              <input id="nome" className="campo" value={nomeProjecto} onChange={(e) => setNomeProjecto(e.target.value)} placeholder="Ex.: Moradia Silva" />
            </div>
            <div>
              <label className="rotulo" htmlFor="ident">Identificação do projecto</label>
              <input id="ident" className="campo" value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} placeholder="Ex.: Obra 24/117, Lote 3" />
            </div>
          </div>
          <div>
            <p className="rotulo">Que divisões pretende orçamentar? * <span className="font-normal text-slate-500">(pode escolher várias)</span></p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {DIVISOES.map((d) => {
                const activo = tiposEscolhidos.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => alternarTipo(d.id)}
                    className={`rounded-lg border-2 px-4 py-4 text-left text-sm font-semibold transition ${
                      activo ? "border-marca bg-marca-claro text-marca" : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                  >
                    {activo ? "✓ " : ""}
                    {d.nome}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              No passo seguinte pode acrescentar várias versões da mesma divisão (ex.: 2 un. da Cozinha A e 3 un. da Cozinha B).
            </p>
          </div>
        </section>
      )}

      {passo === 1 && (
        <section className="space-y-8">
          {DIVISOES.filter((d) => tiposEscolhidos.has(d.id)).map((d) => (
            <div key={d.id}>
              <h2 className="mb-3 text-lg font-semibold">{d.nome}</h2>
              <div className="space-y-4">
                {variantes
                  .filter((v) => v.tipo === d.id)
                  .map((v) => (
                    <CartaoVariante
                      key={v.chave}
                      v={v}
                      podeRemover={variantes.filter((x) => x.tipo === d.id).length > 1}
                      onAlterar={(a) => actualizar(v.chave, a)}
                      onDescritivo={(c, val) => actualizarDescritivo(v.chave, c, val)}
                      onFicheiros={(l) => carregarFicheiros(v.chave, l)}
                      onRemoverFicheiro={(path) =>
                        actualizar(v.chave, { ficheiros: v.ficheiros.filter((f) => f.path !== path) })
                      }
                      onRemover={() => removerVariante(v.chave)}
                    />
                  ))}
              </div>
              <button type="button" className="btn-secundario mt-3" onClick={() => adicionarVariante(d.id)}>
                + Adicionar outra {d.nome.toLowerCase()} diferente
              </button>
            </div>
          ))}
        </section>
      )}

      {passo === 2 && (
        <section className="cartao space-y-4 p-6">
          <p className="text-sm text-slate-600">Precisamos de pelo menos um email ou telefone para lhe enviar o orçamento.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="cnome">Nome *</label>
              <input id="cnome" className="campo" value={contacto.nome} onChange={(e) => setContacto({ ...contacto, nome: e.target.value })} />
            </div>
            <div>
              <label className="rotulo" htmlFor="cemp">Empresa</label>
              <input id="cemp" className="campo" value={contacto.empresa} onChange={(e) => setContacto({ ...contacto, empresa: e.target.value })} />
            </div>
            <div>
              <label className="rotulo" htmlFor="cemail">Email</label>
              <input id="cemail" type="email" className="campo" value={contacto.email} onChange={(e) => setContacto({ ...contacto, email: e.target.value })} />
            </div>
            <div>
              <label className="rotulo" htmlFor="ctel">Telefone</label>
              <input id="ctel" type="tel" className="campo" value={contacto.telefone} onChange={(e) => setContacto({ ...contacto, telefone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="rotulo" htmlFor="obs">Observações gerais</label>
            <textarea id="obs" rows={3} className="campo" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Prazos, local da obra, montagem incluída…" />
          </div>
        </section>
      )}

      {passo === 3 && (
        <section className="cartao space-y-5 p-6 text-sm">
          <div>
            <h2 className="text-base font-semibold">{nomeProjecto}</h2>
            {identificacao && <p className="text-slate-600">{identificacao}</p>}
          </div>
          <table className="w-full text-left">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Divisão</th>
                <th>Qtd.</th>
                <th>Material</th>
                <th>Desenho</th>
                <th>Ficheiros</th>
              </tr>
            </thead>
            <tbody>
              {variantes.map((v) => (
                <tr key={v.chave} className="border-b last:border-0">
                  <td className="py-2 font-medium">{v.designacao}</td>
                  <td>{v.quantidade}</td>
                  <td>
                    {MATERIAIS.find((m) => m.id === v.material)?.nome}
                    {v.mdf && ` · ${MDFS.find((m) => m.id === v.mdf)?.nome}`}
                  </td>
                  <td>{v.requer_desenho ? "Sim" : "Não"}</td>
                  <td>{v.ficheiros.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-slate-700">
            <p className="font-semibold">Contacto</p>
            <p>
              {contacto.nome}
              {contacto.empresa && ` · ${contacto.empresa}`}
            </p>
            <p>{[contacto.email, contacto.telefone].filter(Boolean).join(" · ")}</p>
          </div>
        </section>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button type="button" className="btn-secundario" onClick={anterior} disabled={passo === 0 || aEnviar}>
          ← Anterior
        </button>
        {uploads > 0 && <span className="text-sm text-slate-500">A carregar ficheiros…</span>}
        {passo < PASSOS.length - 1 ? (
          <button type="button" className="btn-primario" onClick={seguinte} disabled={uploads > 0}>
            Seguinte →
          </button>
        ) : (
          <button type="button" className="btn-primario" onClick={submeter} disabled={aEnviar || uploads > 0}>
            {aEnviar ? "A enviar…" : "Enviar pedido"}
          </button>
        )}
      </div>
    </div>
  );
}

function CartaoVariante({
  v,
  podeRemover,
  onAlterar,
  onDescritivo,
  onFicheiros,
  onRemoverFicheiro,
  onRemover,
}: {
  v: VarianteDivisao;
  podeRemover: boolean;
  onAlterar: (a: Partial<VarianteDivisao>) => void;
  onDescritivo: (campo: string, valor: string) => void;
  onFicheiros: (l: FileList | null) => void;
  onRemoverFicheiro: (path: string) => void;
  onRemover: () => void;
}) {
  const campos = [...(DESCRITIVO_POR_TIPO[v.tipo] ?? []), ...DESCRITIVO_COMUM];
  const id = (s: string) => `${v.chave}-${s}`;
  return (
    <div className="cartao space-y-5 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1">
          <label className="rotulo" htmlFor={id("des")}>Designação *</label>
          <input id={id("des")} className="campo" value={v.designacao} onChange={(e) => onAlterar({ designacao: e.target.value })} />
        </div>
        <div className="w-28">
          <label className="rotulo" htmlFor={id("qtd")}>Quantidade *</label>
          <input
            id={id("qtd")}
            type="number"
            min={1}
            className="campo"
            value={v.quantidade}
            onChange={(e) => onAlterar({ quantidade: Math.max(1, parseInt(e.target.value || "1", 10)) })}
          />
        </div>
        {podeRemover && (
          <button type="button" className="text-sm text-rose-700 hover:underline" onClick={onRemover}>
            Remover
          </button>
        )}
      </div>

      <div>
        <p className="rotulo">Material a usar *</p>
        <div className="flex flex-wrap gap-2">
          {MATERIAIS.map((m) => (
            <Opcao key={m.id} activo={v.material === m.id} onClick={() => onAlterar({ material: m.id, mdf: precisaMdf(m.id) ? v.mdf : "" })}>
              {m.nome}
              {m.nota && <span className="ml-1 font-normal opacity-70">({m.nota})</span>}
            </Opcao>
          ))}
        </div>
        {v.material && precisaMdf(v.material) && (
          <div className="mt-3">
            <p className="rotulo">Tipo de MDF *</p>
            <div className="flex flex-wrap gap-2">
              {MDFS.map((m) => (
                <Opcao key={m.id} activo={v.mdf === m.id} onClick={() => onAlterar({ mdf: m.id })}>
                  {m.nome}
                </Opcao>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="rotulo">Pretende desenho técnico? *</p>
        <div className="flex gap-2">
          <Opcao activo={v.requer_desenho === true} onClick={() => onAlterar({ requer_desenho: true })}>Sim</Opcao>
          <Opcao activo={v.requer_desenho === false} onClick={() => onAlterar({ requer_desenho: false })}>Não</Opcao>
        </div>
      </div>

      <div>
        <p className="rotulo">Ficheiros de apoio</p>
        <p className="mb-2 text-xs text-slate-500">
          Plantas, esboços, fotografias, PDF, DWG/DXF, STEP… (máx. 50 MB por ficheiro). Ajudam-nos a desenvolver os desenhos.
        </p>
        <input
          type="file"
          multiple
          aria-label={`Ficheiros de apoio para ${v.designacao}`}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-marca-claro file:px-3 file:py-2 file:font-semibold file:text-marca"
          onChange={(e) => {
            onFicheiros(e.target.files);
            e.target.value = "";
          }}
        />
        {v.ficheiros.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {v.ficheiros.map((f) => (
              <li key={f.path} className="flex items-center justify-between rounded bg-slate-50 px-3 py-1">
                <span className="truncate">📎 {f.nome} <span className="text-slate-400">({(f.tamanho / 1024 / 1024).toFixed(1)} MB)</span></span>
                <button type="button" className="text-xs text-rose-700 hover:underline" onClick={() => onRemoverFicheiro(f.path)}>
                  retirar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="rounded-md border border-slate-200 p-4" open>
        <summary className="cursor-pointer text-sm font-semibold">Descritivo</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {campos.map((c) => (
            <CampoLivre key={c.id} c={c} idBase={v.chave} valor={v.descritivo[c.id] ?? ""} onChange={(val) => onDescritivo(c.id, val)} />
          ))}
        </div>
      </details>
    </div>
  );
}

function Opcao({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
        activo ? "border-marca bg-marca text-white" : "border-slate-300 bg-white hover:border-slate-500"
      }`}
    >
      {children}
    </button>
  );
}

function CampoLivre({ c, idBase, valor, onChange }: { c: CampoDescritivo; idBase: string; valor: string; onChange: (v: string) => void }) {
  const id = `${idBase}-${c.id}`;
  const largo = c.tipo === "textarea";
  return (
    <div className={largo ? "sm:col-span-2" : ""}>
      <label className="rotulo" htmlFor={id}>{c.label}</label>
      {c.tipo === "opcoes" ? (
        <select id={id} className="campo" value={valor} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {c.opcoes!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : c.tipo === "textarea" ? (
        <textarea id={id} rows={2} className="campo" value={valor} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="campo" value={valor} onChange={(e) => onChange(e.target.value)} />
      )}
      {c.ajuda && <p className="mt-1 text-xs text-slate-500">{c.ajuda}</p>}
    </div>
  );
}
