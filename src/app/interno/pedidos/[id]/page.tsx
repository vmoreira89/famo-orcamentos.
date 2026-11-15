"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ESTADOS,
  FORMATO_NUMERO_PROJECTO,
  dataHora,
  type Comentario,
  type Divisao,
  type EstadoPedido,
  type Ficheiro,
  type Membro,
  type Pedido,
  type Permissoes,
} from "@/lib/pedido";
import DialogoMotivo from "@/components/DialogoMotivo";
import { SecaoComentarios, SecaoDados, SecaoDesenhos, SecaoDivisoes, SecaoFicheiros, SecaoHistorico, type Autorizacao } from "./seccoes";

type Dialogo = null | "iniciar" | "estado" | "numero" | "responsavel" | "autorizar";

export default function DetalhePedido() {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [divisoes, setDivisoes] = useState<Divisao[]>([]);
  const [ficheiros, setFicheiros] = useState<Ficheiro[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [autorizacoes, setAutorizacoes] = useState<Autorizacao[]>([]);
  const [equipa, setEquipa] = useState<Membro[]>([]);
  const [perm, setPerm] = useState<Permissoes | null>(null);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState("");
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  // campos dos diálogos
  const [numero, setNumero] = useState("");
  const [novoEstado, setNovoEstado] = useState<EstadoPedido>("aberto");
  const [responsavel, setResponsavel] = useState("");
  const [autUtilizador, setAutUtilizador] = useState("");
  const [autHoras, setAutHoras] = useState(48);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [p, d, f, c, a, e, pm] = await Promise.all([
      sb.from("pedidos").select("*").eq("id", id).single(),
      sb.from("pedido_divisoes").select("*").eq("pedido_id", id).order("ordem"),
      sb.from("pedido_ficheiros").select("*").eq("pedido_id", id).order("created_at"),
      sb.from("comentarios").select("*").eq("pedido_id", id).order("created_at"),
      sb.from("autorizacoes").select("*").eq("pedido_id", id).order("created_at", { ascending: false }),
      sb.rpc("equipa"),
      sb.rpc("minhas_permissoes", { p_id: id }),
    ]);
    if (p.error) {
      setErro("Pedido não encontrado ou sem acesso.");
      return;
    }
    setPedido(p.data as Pedido);
    setDivisoes((d.data as Divisao[]) ?? []);
    setFicheiros((f.data as Ficheiro[]) ?? []);
    setComentarios((c.data as Comentario[]) ?? []);
    setAutorizacoes((a.data as Autorizacao[]) ?? []);
    setEquipa((e.data as Membro[]) ?? []);
    setPerm(pm.data as Permissoes);
    setVersao((v) => v + 1);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const rpc = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      const { error } = await supabase().rpc(fn, args);
      if (error) return error.message;
      await carregar();
      return null;
    },
    [carregar],
  );

  if (erro) return <p className="p-10 text-center text-slate-500">{erro}</p>;
  if (!pedido || !perm) return <p className="p-10 text-center text-slate-500">A carregar…</p>;

  const nomeDe = (uid: string | null) => (uid ? equipa.find((m) => m.id === uid)?.nome ?? "—" : "—");
  const orcamentistas = equipa.filter((m) => m.ativo && m.nivel !== "colaborador");
  const eOrc = perm.nivel === "admin" || perm.nivel === "orcamentista_chefe" || perm.nivel === "orcamentista";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/interno" className="text-sm text-slate-500 hover:underline">← Orçamentos</Link>

      {/* Cabeçalho */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{pedido.nome_projecto}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ESTADOS[pedido.estado].cor}`}>
              {ESTADOS[pedido.estado].nome}
            </span>
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <div><dt className="inline">Referência: </dt><dd className="inline font-mono font-semibold">{pedido.referencia}</dd></div>
            <div><dt className="inline">Nº projecto: </dt><dd className="inline font-mono font-semibold">{pedido.numero_projecto ?? "por atribuir"}</dd></div>
            <div><dt className="inline">Responsável: </dt><dd className="inline">{nomeDe(pedido.responsavel)}</dd></div>
            <div><dt className="inline">Criado: </dt><dd className="inline">{dataHora(pedido.created_at)} · {pedido.origem === "interno" ? `interno (${nomeDe(pedido.criado_por)})` : "pedido de cliente"}</dd></div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-2">
          {pedido.numero_projecto && (
            <Link href={`/interno/pedidos/${pedido.id}/orcamento`} className="btn-primario">
              Orçamento
            </Link>
          )}
          {pedido.estado === "novo" && eOrc && (
            <button className="btn-primario" onClick={() => { setNumero(""); setDialogo("iniciar"); }}>
              Iniciar orçamento
            </button>
          )}
          {pedido.estado !== "novo" && perm.pode_editar && (
            <button className="btn-secundario" onClick={() => { setNovoEstado(pedido.estado === "aberto" ? "pendente" : "aberto"); setDialogo("estado"); }}>
              Mudar estado
            </button>
          )}
          {perm.pode_gerir && pedido.numero_projecto && (
            <button className="btn-secundario" onClick={() => { setNumero(pedido.numero_projecto ?? ""); setDialogo("numero"); }}>
              Alterar nº projecto
            </button>
          )}
          {perm.pode_gerir && (
            <button className="btn-secundario" onClick={() => { setResponsavel(pedido.responsavel ?? ""); setDialogo("responsavel"); }}>
              Responsável
            </button>
          )}
          {perm.pode_gerir && pedido.estado === "terminado" && (
            <button className="btn-secundario" onClick={() => { setAutUtilizador(""); setDialogo("autorizar"); }}>
              Autorizar edição
            </button>
          )}
        </div>
      </div>

      {/* Avisos de permissão */}
      {pedido.estado === "terminado" && !perm.pode_editar && (
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          Orçamento terminado: só consulta. Para alterar, peça autorização ao orçamentista chefe ou à administração.
        </p>
      )}
      {perm.autorizacao_ate && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Tem autorização para editar este orçamento até {dataHora(perm.autorizacao_ate)}.
        </p>
      )}
      {perm.nivel === "colaborador" && (
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          Como colaborador pode consultar e deixar comentários para o orçamentista.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SecaoDados key={`d${versao}`} pedido={pedido} podeEditar={perm.pode_editar} rpc={rpc} />
          <SecaoDivisoes key={`v${versao}`} pedidoId={pedido.id} divisoes={divisoes} podeEditar={perm.pode_editar} rpc={rpc} />
          <SecaoFicheiros pedidoId={pedido.id} ficheiros={ficheiros} divisoes={divisoes} podeEditar={perm.pode_editar} rpc={rpc} />
          <SecaoDesenhos key={`g${versao}`} pedidoId={pedido.id} nomeDe={nomeDe} />
        </div>
        <div className="space-y-6">
          <SecaoComentarios
            pedidoId={pedido.id}
            comentarios={comentarios}
            nomeDe={nomeDe}
            podeResolver={eOrc}
            onAlterado={carregar}
          />
          {autorizacoes.length > 0 && (
            <section className="cartao p-5">
              <h2 className="font-semibold">Autorizações de edição</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {autorizacoes.map((a) => {
                  const activa = !a.revogada_em && new Date(a.valida_ate) > new Date();
                  return (
                    <li key={a.id} className="rounded bg-slate-50 p-2">
                      <p><strong>{nomeDe(a.utilizador)}</strong> · por {nomeDe(a.concedida_por)}</p>
                      <p className="text-slate-600">{a.motivo}</p>
                      <p className="text-xs text-slate-500">
                        {activa ? `Válida até ${dataHora(a.valida_ate)}` : a.revogada_em ? "Revogada" : "Expirada"}
                        {activa && perm.pode_gerir && (
                          <button
                            className="ml-2 text-rose-700 hover:underline"
                            onClick={async () => {
                              const m = window.prompt("Motivo para revogar a autorização:");
                              if (m) {
                                const e = await rpc("revogar_autorizacao", { p_id: a.id, p_motivo: m });
                                if (e) alert(e);
                              }
                            }}
                          >
                            revogar
                          </button>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <SecaoHistorico key={`h${versao}`} pedidoId={pedido.id} />
        </div>
      </div>

      {/* Diálogos */}
      <DialogoMotivo
        aberto={dialogo === "iniciar"}
        titulo="Iniciar orçamento"
        descricao="Atribua o nº de projecto. Este número entra nos códigos de todas as peças e conjuntos (ex.: COZY100000.01)."
        motivoPadrao="Início do orçamento"
        textoConfirmar="Iniciar"
        podeConfirmar={FORMATO_NUMERO_PROJECTO.test(numero.trim())}
        onFechar={() => setDialogo(null)}
        onConfirmar={(m) => rpc("iniciar_orcamento", { p_id: pedido.id, p_numero: numero.trim(), p_motivo: m })}
      >
        <CampoNumero valor={numero} onChange={setNumero} />
      </DialogoMotivo>

      <DialogoMotivo
        aberto={dialogo === "numero"}
        titulo="Alterar nº de projecto"
        descricao="Atenção: os códigos de desenhos já gerados com o número antigo terão de ser actualizados."
        podeConfirmar={FORMATO_NUMERO_PROJECTO.test(numero.trim())}
        onFechar={() => setDialogo(null)}
        onConfirmar={(m) => rpc("alterar_numero_projecto", { p_id: pedido.id, p_numero: numero.trim(), p_motivo: m })}
      >
        <CampoNumero valor={numero} onChange={setNumero} />
      </DialogoMotivo>

      <DialogoMotivo
        aberto={dialogo === "estado"}
        titulo="Mudar estado"
        onFechar={() => setDialogo(null)}
        onConfirmar={(m) => rpc("alterar_estado", { p_id: pedido.id, p_estado: novoEstado, p_motivo: m })}
      >
        <div className="grid grid-cols-2 gap-2">
          {(["aberto", "pendente", "terminado"] as EstadoPedido[]).map((e) => (
            <button
              key={e}
              type="button"
              disabled={e === pedido.estado}
              onClick={() => setNovoEstado(e)}
              className={`rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-40 ${
                novoEstado === e ? "border-marca bg-marca text-white" : "border-slate-300 bg-white"
              }`}
            >
              {ESTADOS[e].nome}
            </button>
          ))}
        </div>
        {novoEstado === "pendente" && (
          <p className="text-xs text-slate-500">Use pendente quando está à espera de informação do cliente ou de preços de fornecedores.</p>
        )}
      </DialogoMotivo>

      <DialogoMotivo
        aberto={dialogo === "responsavel"}
        titulo="Orçamentista responsável"
        podeConfirmar={!!responsavel}
        onFechar={() => setDialogo(null)}
        onConfirmar={(m) => rpc("atribuir_responsavel", { p_id: pedido.id, p_utilizador: responsavel, p_motivo: m })}
      >
        <select className="campo" aria-label="Responsável" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
          <option value="">— escolher —</option>
          {orcamentistas.map((m) => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
        </select>
      </DialogoMotivo>

      <DialogoMotivo
        aberto={dialogo === "autorizar"}
        titulo="Autorizar edição de orçamento terminado"
        descricao="O orçamentista escolhido poderá alterar este orçamento durante o período indicado."
        podeConfirmar={!!autUtilizador}
        onFechar={() => setDialogo(null)}
        onConfirmar={(m) =>
          rpc("conceder_autorizacao", { p_pedido: pedido.id, p_utilizador: autUtilizador, p_horas: autHoras, p_motivo: m })
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="campo" aria-label="Orçamentista" value={autUtilizador} onChange={(e) => setAutUtilizador(e.target.value)}>
            <option value="">— orçamentista —</option>
            {equipa.filter((m) => m.ativo && m.nivel === "orcamentista").map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
          <select className="campo" aria-label="Duração" value={autHoras} onChange={(e) => setAutHoras(Number(e.target.value))}>
            <option value={4}>4 horas</option>
            <option value={24}>1 dia</option>
            <option value={48}>2 dias</option>
            <option value={168}>1 semana</option>
          </select>
        </div>
        {equipa.filter((m) => m.ativo && m.nivel === "orcamentista").length === 0 && (
          <p className="text-xs text-slate-500">Ainda não há orçamentistas activos.</p>
        )}
      </DialogoMotivo>
    </div>
  );
}

function CampoNumero({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const valido = FORMATO_NUMERO_PROJECTO.test(valor.trim());
  return (
    <div>
      <label className="rotulo" htmlFor="num-projecto">Nº de projecto *</label>
      <input
        id="num-projecto"
        className="campo font-mono"
        placeholder="100000.01"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      />
      <p className={`mt-1 text-xs ${valor && !valido ? "text-rose-700" : "text-slate-500"}`}>
        Formato: número + ponto + 2 dígitos (ex.: 100000.01).
      </p>
    </div>
  );
}
