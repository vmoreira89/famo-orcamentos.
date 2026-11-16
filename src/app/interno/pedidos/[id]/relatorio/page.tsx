"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { nomeDivisao, nomeMaterial, nomeMateriais, type Divisao, type Pedido, type Permissoes } from "@/lib/pedido";
import { calcularTotais, codigoProduto, custoOperacao, custoPeca, euro, nPecasMovel, type DadosOrcamento, type Parametros } from "@/lib/orcamento";

type Orc = { versao: number; dados: DadosOrcamento; parametros: Parametros; margem_pct: number; calculado_em: string; pendentes: number };

export default function PaginaRelatorio() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate-500">A preparar…</p>}>
      <Relatorio />
    </Suspense>
  );
}

function Relatorio() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const tipo = sp.get("tipo") === "detalhado" ? "detalhado" : "simples";
  const formato = sp.get("formato") === "excel" ? "excel" : "pdf";
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [divisoes, setDivisoes] = useState<Divisao[]>([]);
  const [orc, setOrc] = useState<Orc | null>(null);
  const [perm, setPerm] = useState<Permissoes | null>(null);
  const [estado, setEstado] = useState("");

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [p, d, o, pm] = await Promise.all([
        sb.from("pedidos").select("*").eq("id", id).single(),
        sb.from("pedido_divisoes").select("*").eq("pedido_id", id).order("ordem"),
        sb.from("orcamentos").select("versao,dados,parametros,margem_pct,calculado_em,pendentes").eq("pedido_id", id).maybeSingle(),
        sb.rpc("minhas_permissoes", { p_id: id }),
      ]);
      setPedido(p.data as Pedido);
      setDivisoes((d.data as Divisao[]) ?? []);
      setOrc(o.data as Orc);
      setPerm(pm.data as Permissoes);
    })();
  }, [id]);

  const totais = useMemo(
    () => (orc ? calcularTotais(orc.dados, divisoes, orc.parametros, Number(orc.margem_pct)) : null),
    [orc, divisoes],
  );

  useEffect(() => {
    if (!pedido || !orc || !totais || !perm?.pode_gerir) return;
    if (formato === "excel") {
      setEstado("A gerar o ficheiro Excel…");
      gerarExcel(tipo, pedido, divisoes, orc, totais)
        .then(() => setEstado("Ficheiro Excel descarregado."))
        .catch((e) => setEstado(`Erro ao gerar Excel: ${e.message}`));
    } else {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [pedido, orc, totais, perm, formato, tipo, divisoes]);

  if (!pedido || !perm) return <p className="p-10 text-center text-slate-500">A carregar…</p>;
  if (!perm.pode_gerir)
    return <p className="p-10 text-center text-slate-500">Os relatórios são gerados pelo orçamentista chefe ou pela administração.</p>;
  if (!orc || !totais) return <p className="p-10 text-center text-slate-500">Este pedido ainda não tem orçamento guardado.</p>;

  const m = Number(orc.margem_pct);
  const comMargem = (v: number) => v * (1 + m / 100);

  return (
    <div className="mx-auto max-w-5xl bg-white px-6 py-6 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link href={`/interno/pedidos/${id}/orcamento`} className="text-sm text-slate-500 hover:underline">← Voltar ao orçamento</Link>
        {formato === "pdf" ? (
          <button className="btn-primario" onClick={() => window.print()}>Imprimir / guardar PDF</button>
        ) : (
          <span className="text-sm text-slate-600">{estado}</span>
        )}
      </div>
      {formato === "pdf" && (
        <p className="mb-4 text-xs text-slate-500 print:hidden">Na janela de impressão escolha «Guardar como PDF».</p>
      )}

      <header className="flex items-start justify-between border-b-2 border-marca pb-3">
        <div>
          <span className="rounded bg-marca px-2 py-1 text-sm font-bold tracking-widest text-white">FAMO</span>
          <h1 className="mt-3 text-xl font-bold">{tipo === "simples" ? "Orçamento" : "Orçamento detalhado (uso interno)"}</h1>
        </div>
        <div className="text-right text-sm">
          <p>Projecto nº <strong className="font-mono">{pedido.numero_projecto}</strong></p>
          <p>Ref. pedido {pedido.referencia}</p>
          <p>Data {new Date().toLocaleDateString("pt-PT")}</p>
          {orc.pendentes > 0 && <p className="font-semibold text-amber-700">Atenção: {orc.pendentes} linha(s) sem preço</p>}
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs uppercase text-slate-500">Cliente</p>
          <p className="font-semibold">{pedido.contacto_nome}{pedido.contacto_empresa ? ` · ${pedido.contacto_empresa}` : ""}</p>
          <p>{[pedido.contacto_email, pedido.contacto_telefone].filter(Boolean).join(" · ")}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Projecto</p>
          <p className="font-semibold">{pedido.nome_projecto}</p>
          {pedido.identificacao_projecto && <p>{pedido.identificacao_projecto}</p>}
        </div>
      </section>

      {divisoes.map((d) => {
        const moveis = orc.dados.moveis.filter((x) => x.divisao_id === d.id);
        const td = totais.porDivisao[d.id];
        return (
          <section key={d.id} className="mt-6 break-inside-avoid-page">
            <h2 className="border-b border-slate-300 pb-1 font-semibold">
              {d.designacao} · {nomeDivisao(d.tipo)} <span className="font-mono text-xs font-normal text-slate-500">{codigoProduto(pedido.numero_projecto, d)}</span>
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {nomeMateriais(d)}{d.descritivo?.acabamento_ref ? ` · ${d.descritivo.acabamento_ref}` : ""} · quantidade: {d.quantidade}
            </p>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1">Código</th><th>Móvel</th><th>Dimensões (L×P×A)</th><th className="text-right">Qtd</th>
                  {tipo === "detalhado" && <th className="text-right">Custo un.</th>}
                  <th className="text-right">Preço un.</th><th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const t = orc.dados.tampos?.[d.id];
                  const ct = totais.porTampo?.[d.id];
                  if (!t?.incluir || !ct) return null;
                  return (
                    <tr className="border-b">
                      <td className="py-1 font-mono text-xs">{t.codigo}</td>
                      <td>Tampo de bancada {t.material} {t.acabamento}{t.terceiros ? " (por terceiros)" : ""}</td>
                      <td>{ct.comprimento}×{t.profundidade}×{t.espessura}</td>
                      <td className="text-right">1</td>
                      {tipo === "detalhado" && <td className="text-right tabular-nums">{euro(ct.total)}</td>}
                      <td className="text-right tabular-nums">{t.terceiros ? "—" : euro(comMargem(ct.total))}</td>
                      <td className="text-right tabular-nums">{t.terceiros ? "—" : euro(comMargem(ct.total))}</td>
                    </tr>
                  );
                })()}
                {moveis.map((mv) => {
                  const c = totais.porMovel[mv.id];
                  return (
                    <tr key={mv.id} className="border-b last:border-0">
                      <td className="py-1 font-mono text-xs">{mv.codigo}</td>
                      <td>{mv.designacao}</td>
                      <td>{mv.L}×{mv.P}×{mv.A}</td>
                      <td className="text-right">{mv.qtd}</td>
                      {tipo === "detalhado" && <td className="text-right tabular-nums">{euro(c.total)}</td>}
                      <td className="text-right tabular-nums">{euro(comMargem(c.total))}</td>
                      <td className="text-right tabular-nums">{euro(comMargem(c.total) * mv.qtd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-right text-sm">
              Por unidade: <strong>{euro(td.preco)}</strong>
              {d.quantidade > 1 && <> · {d.quantidade} un.: <strong>{euro(td.preco * d.quantidade)}</strong></>}
            </p>

            {tipo === "detalhado" &&
              moveis.map((mv) => {
                const c = totais.porMovel[mv.id];
                return (
                  <div key={mv.id} className="mt-3 rounded border border-slate-200 p-3 text-xs break-inside-avoid">
                    <p className="font-semibold">{mv.codigo} · {mv.designacao}</p>
                    <p className="text-slate-600">
                      Corpo: {nomeMaterial(mv.corpo.material)} {mv.corpo.acabamento} · Frentes: {nomeMaterial(mv.frente.material)} {mv.frente.acabamento}
                    </p>
                    <table className="mt-1 w-full">
                      <thead className="text-slate-500"><tr><th className="text-left">Peça</th><th className="text-left">Código</th><th>Qtd</th><th>Medidas</th><th className="text-right">€/m²</th><th className="text-right">Custo</th></tr></thead>
                      <tbody>
                        {mv.pecas.map((p) => {
                          const cp = custoPeca(p);
                          return (
                            <tr key={p.id}>
                              <td>{p.designacao}{p.nota ? ` (${p.nota})` : ""}</td><td className="font-mono">{p.codigo}</td><td className="text-center">{p.qtd}</td>
                              <td className="text-center">{p.c}×{p.l}×{p.e}</td><td className="text-right">{p.preco_m2 ?? "—"}</td><td className="text-right">{euro(cp.material + cp.orla)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <table className="mt-1 w-full">
                      <thead className="text-slate-500"><tr><th className="text-left">Ferragem</th><th className="text-left">Ref.</th><th>Qtd</th><th className="text-right">Preço</th><th className="text-right">Total</th></tr></thead>
                      <tbody>
                        {mv.ferragens.map((f) => (
                          <tr key={f.id}><td>{f.descricao}</td><td className="font-mono">{f.ref_famo ?? ""}</td><td className="text-center">{f.qtd}</td><td className="text-right">{f.preco ?? "—"}</td><td className="text-right">{f.preco == null ? "—" : euro(f.qtd * f.preco)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-1">
                      Operações: {mv.operacoes.map((o) => `${o.descricao} ${o.por_peca ? `${nPecasMovel(mv)} pç × ${o.minutos} min` : `${o.minutos} min`}`).join(" · ")}
                      {mv.extras.length > 0 && <> · Extras: {mv.extras.map((x) => `${x.descricao} ${euro(x.valor)}`).join(" · ")}</>}
                    </p>
                    <p className="mt-1 font-medium">
                      Material {euro(c.material)} · orla {euro(c.orla)} · desperdício {euro(c.desperdicio)} · ferragens {euro(c.ferragens)} · mão de obra {euro(c.mao_obra)} · extras {euro(c.extras)} = <strong>{euro(c.total)}</strong>
                    </p>
                  </div>
                );
              })}
          </section>
        );
      })}

      {orc.dados.extras_gerais.length > 0 && (
        <section className="mt-6 text-sm">
          <h2 className="border-b border-slate-300 pb-1 font-semibold">Outros serviços</h2>
          {orc.dados.extras_gerais.map((x) => (
            <p key={x.id} className="flex justify-between"><span>{x.descricao}</span><span className="tabular-nums">{euro(x.valor == null ? null : comMargem(x.valor))}</span></p>
          ))}
        </section>
      )}

      <section className="mt-6 border-t-2 border-marca pt-3 text-right">
        {tipo === "detalhado" && (
          <p className="text-sm">
            Custo total {euro(totais.custo)} · margem {m}% · custo/min {euro(orc.parametros.custo_minuto)} · desperdício {orc.parametros.desperdicio_pct}%
          </p>
        )}
        <p className="text-lg">Total: <strong>{euro(totais.preco)}</strong> <span className="text-sm text-slate-500">(valores sem IVA)</span></p>
        <p className="mt-1 text-xs text-slate-500">Versão {orc.versao} do orçamento, calculada a {new Date(orc.calculado_em).toLocaleString("pt-PT")}.</p>
      </section>
    </div>
  );
}

async function gerarExcel(
  tipo: string,
  pedido: Pedido,
  divisoes: Divisao[],
  orc: Orc,
  totais: NonNullable<ReturnType<typeof calcularTotais>>,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "FAMO Orçamentação";
  const m = Number(orc.margem_pct);
  const cm = (v: number) => Math.round(v * (1 + m / 100) * 100) / 100;
  const euroFmt = '#,##0.00 "€"';

  const ws = wb.addWorksheet("Resumo");
  ws.addRow([tipo === "simples" ? "Orçamento" : "Orçamento detalhado (uso interno)"]).font = { bold: true, size: 14 };
  ws.addRow(["Projecto nº", pedido.numero_projecto, "Ref. pedido", pedido.referencia]);
  ws.addRow(["Projecto", pedido.nome_projecto, "Cliente", pedido.contacto_nome]);
  ws.addRow([]);
  const cab = ["Produto", "Divisão", "Código móvel", "Móvel", "L", "P", "A", "Qtd", ...(tipo === "detalhado" ? ["Custo un."] : []), "Preço un.", "Total"];
  ws.addRow(cab).font = { bold: true };
  for (const d of divisoes) {
    for (const mv of orc.dados.moveis.filter((x) => x.divisao_id === d.id)) {
      const c = totais.porMovel[mv.id];
      ws.addRow([codigoProduto(pedido.numero_projecto, d), d.designacao, mv.codigo, mv.designacao, mv.L, mv.P, mv.A, mv.qtd, ...(tipo === "detalhado" ? [c.total] : []), cm(c.total), cm(c.total) * mv.qtd]);
    }
    const t = orc.dados.tampos?.[d.id];
    const ct = totais.porTampo?.[d.id];
    if (t?.incluir && ct) ws.addRow([codigoProduto(pedido.numero_projecto, d), d.designacao, t.codigo, `Tampo de bancada ${t.material} ${t.acabamento}${t.terceiros ? " (terceiros)" : ""}`, ct.comprimento, t.profundidade, t.espessura, 1, ...(tipo === "detalhado" ? [ct.total] : []), cm(ct.total), cm(ct.total)]);
    const td = totais.porDivisao[d.id];
    ws.addRow(["", `${d.designacao} — por unidade`, "", "", "", "", "", d.quantidade, ...(tipo === "detalhado" ? [td.custo] : []), td.preco, td.preco * d.quantidade]).font = { bold: true };
  }
  for (const x of orc.dados.extras_gerais) ws.addRow(["", "Outros serviços", "", x.descricao, "", "", "", 1, ...(tipo === "detalhado" ? [x.valor ?? 0] : []), cm(x.valor ?? 0), cm(x.valor ?? 0)]);
  ws.addRow([]);
  if (tipo === "detalhado") ws.addRow(["Custo total", totais.custo, "Margem %", m]);
  ws.addRow(["Total (s/ IVA)", totais.preco]).font = { bold: true };
  ws.columns.forEach((c) => { c.width = 16; c.numFmt = euroFmt; });
  ["E", "F", "G", "H"].forEach((l) => (ws.getColumn(l).numFmt = "0"));

  if (tipo === "detalhado") {
    const wp = wb.addWorksheet("Peças");
    wp.addRow(["Móvel", "Código peça", "Sub-conjunto", "Designação", "Qtd", "Comp.", "Larg.", "Esp.", "Superfície", "€/m²", "Folha/laca €/m²", "Orla €/ml", "Custo", "Nota"]).font = { bold: true };
    const wf = wb.addWorksheet("Ferragens");
    wf.addRow(["Móvel", "Ref. FAMO", "Descrição", "Qtd", "Preço un.", "Total"]).font = { bold: true };
    const wo = wb.addWorksheet("Operações");
    wo.addRow(["Móvel", "Posto", "Descrição", "Nº peças", "Minutos (por peça)", "€/min", "Total"]).font = { bold: true };
    for (const mv of orc.dados.moveis) {
      for (const p of mv.pecas) {
        const c = custoPeca(p);
        wp.addRow([mv.codigo, p.codigo, p.codigo_sub ?? p.subconjunto, p.designacao, p.qtd, p.c, p.l, p.e, p.sup, p.preco_m2, p.preco_extra_m2, p.preco_orla_ml, Math.round((c.material + c.orla) * 100) / 100, p.nota]);
      }
      for (const f of mv.ferragens) wf.addRow([mv.codigo, f.ref_famo, f.descricao, f.qtd, f.preco, f.preco == null ? null : f.qtd * f.preco]);
      for (const o of mv.operacoes) wo.addRow([mv.codigo, o.posto, o.descricao, o.por_peca ? nPecasMovel(mv) : null, o.minutos, o.custo_minuto ?? orc.parametros.custo_minuto, Math.round(custoOperacao(o, nPecasMovel(mv), orc.parametros.custo_minuto) * 100) / 100]);
    }
    [wp, wf, wo].forEach((w) => w.columns.forEach((c) => (c.width = 16)));
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Orcamento_${pedido.numero_projecto}_${tipo}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
