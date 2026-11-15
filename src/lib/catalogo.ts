import { supabase } from "./supabase";
import type { Catalogo } from "./orcamento";

const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/** Lê da base de dados os preços e parâmetros usados no cálculo. */
export async function carregarCatalogo(): Promise<Catalogo> {
  const sb = supabase();
  const [par, grupos, precos, acab, mats, fer, postos] = await Promise.all([
    sb.from("parametros").select("chave,valor"),
    sb.from("grupos_laminado").select("id,codigo"),
    sb.from("precos_grupo_laminado").select("grupo_id,acabamento_id,tipo,espessura_mm,medida,preco_m2"),
    sb.from("acabamentos").select("id,referencia,grupo_id").not("grupo_id", "is", null),
    sb.from("materias_primas").select("categoria,espessura_mm,preco,desconto_pct,ativo").in("categoria", ["mdf", "mdf_hidrofugo", "mdf_ignifugo", "aglomerado"]),
    sb.from("ferragens").select("ref_famo,descricao,preco,unidade,ativo").eq("ativo", true),
    sb.from("postos_trabalho").select("codigo,nome,custo_minuto,ativo"),
  ]);
  const p = Object.fromEntries(((par.data as { chave: string; valor: number }[]) ?? []).map((x) => [x.chave, Number(x.valor)]));
  const grupoCod = Object.fromEntries(((grupos.data as { id: string; codigo: string }[]) ?? []).map((g) => [g.id, g.codigo]));
  const acabRef = Object.fromEntries(((acab.data as { id: string; referencia: string; grupo_id: string }[]) ?? []).map((a) => [a.id, a]));
  const ferragens: Catalogo["ferragens"] = {};
  const genericas: Catalogo["genericas"] = {};
  for (const f of (fer.data as { ref_famo: string | null; descricao: string; preco: number | null; unidade: string }[]) ?? []) {
    const preco = f.preco == null ? null : Number(f.preco);
    if (f.ref_famo) ferragens[f.ref_famo] = { descricao: f.descricao, preco, unidade: f.unidade };
    else genericas[f.descricao] = { descricao: f.descricao, preco };
  }
  return {
    parametros: {
      custo_minuto: p.custo_minuto ?? 0.18,
      desperdicio_pct: p.desperdicio_materia ?? 30,
      orla_preco_ml: p.orla_preco_ml ?? 0.72,
    },
    gruposPreco: ((precos.data as { grupo_id: string; acabamento_id: string | null; tipo: string; espessura_mm: number; medida: string | null; preco_m2: number | null }[]) ?? []).map((x) => ({
      grupo: grupoCod[x.grupo_id],
      acabamento: x.acabamento_id ? acabRef[x.acabamento_id]?.referencia ?? null : null,
      tipo: x.tipo,
      espessura: Number(x.espessura_mm),
      medida: x.medida,
      preco: x.preco_m2 == null ? null : Number(x.preco_m2),
    })),
    acabamentoGrupo: Object.fromEntries(Object.values(acabRef).map((a) => [norm(a.referencia ?? ""), grupoCod[a.grupo_id]])),
    mdf: ((mats.data as { categoria: string; espessura_mm: number; preco: number | null; desconto_pct: number | null; ativo: boolean }[]) ?? [])
      .filter((m) => m.ativo)
      .map((m) => ({ categoria: m.categoria, espessura: Number(m.espessura_mm), preco: m.preco == null ? null : Number(m.preco), desconto: m.desconto_pct == null ? null : Number(m.desconto_pct) })),
    ferragens,
    genericas,
    postos: Object.fromEntries(((postos.data as { codigo: string; nome: string; custo_minuto: number | null }[]) ?? []).map((x) => [x.codigo, { nome: x.nome, custo_minuto: x.custo_minuto == null ? null : Number(x.custo_minuto) }])),
  };
}

export async function listaGrupos(): Promise<string[]> {
  const { data } = await supabase().from("grupos_laminado").select("codigo").eq("ativo", true).order("codigo");
  return ((data as { codigo: string }[]) ?? []).map((g) => g.codigo);
}
