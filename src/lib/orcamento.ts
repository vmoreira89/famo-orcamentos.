/**
 * Motor de orçamentação: gera móveis a partir do pedido, decompõe cada móvel
 * em peças, ferragens e operações, atribui códigos e calcula custos.
 *
 * Os preços usados ficam guardados em cada linha (instantâneo). Alterar
 * preços ou parâmetros na base de dados não mexe num orçamento já guardado;
 * só "Actualizar preços" (quando o orçamento ainda é editável) os volta a ler.
 */
import type { Divisao, Material, Mdf, TipoDivisao } from "./pedido";
import { materiaisDe } from "./pedido";

/* ------------------------------------------------------------------ tipos */

export type TipoMovel = "inferior" | "superior" | "coluna" | "gaveteiro" | "roupeiro" | "estante" | "wc" | "outro" | "tampo";

export const TIPOS_MOVEL: Record<TipoMovel, { nome: string; ref: string; L: number; A: number; P: number; pes: boolean }> = {
  inferior: { nome: "Móvel inferior", ref: "INF", L: 600, A: 720, P: 560, pes: true },
  superior: { nome: "Móvel superior", ref: "SUP", L: 600, A: 720, P: 320, pes: false },
  coluna: { nome: "Coluna", ref: "COL", L: 600, A: 2100, P: 560, pes: true },
  gaveteiro: { nome: "Gaveteiro", ref: "GAV", L: 600, A: 720, P: 560, pes: true },
  roupeiro: { nome: "Roupeiro", ref: "ROU", L: 1000, A: 2400, P: 600, pes: true },
  estante: { nome: "Estante / aberto", ref: "EST", L: 800, A: 1800, P: 350, pes: false },
  wc: { nome: "Móvel WC", ref: "WC", L: 800, A: 500, P: 450, pes: false },
  outro: { nome: "Outro", ref: "MOV", L: 600, A: 720, P: 500, pes: false },
  tampo: { nome: "Tampo de bancada", ref: "TB", L: 2400, A: 25, P: 600, pes: false },
};

/** Como se obtém o preço de uma superfície (corpo ou frentes). */
export type EspecMaterial = {
  material: Material; // laminado | madeira | folheado | lacado
  mdf: Mdf | "";
  acabamento: string; // referência do decor / folha / cor
  grupo: string; // grupo de laminado (código), quando laminado
  extra_m2: number | null; // folheado: folha €/m²; lacado: lacagem €/m²; madeira: €/m² (manual)
  orlar?: boolean; // madeira/folheado: se leva orla (por defeito não); laminado leva sempre; lacado nunca
  // frentes (portas e gavetas): acabamento igual nas duas faces ou diferente; se diferente, os campos acima são a face de fora
  faces?: "iguais" | "diferentes";
  dentro?: FaceDentro;
};

/** Acabamento da face de dentro das portas/gavetas, quando é diferente da de fora. */
export type FaceDentro = { material: Exclude<Material, "madeira">; acabamento: string; extra_m2: number | null };

/** Descrição curta de uma face (para notas e desenhos). */
const descFace = (material: Material, acabamento: string) => `${material}${acabamento ? ` ${acabamento}` : ""}`;

/**
 * Preço das frentes. Faces iguais: como sempre (placa + folha/laca nas 2 faces).
 * Faces diferentes: só laminados → placa bi-decor (fica o preço mais alto das duas referências);
 * caso contrário placa de MDF + custo de cada face ao €/m² indicado (folha, laca ou laminado aplicado).
 */
export function precoFrente(cat: Catalogo, esp: EspecMaterial, e: number, escalao: Escalao = "placa") {
  if (esp.faces !== "diferentes" || !esp.dentro) {
    const p = precoPlaca(cat, esp, e, escalao);
    return { m2: p.m2, extra: p.extra, faces: esp.material === "folheado" || esp.material === "lacado" ? 2 : 0, dentro: null as number | null, faceDentro: false, nota: p.nota };
  }
  const de = esp.dentro;
  const nota = `Fora: ${descFace(esp.material, esp.acabamento)} · Dentro: ${descFace(de.material, de.acabamento)}`;
  if (esp.material === "laminado" && de.material === "laminado") {
    const a = precoPlaca(cat, esp, e, escalao).m2, b = precoPlaca(cat, { ...esp, acabamento: de.acabamento }, e, escalao).m2;
    return { m2: a == null || b == null ? null : Math.max(a, b), extra: null, faces: 0, dentro: null, faceDentro: false, nota: `Placa bi-decor. ${nota}` };
  }
  const mdf = precoPlaca(cat, { material: "lacado", mdf: esp.mdf || "normal", acabamento: "", grupo: "", extra_m2: null }, e).m2;
  // cada face: folha / laca / laminado aplicado, ao €/m² indicado (vazio = a preencher)
  return { m2: mdf, extra: esp.extra_m2, faces: 1, dentro: de.extra_m2, faceDentro: true, nota: `MDF ${esp.mdf || "normal"}. ${nota}` };
}

/** Portas sobrepostas (lockers, colunas estreitas) ou lado a lado; sem resposta, deduz pela largura. */
export function disposicaoPortas(m: Pick<Movel, "portas" | "L" | "portas_disposicao">): "lado" | "sobrepostas" {
  if (m.portas_disposicao) return m.portas_disposicao;
  return m.portas > 1 && (m.L - 3 * (m.portas + 1)) / m.portas < 250 ? "sobrepostas" : "lado";
}
/** Acabamento de uma porta (nº 1 = de cima, ou da esquerda se lado a lado). */
export function especPorta(m: Movel, n: number): EspecMaterial {
  return (m.portas_diferentes && m.portas_acab?.[String(n)]) || m.frente;
}
/** Acabamento que se aplica a uma peça (porta com acabamento próprio, frentes ou corpo). */
export function especDaPeca(m: Movel, p: Pick<Peca, "sup" | "porta">): EspecMaterial {
  if (p.porta) return especPorta(m, p.porta);
  return p.sup === "frente" ? m.frente : m.corpo;
}

/** Laminado: orla em todo o perímetro. Lacado: sem orla. Madeira/folheado: só se pedido. */
export function levaOrla(esp: EspecMaterial) {
  if (esp.material === "laminado") return true;
  if (esp.material === "lacado") return false;
  return !!esp.orlar;
}
const ORLA_TODA: [boolean, boolean, boolean, boolean] = [true, true, true, true];
const SEM_ORLA: [boolean, boolean, boolean, boolean] = [false, false, false, false];
export function orlasPara(esp: EspecMaterial) {
  return levaOrla(esp) ? { orlas: [...ORLA_TODA] as typeof ORLA_TODA, oc: 2, ol: 2 } : { orlas: [...SEM_ORLA] as typeof SEM_ORLA, oc: 0, ol: 0 };
}

/** Volta a aplicar a regra das orlas às peças do móvel (depois de mudar o material). */
export function aplicarOrlas(m: Movel, cat?: Catalogo): Movel {
  return {
    ...m,
    pecas: m.pecas.map((p) => {
      if (p.sup === "manual") return p;
      const esp = especDaPeca(m, p);
      const o = orlasPara(esp);
      return { ...p, ...o, preco_orla_ml: o.oc ? (cat ? precoOrla(cat, esp) : p.preco_orla_ml ?? null) : p.preco_orla_ml };
    }),
  };
}

export type Peca = {
  id: string;
  designacao: string;
  qtd: number;
  c: number; // comprimento mm
  l: number; // largura mm
  e: number; // espessura mm
  sup: "corpo" | "frente" | "costa" | "manual";
  oc: number; // nº de orlas no comprimento (0-2)
  ol: number; // nº de orlas na largura (0-2)
  orlas?: [boolean, boolean, boolean, boolean]; // arestas com orla: comprimento frente, comprimento trás, largura esq., largura dir.
  subconjunto: string; // "" ou identificador de pré-montagem (ex.: "Gaveta 1")
  preco_m2: number | null; // placa/MDF
  preco_extra_m2: number | null; // folha ou lacagem (por face)
  faces_extra: number; // 0, 1 ou 2 faces com folha/laca
  face_dentro?: boolean; // faces diferentes: a face de dentro tem custo próprio
  preco_dentro_m2?: number | null; // €/m² da face de dentro (folha, laca ou laminado aplicado)
  preco_orla_ml: number | null;
  nota: string; // ex.: folha de madeira a usar
  porta?: number; // porta com acabamento próprio (nº de cima para baixo / da esquerda para a direita)
  codigo?: string;
  codigo_sub?: string;
};

export type LinhaFerragem = { id: string; ref_famo: string | null; descricao: string; qtd: number; preco: number | null; unidade?: string; subconjunto?: string };

/** Sub-conjunto do corpo do móvel (13.4): ilhargas, fundo, cúpula/travessas, costa e divisórias. */
export const SUB_CORPO = "Corpo";

/** Comprimento da corrediça: o maior standard que cabe na profundidade útil. */
export function comprimentoCorredica(P: number, costa: number) {
  const util = P - costa - 10;
  return [600, 550, 500, 450, 400, 350, 300, 250].find((c) => c <= util) ?? 250;
}
/** por_peca: os minutos são por peça e multiplicam pelo nº de peças do móvel (orçamentos antigos: minutos totais). */
export type LinhaOperacao = { id: string; posto: string; descricao: string; minutos: number; custo_minuto: number | null; por_peca?: boolean };

/** Nº de peças de um móvel (somando quantidades). */
export const nPecasMovel = (m: Pick<Movel, "pecas">) => m.pecas.reduce((s, p) => s + (p.qtd || 0), 0);
/** Custo de uma operação: nº de peças × minutos × €/min (ou minutos × €/min nas linhas antigas). */
export const custoOperacao = (o: LinhaOperacao, nPecas: number, custoMinuto: number) => (o.por_peca ? nPecas : 1) * o.minutos * (o.custo_minuto ?? custoMinuto);
export type LinhaExtra = { id: string; descricao: string; valor: number | null };

export type Movel = {
  id: string;
  divisao_id: string;
  tipo: TipoMovel;
  ref: string; // ex.: INF01
  designacao: string;
  qtd: number;
  L: number;
  A: number;
  P: number;
  portas: number;
  gavetas: number;
  prateleiras: number;
  tipo_porta: string;
  puxador: string;
  costa_e: number;
  corpo: EspecMaterial;
  frente: EspecMaterial;
  checklist: Record<string, string>;
  pecas: Peca[];
  ferragens: LinhaFerragem[];
  operacoes: LinhaOperacao[];
  extras: LinhaExtra[];
  notas: string;
  espaco_antes?: number; // mm livres antes deste móvel (janela, electrodoméstico, parede…)
  frentes?: TipoFrentes; // resposta à pergunta «portas / gavetas / portas e gavetas»
  topo_sobre_ilhargas?: boolean; // tampo/travessas por cima das ilhargas (por defeito: por dentro)
  rodape_tipo?: TipoRodape; // cozinhas
  rodape_acabamento?: "lacado" | "folheado"; // quando o rodapé é em MDF
  portas_disposicao?: "lado" | "sobrepostas"; // portas lado a lado (esq.→dir.) ou sobrepostas (cima→baixo)
  portas_diferentes?: boolean; // acabamento próprio em todas ou algumas portas
  portas_acab?: Record<string, EspecMaterial>; // nº da porta (1 = de cima / da esquerda) → acabamento próprio
  codigo?: string;
};

export type TipoFrentes = "portas" | "gavetas" | "portas_gavetas" | "aberto";
export const FRENTES: { id: TipoFrentes; nome: string }[] = [
  { id: "portas", nome: "Portas" },
  { id: "gavetas", nome: "Gavetas" },
  { id: "portas_gavetas", nome: "Portas e gavetas" },
  { id: "aberto", nome: "Aberto (sem frentes)" },
];
/** Ajusta nº de portas e gavetas à resposta dada. */
export function aplicarFrentes(m: Movel, f: TipoFrentes): Movel {
  const portas = f === "portas" || f === "portas_gavetas" ? m.portas || (m.L > 600 ? 2 : 1) : 0;
  const gavetas = f === "gavetas" ? m.gavetas || 3 : f === "portas_gavetas" ? m.gavetas || 1 : 0;
  return { ...m, frentes: f, portas, gavetas };
}

export type TipoRodape = "mdf" | "laminado" | "inox" | "inox_pintar";
export const RODAPES: { id: TipoRodape; nome: string }[] = [
  { id: "mdf", nome: "MDF" },
  { id: "laminado", nome: "Laminado" },
  { id: "inox", nome: "Inox" },
  { id: "inox_pintar", nome: "Inox (p/ pintar)" },
];

/** Preço dos laminados a aplicar no orçamento: à placa (por defeito), à palete ou ao camião. */
export type Escalao = "placa" | "palete" | "camiao";
export const ESCALOES: { id: Escalao; nome: string }[] = [
  { id: "placa", nome: "Preço m² à placa" },
  { id: "palete", nome: "Preço m² à palete" },
  { id: "camiao", nome: "Preço m² ao camião" },
];

/** Tampo de bancada de uma divisão: produto 10* com uma peça 03.4* por troço. */
export type Tampo = {
  incluir: boolean;
  material: "laminado" | "compacto" | "madeira" | "pedra" | "outro";
  acabamento: string;
  grupo?: string; // grupo de laminado, se o decor não tiver grupo
  espessura: number;
  profundidade: number;
  saliencia: number; // mm à frente das portas
  comprimento: number | null; // null = soma automática dos móveis de baixo (sem colunas)
  comp_max_troco: number; // comprimento máximo de cada peça (placa)
  unico?: boolean; // tampo único: uma só peça por troço, sem divisões
  terceiros: boolean; // fornecido/aplicado por terceiros (só desenhado, sem custo)
  preco_m2: number | null; // guardado no orçamento (lido da base de dados ou manual)
  preco_orla_ml?: number | null;
  notas: string;
  codigo?: string;
};

export type DadosOrcamento = { moveis: Movel[]; extras_gerais: LinhaExtra[]; tampos?: Record<string, Tampo>; escalao_laminado?: Escalao };

export function tampoPorDefeito(d: Divisao, moveis: Movel[], cat?: Catalogo, escalao: Escalao = "placa"): Tampo {
  const txt = (d.descritivo?.tampo ?? "").toLowerCase();
  const esp = parseInt(txt.match(/(\d{2})\s*mm/)?.[1] ?? "", 10);
  const material: Tampo["material"] = txt.includes("compacto") ? "compacto" : txt.includes("pedra") || txt.includes("granito") || txt.includes("quartz") || txt.includes("silestone") ? "pedra" : txt.includes("madeira") ? "madeira" : "laminado";
  const baixo = moveis.filter((m) => m.divisao_id === d.id && m.tipo !== "superior" && m.tipo !== "coluna" && m.tipo !== "tampo");
  const P = Math.max(560, ...baixo.map((m) => m.P));
  const t: Tampo = {
    incluir: true,
    material,
    acabamento: d.descritivo?.acabamento_ref ?? "",
    grupo: "",
    espessura: Number.isFinite(esp) ? esp : material === "compacto" ? 12 : material === "pedra" ? 20 : 25,
    profundidade: P + 19 + 2 + 20,
    saliencia: 20,
    comprimento: null,
    comp_max_troco: material === "pedra" ? 3000 : 4100,
    unico: true,
    terceiros: material === "pedra",
    preco_m2: null,
    preco_orla_ml: null,
    notas: d.descritivo?.tampo ?? "",
  };
  return cat ? precosTampo(t, cat, escalao) : t;
}

/** Lê da base de dados o preço do tampo (grupo/decor por espessura) e da orla. */
export function precosTampo(t: Tampo, cat: Catalogo, escalao: Escalao = "placa"): Tampo {
  if (t.material !== "laminado") return { ...t, preco_orla_ml: t.preco_orla_ml ?? cat.parametros.orla_preco_ml };
  const esp: EspecMaterial = { material: "laminado", mdf: "", acabamento: t.acabamento, grupo: t.grupo ?? "", extra_m2: null };
  return { ...t, preco_m2: precoPlaca(cat, esp, t.espessura, escalao).m2, preco_orla_ml: precoOrla(cat, esp) };
}

/** Troços contínuos de móveis de baixo (as colunas e os espaços interrompem o tampo). */
export function trocosTampo(moveis: Movel[]): { x: number; comp: number }[] {
  const out: { x: number; comp: number }[] = [];
  let x = 0;
  let atual: { x: number; comp: number } | null = null;
  for (const m of moveis.filter((mm) => mm.tipo !== "superior" && mm.tipo !== "tampo")) {
    const esp = m.espaco_antes ?? 0;
    if (esp > 0 && atual) { out.push(atual); atual = null; }
    x += esp;
    for (let i = 0; i < m.qtd; i++) {
      if (m.tipo === "coluna") {
        if (atual) { out.push(atual); atual = null; }
      } else {
        if (!atual) atual = { x, comp: 0 };
        atual.comp += m.L;
      }
      x += m.L;
    }
  }
  if (atual) out.push(atual);
  return out;
}

export function comprimentoTampo(t: Tampo, moveis: Movel[]) {
  return t.comprimento ?? trocosTampo(moveis).reduce((s, tr) => s + tr.comp, 0);
}

export type CustoTampo = CustoMovel & { comprimento: number; pecas: number };

export function custoTampo(t: Tampo, d: Divisao, moveis: Movel[], par: Parametros): CustoTampo {
  const m = movelTampo(t, d, moveis, null);
  const c = custoMovel(m, par);
  return { ...c, comprimento: m.L, pecas: m.pecas.length };
}

/** Produto 10* do tampo, com uma peça 03.4* por troço (orlada em todo o perímetro). */
export function movelTampo(t: Tampo, d: Divisao, moveis: Movel[], numero: string | null): Movel {
  const doProduto = moveis.filter((m) => m.divisao_id === d.id && m.tipo !== "tampo");
  const comp = comprimentoTampo(t, doProduto);
  const trocos = t.comprimento != null ? [{ x: 0, comp: t.comprimento }] : trocosTampo(doProduto);
  const base = numero?.split(".")[0];
  const suf = base ? `Y${base}.${String(d.ordem).padStart(2, "0")}` : "";
  let seq = doProduto.reduce((s, m) => s + m.pecas.length, 0);
  const espec: EspecMaterial = { material: t.material === "laminado" ? "laminado" : "madeira", mdf: "", acabamento: t.acabamento, grupo: t.grupo ?? "", extra_m2: null };
  const pecas: Peca[] = [];
  for (const tr of trocos) {
    const n = t.unico ? 1 : Math.max(1, Math.ceil(tr.comp / Math.max(500, t.comp_max_troco || 4100)));
    for (let i = 0; i < n; i++) {
      const c = i < n - 1 ? Math.round(tr.comp / n) : tr.comp - Math.round(tr.comp / n) * (n - 1);
      seq++;
      pecas.push({
        id: `tampo-${d.id}-${seq}`,
        designacao: trocos.length > 1 || n > 1 ? `Tampo de bancada (troço ${pecas.length + 1})` : "Tampo de bancada",
        qtd: 1, c, l: t.profundidade, e: t.espessura, sup: "manual", oc: 2, ol: 2, subconjunto: "",
        preco_m2: t.terceiros ? 0 : t.preco_m2, preco_extra_m2: null, faces_extra: 0,
        preco_orla_ml: t.terceiros ? 0 : t.preco_orla_ml ?? null,
        nota: [t.material !== "laminado" ? t.material : "", t.terceiros ? "fornecido por terceiros" : "", t.notas].filter(Boolean).join(" · "),
        codigo: suf ? `03.4.${seq}${suf}` : undefined,
      });
    }
  }
  const orlaMl = pecas.reduce((s, p) => s + (2 * p.c + 2 * p.l) / 1000, 0);
  const n = Math.max(1, pecas.length);
  const operacoes: LinhaOperacao[] = t.terceiros ? [] : [
    { id: `op-c-${d.id}`, posto: "L70SEC.01", descricao: "Corte", minutos: 1, custo_minuto: null, por_peca: true },
    { id: `op-o-${d.id}`, posto: "ORLADORA", descricao: "Orladora", minutos: r2((orlaMl * 0.6) / n), custo_minuto: null, por_peca: true },
  ];
  return {
    id: `tampo-${d.id}`, divisao_id: d.id, tipo: "tampo", ref: "TB01", designacao: "Tampo de bancada", qtd: 1,
    L: comp, A: t.espessura, P: t.profundidade, portas: 0, gavetas: 0, prateleiras: 0, tipo_porta: "", puxador: "", costa_e: 0,
    corpo: espec, frente: espec, checklist: {}, pecas, ferragens: [], operacoes, extras: [], notas: t.notas,
    codigo: suf ? `10TB01${suf}` : undefined,
  };
}

export type Parametros = { custo_minuto: number; desperdicio_pct: number; orla_preco_ml: number };

/** Dados da base de dados necessários para preços. */
export type Catalogo = {
  parametros: Parametros;
  gruposPreco: { grupo: string; acabamento: string | null; tipo: string; espessura: number; medida: string | null; preco: number | null; palete?: number | null; camiao?: number | null }[];
  acabamentoGrupo: Record<string, string>; // referência (sem espaços, maiúsculas) -> código do grupo
  mdf: { categoria: string; espessura: number; preco: number | null; desconto: number | null }[];
  ferragens: Record<string, { descricao: string; preco: number | null; unidade: string }>; // por ref_famo
  genericas: Record<string, { descricao: string; preco: number | null }>; // por descrição
  postos: Record<string, { nome: string; custo_minuto: number | null }>;
};

/* ------------------------------------------------------------------ util */

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

export const PREFIXO_PRODUTO: Record<TipoDivisao, string> = {
  cozinha: "COZ",
  quarto: "QUA",
  wc: "WC",
  sala_estar: "SAL",
  sala_jantar: "SJA",
  outros: "PRO",
};

/* ------------------------------------------------------------------ preços */

export function precoPlaca(cat: Catalogo, esp: EspecMaterial, e: number, escalao: Escalao = "placa"): { m2: number | null; extra: number | null; nota: string } {
  if (esp.material === "laminado") {
    // preço pela referência do decor; os decores com tabela própria por grupo (dados existentes) usam essa tabela
    const ref = norm(esp.acabamento || "");
    const grupo = cat.acabamentoGrupo[ref] || esp.grupo || "";
    const especifico = cat.gruposPreco.find((p) => p.tipo === "placa" && p.acabamento && norm(p.acabamento) === ref && p.espessura === e);
    const doGrupo = cat.gruposPreco.find((p) => p.tipo === "placa" && !p.acabamento && p.grupo === grupo && p.espessura === e);
    const linha = especifico ?? doGrupo;
    // palete/camião sem preço na tabela: fica o preço à placa
    const v = escalao === "palete" ? linha?.palete ?? linha?.preco : escalao === "camiao" ? linha?.camiao ?? linha?.preco : linha?.preco;
    return { m2: v ?? null, extra: null, nota: "" };
  }
  // MDF (folheado / lacado) ou madeira maciça
  if (esp.material === "madeira") return { m2: esp.extra_m2, extra: null, nota: esp.acabamento ? `Madeira: ${esp.acabamento}` : "" };
  const categoria = esp.mdf === "hidrofugo" ? "mdf_hidrofugo" : esp.mdf === "ignifugo" ? "mdf_ignifugo" : "mdf";
  const m = cat.mdf.find((x) => x.categoria === categoria && x.espessura === e);
  const precoMdf = m?.preco != null ? Math.round(m.preco * (1 - (m.desconto ?? 0) / 100) * 10000) / 10000 : null;
  const nota =
    esp.material === "folheado"
      ? `MDF ${esp.mdf || "normal"} com folha de madeira "${esp.acabamento || "a definir"}"`
      : `MDF ${esp.mdf || "normal"} lacado ${esp.acabamento || "(cor a definir)"}`;
  return { m2: precoMdf, extra: esp.extra_m2, nota };
}

export function precoOrla(cat: Catalogo, esp: EspecMaterial): number | null {
  if (esp.material !== "laminado") return cat.parametros.orla_preco_ml;
  const ref = norm(esp.acabamento || "");
  const grupo = cat.acabamentoGrupo[ref] || esp.grupo || "";
  const especifica = cat.gruposPreco.find((p) => p.tipo === "orla" && p.acabamento && norm(p.acabamento) === ref && p.medida === "23x2");
  const doGrupo = cat.gruposPreco.find((p) => p.tipo === "orla" && !p.acabamento && p.grupo === grupo && p.medida === "23x2");
  return especifica?.preco ?? doGrupo?.preco ?? cat.parametros.orla_preco_ml;
}

function ferr(cat: Catalogo, ref: string | null, qtd: number, descGenerica?: string): LinhaFerragem {
  if (ref && cat.ferragens[ref]) {
    const f = cat.ferragens[ref];
    return { id: uid(), ref_famo: ref, descricao: f.descricao, qtd, preco: f.preco, unidade: f.unidade };
  }
  const g = descGenerica ? cat.genericas[descGenerica] : undefined;
  return { id: uid(), ref_famo: ref, descricao: g?.descricao ?? descGenerica ?? ref ?? "Ferragem", qtd, preco: g?.preco ?? null };
}

/* ------------------------------------------------------------------ gerar móveis a partir do pedido */

/** Lê "3 superiores + 4 inferiores + 1 coluna" e devolve contagens por tipo. */
export function interpretarComponentes(texto: string): Partial<Record<TipoMovel, number>> {
  const t = (texto || "").toLowerCase();
  const res: Partial<Record<TipoMovel, number>> = {};
  const pares: [RegExp, TipoMovel][] = [
    [/(\d+)\s*(?:m[óo]veis?\s*)?(?:superiores|superior|altos?|murais?)/g, "superior"],
    [/(\d+)\s*(?:m[óo]veis?\s*)?(?:inferiores|inferior|baixos?|bases?)/g, "inferior"],
    [/(\d+)\s*(?:colunas?|torres?)/g, "coluna"],
    [/(\d+)\s*(?:gaveteiros?)/g, "gaveteiro"],
    [/(\d+)\s*(?:roupeiros?|arm[áa]rios? roupeiro)/g, "roupeiro"],
    [/(\d+)\s*(?:estantes?|prateleiras abertas)/g, "estante"],
  ];
  for (const [re, tipo] of pares) for (const m of t.matchAll(re)) res[tipo] = (res[tipo] ?? 0) + parseInt(m[1], 10);
  return res;
}

function tipoPorDefeito(d: TipoDivisao): TipoMovel {
  return d === "cozinha" ? "inferior" : d === "quarto" ? "roupeiro" : d === "wc" ? "wc" : d === "sala_estar" || d === "sala_jantar" ? "estante" : "outro";
}

/** Material do corpo (1.º escolhido) ou das frentes (2.º, se houver mais do que um). */
export function especDaDivisao(d: Divisao, parte: "corpo" | "frente" = "corpo"): EspecMaterial {
  const ms = materiaisDe(d);
  const material = (parte === "frente" ? ms[1] ?? ms[0] : ms[0]) ?? "laminado";
  return { material, mdf: d.mdf ?? "", acabamento: d.descritivo?.acabamento_ref ?? d.acabamento ?? "", grupo: "", extra_m2: null, orlar: false };
}

export function novoMovel(divisao: Divisao, tipo: TipoMovel, indice: number): Movel {
  const t = TIPOS_MOVEL[tipo];
  const portaTxt = (divisao.descritivo?.tipo_portas ?? "").toLowerCase();
  const gav = tipo === "gaveteiro" ? 3 : 0;
  const portas = tipo === "gaveteiro" || tipo === "estante" || portaTxt.includes("sem portas") ? 0 : t.L > 600 ? 2 : 1;
  return {
    id: uid(),
    divisao_id: divisao.id,
    tipo,
    ref: `${t.ref}${String(indice).padStart(2, "0")}`,
    designacao: `${t.nome} ${indice}`,
    qtd: 1,
    L: t.L,
    A: t.A,
    P: t.P,
    portas,
    gavetas: gav,
    prateleiras: tipo === "gaveteiro" ? 0 : 1,
    tipo_porta: portaTxt.includes("correr") ? "Correr" : "Batente",
    puxador: divisao.descritivo?.puxadores ?? "",
    costa_e: 8,
    corpo: especDaDivisao(divisao, "corpo"),
    frente: especDaDivisao(divisao, "frente"),
    checklist: {},
    pecas: [],
    ferragens: [],
    operacoes: [],
    extras: [],
    notas: "",
  };
}

/** Propõe os móveis de uma divisão com base no descritivo do pedido. */
export function proporMoveis(divisao: Divisao): Movel[] {
  const contagens = interpretarComponentes(divisao.descritivo?.n_componentes ?? "");
  const moveis: Movel[] = [];
  const porTipo: Partial<Record<TipoMovel, number>> = {};
  const entradas = Object.entries(contagens) as [TipoMovel, number][];
  if (entradas.length === 0) entradas.push([tipoPorDefeito(divisao.tipo), 1]);
  for (const [tipo, n] of entradas) {
    for (let i = 0; i < Math.min(n, 60); i++) {
      porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
      moveis.push(novoMovel(divisao, tipo, porTipo[tipo]!));
    }
  }
  // Distribui a largura total, se indicada (ex.: "3200 x 600 x 2400")
  const dims = (divisao.descritivo?.dimensoes ?? "").match(/(\d{3,5})\s*[x×]\s*(\d{2,4})(?:\s*[x×]\s*(\d{3,4}))?/);
  if (dims) {
    const largura = parseInt(dims[1], 10);
    const inferiores = moveis.filter((m) => m.tipo === "inferior" || m.tipo === "gaveteiro");
    const superiores = moveis.filter((m) => m.tipo === "superior");
    for (const grupo of [inferiores, superiores]) {
      if (grupo.length > 0) {
        const cada = Math.round(largura / grupo.length);
        if (cada >= 200 && cada <= 1200) grupo.forEach((m) => { m.L = cada; m.portas = m.portas === 0 ? 0 : cada > 600 ? 2 : 1; });
      }
    }
  }
  return moveis;
}

/* ------------------------------------------------------------------ decompor um móvel */

export function decompor(m: Movel, cat: Catalogo, escalao: Escalao = "placa"): Movel {
  const e = 19;
  const L = m.L, A = m.A, P = m.P;
  const interior = L - 2 * e;
  const sobre = !!m.topo_sobre_ilhargas; // tampo/travessas por cima das ilhargas
  const pc = precoPlaca(cat, m.corpo, e, escalao);
  const fr = precoFrente(cat, m.frente, e, escalao);
  const pf = { m2: fr.m2, extra: fr.extra, nota: fr.nota };
  const pcosta = precoPlaca(cat, { ...m.corpo }, m.costa_e, escalao);
  const orlaC = precoOrla(cat, m.corpo);
  const orlaF = precoOrla(cat, m.frente);
  const facesC = m.corpo.material === "folheado" || m.corpo.material === "lacado" ? 2 : 0;
  const facesF = fr.faces;

  const peca = (p: Partial<Peca> & Pick<Peca, "designacao" | "c" | "l">): Peca => {
    const sup = p.sup ?? "corpo";
    const base = sup === "frente" ? pf : sup === "costa" ? pcosta : pc;
    return {
      id: uid(),
      qtd: 1,
      e,
      sup,
      ...orlasPara(sup === "frente" ? m.frente : m.corpo),
      subconjunto: "",
      preco_m2: base.m2,
      preco_extra_m2: sup === "costa" ? null : base.extra,
      faces_extra: sup === "frente" ? facesF : sup === "costa" ? 0 : facesC,
      ...(sup === "frente" && fr.faceDentro ? { face_dentro: true, preco_dentro_m2: fr.dentro } : {}),
      preco_orla_ml: sup === "frente" ? orlaF : orlaC,
      nota: base.nota,
      ...p,
    };
  };

  const pecas: Peca[] = [];
  const ehAberto = m.tipo === "estante";
  // por defeito o tampo (cúpula) e as travessas ficam por dentro das ilhargas; por cima, as ilhargas encurtam 19 mm
  pecas.push(peca({ designacao: "Lado esquerdo", c: sobre ? A - e : A, l: P, subconjunto: SUB_CORPO }));
  pecas.push(peca({ designacao: "Lado direito", c: sobre ? A - e : A, l: P, subconjunto: SUB_CORPO }));
  pecas.push(peca({ designacao: "Fundo", c: interior, l: P, subconjunto: SUB_CORPO }));
  if (m.tipo === "inferior" || m.tipo === "gaveteiro") {
    pecas.push(peca({ designacao: "Travessa superior", qtd: 2, c: sobre ? L : interior, l: 100, nota: sobre ? "Por cima das ilhargas" : "", subconjunto: SUB_CORPO }));
  } else {
    pecas.push(peca({ designacao: "Cúpula", c: sobre ? L : interior, l: P, nota: sobre ? "Por cima das ilhargas" : "", subconjunto: SUB_CORPO }));
  }
  if (!ehAberto || m.costa_e > 0) {
    pecas.push(peca({ designacao: "Costa", c: interior + 16, l: A - 2 * e + 16, e: m.costa_e, sup: "costa", subconjunto: SUB_CORPO }));
  }
  if (m.prateleiras > 0) {
    pecas.push(peca({ designacao: "Prateleira", qtd: m.prateleiras, c: interior - 2, l: P - 20 - m.costa_e }));
  }
  if (m.tipo === "roupeiro") {
    pecas.push(peca({ designacao: "Divisória vertical", c: A - 2 * e, l: P - 20 - m.costa_e, subconjunto: SUB_CORPO }));
  }

  // Frentes: gavetas e portas
  const folga = 3;
  const altGaveta = m.gavetas > 0 ? (m.portas > 0 ? 180 : Math.floor((A - folga * (m.gavetas + 1)) / m.gavetas)) : 0;
  const altPortas = m.portas > 0 ? A - (m.gavetas > 0 ? m.gavetas * (altGaveta + folga) : 0) - folga * 2 : 0;
  // gavetas: caixa em 16 mm (laterais, traseira, fundo) com folga de 12,5 mm por lado para as corrediças
  const Lc = comprimentoCorredica(P, m.costa_e);
  const caixa = interior - 25;
  const hCaixa = Math.max(80, Math.round(altGaveta - 50));
  for (let g = 1; g <= m.gavetas; g++) {
    const sub = `Gaveta ${g}`;
    const semExtra = { faces_extra: 0, preco_extra_m2: null };
    pecas.push(peca({ designacao: `Frente gaveta ${g}`, c: L - 2 * folga, l: altGaveta, sup: "frente", subconjunto: sub }));
    pecas.push(peca({ designacao: `Lateral gaveta ${g}`, qtd: 2, c: Lc, l: hCaixa, e: 16, subconjunto: sub, ...semExtra }));
    pecas.push(peca({ designacao: `Traseira gaveta ${g}`, c: caixa - 32, l: hCaixa - 16, e: 16, subconjunto: sub, ...semExtra }));
    pecas.push(peca({ designacao: `Fundo gaveta ${g}`, c: caixa - 32, l: Lc - 16, e: 16, subconjunto: sub, ...semExtra }));
  }
  const sobrepostas = disposicaoPortas(m) === "sobrepostas";
  // portas sobrepostas: dividem a altura (de cima para baixo); lado a lado: dividem a largura
  const altPorta = sobrepostas && m.portas > 1 ? Math.floor((altPortas - folga * (m.portas - 1)) / m.portas) : altPortas;
  if (m.portas > 0 && m.tipo_porta !== "Correr") {
    const larg = m.portas === 1 || sobrepostas ? L - 2 * folga : Math.floor((L - folga * (m.portas + 1)) / m.portas);
    if (m.portas > 1 && m.portas_diferentes) {
      // uma linha por porta, cada uma com o seu acabamento
      for (let n = 1; n <= m.portas; n++) {
        const ep = especPorta(m, n);
        const f = precoFrente(cat, ep, e, escalao);
        pecas.push(peca({
          designacao: `Porta ${n}`, c: altPorta, l: larg, sup: "frente", porta: n,
          preco_m2: f.m2, preco_extra_m2: f.faces > 0 ? f.extra : null, faces_extra: f.faces,
          ...(f.faceDentro ? { face_dentro: true, preco_dentro_m2: f.dentro } : { face_dentro: false, preco_dentro_m2: null }),
          ...orlasPara(ep), preco_orla_ml: precoOrla(cat, ep),
          nota: [ep !== m.frente ? `Acabamento próprio: ${ep.material} ${ep.acabamento}`.trim() : "", f.nota].filter(Boolean).join(" · "),
        }));
      }
    } else {
      pecas.push(peca({ designacao: m.portas === 1 ? "Porta" : "Porta batente", qtd: m.portas, c: altPorta, l: larg, sup: "frente" }));
    }
  } else if (m.portas > 0) {
    const larg = Math.floor(L / m.portas) + 30;
    pecas.push(peca({ designacao: "Porta de correr", qtd: m.portas, c: A - 40, l: larg, sup: "frente" }));
  }
  // rodapé: MDF (sem orla), laminado (como as peças laminadas) ou inox (perfil ao metro, vai para as ferragens)
  const rod = m.rodape_tipo;
  if (TIPOS_MOVEL[m.tipo].pes && rod !== "inox" && rod !== "inox_pintar") {
    if (rod === "mdf") {
      // MDF lacado (sem orla) ou folheado (folha de madeira na face vista e orla em folha de madeira em todo o perímetro)
      const ac = m.rodape_acabamento;
      const mdf = m.frente.mdf || "hidrofugo";
      const pm = precoPlaca(cat, { material: "lacado", mdf, acabamento: "", grupo: "", extra_m2: null }, e);
      // preço do acabamento: o das frentes, se forem do mesmo material; senão fica por preencher
      const extra = ac && m.frente.material === ac ? m.frente.extra_m2 : null;
      const folha = ac === "folheado";
      pecas.push(peca({
        designacao: "Rodapé", c: L, l: 100, sup: "manual",
        preco_m2: pm.m2,
        faces_extra: ac ? 1 : 0,
        preco_extra_m2: ac ? extra : null,
        orlas: folha ? [true, true, true, true] : [false, false, false, false], oc: folha ? 2 : 0, ol: folha ? 2 : 0,
        preco_orla_ml: folha ? cat.parametros.orla_preco_ml : null,
        nota: `Rodapé MDF ${mdf}${ac === "lacado" ? ` lacado ${m.frente.material === "lacado" ? m.frente.acabamento : ""}` : folha ? ` folheado ${m.frente.material === "folheado" ? m.frente.acabamento : ""}, orla em folha de madeira` : ""}`.trim(),
      }));
    } else if (rod === "laminado") {
      const lam = m.frente.material === "laminado" ? m.frente : m.corpo.material === "laminado" ? m.corpo : { ...m.frente, material: "laminado" as const, acabamento: "" };
      const pl = precoPlaca(cat, lam, e, escalao);
      pecas.push(peca({ designacao: "Rodapé", c: L, l: 100, sup: "manual", preco_m2: pl.m2, preco_extra_m2: null, faces_extra: 0, preco_orla_ml: precoOrla(cat, lam), orlas: [true, true, true, true], oc: 2, ol: 2, nota: `Rodapé laminado ${lam.acabamento}`.trim() }));
    } else {
      pecas.push(peca({ designacao: "Rodapé", c: L, l: 100, sup: "frente" }));
    }
  }

  // Ferragens
  const fs: LinhaFerragem[] = [];
  if (m.portas > 0 && m.tipo_porta !== "Correr") {
    const porPorta = altPorta <= 900 ? 2 : altPorta <= 1600 ? 3 : 4;
    fs.push(ferr(cat, "03.2.387.01", m.portas * porPorta));
    fs.push(ferr(cat, "03.2.501.01", m.portas * porPorta));
  }
  if (m.portas > 0 && m.tipo_porta === "Correr") fs.push(ferr(cat, "03.2.342.01", m.portas, "Jogo por porta (correr)"));
  const pux = (m.puxador || "").toLowerCase();
  const puxador = (qtd: number, sub?: string) => {
    if (qtd <= 0) return;
    if (pux.includes("push")) fs.push({ ...ferr(cat, "03.2.519.18", qtd), subconjunto: sub });
    else if (!pux.includes("gola") && !pux.includes("embutido")) fs.push({ ...ferr(cat, null, qtd, "Puxador (genérico de orçamento)"), subconjunto: sub });
  };
  // ferragens de cada gaveta ficam no respectivo sub-conjunto
  for (let g = 1; g <= m.gavetas; g++) {
    const sub = `Gaveta ${g}`;
    fs.push({ ...ferr(cat, "03.7.278.01", 1), subconjunto: sub }); // par de corrediças
    fs.push({ ...ferr(cat, "03.1.905.01", 12), subconjunto: sub }); // parafusos de fixação
    puxador(1, sub);
  }
  puxador(m.portas);
  if (m.prateleiras > 0) fs.push(ferr(cat, "03.2.187.01", m.prateleiras * 4));
  // ferragens de montagem do corpo ficam no sub-conjunto do corpo
  fs.push({ ...ferr(cat, null, 4, "Minifix completo (genérico de orçamento)"), subconjunto: SUB_CORPO });
  fs.push({ ...ferr(cat, "03.1.912.01", 8), subconjunto: SUB_CORPO });
  fs.push({ ...ferr(cat, "04.2.020", 4), subconjunto: SUB_CORPO });
  if (TIPOS_MOVEL[m.tipo].pes && (rod === "inox" || rod === "inox_pintar")) {
    fs.push({ ...ferr(cat, null, Math.round(L) / 1000, rod === "inox" ? "Rodapé inox" : "Rodapé inox (para pintar)"), unidade: "ml" });
  }
  if (TIPOS_MOVEL[m.tipo].pes) {
    fs.push(ferr(cat, "03.6.432.01", 4));
    fs.push(ferr(cat, "03.6.433.01", 4));
    fs.push(ferr(cat, "03.2.761.01", 1));
  }
  if (m.tipo === "roupeiro") fs.push(ferr(cat, "03.2.401.01", 2, "Suporte varão"));

  // Operações: minutos por peça (o custo multiplica pelo nº de peças do móvel)
  const nPecas = Math.max(1, pecas.reduce((s, p) => s + p.qtd, 0));
  const orlaMl = pecas.reduce((s, p) => { const a = arestasOrla(p); return s + (p.qtd * ((Number(a[0]) + Number(a[1])) * p.c + (Number(a[2]) + Number(a[3])) * p.l)) / 1000; }, 0);
  // (valores propostos a partir dos tempos totais habituais; o orçamentista ajusta os minutos por peça)
  const op = (posto: string, descricao: string, minutosTotais: number): LinhaOperacao => ({
    id: uid(),
    posto,
    descricao: cat.postos[posto]?.nome ?? descricao,
    minutos: r2(minutosTotais / nPecas),
    custo_minuto: cat.postos[posto]?.custo_minuto ?? cat.parametros.custo_minuto,
    por_peca: true,
  });
  const ops: LinhaOperacao[] = [
    op("L70SEC.01", "Corte", nPecas * 1.0),
    ...(orlaMl > 0 ? [op("ORLADORA", "Orladora", orlaMl * 0.6)] : []),
    op("L40MULTI.01", "Furação / CNC", nPecas * 1.5),
    ...(m.gavetas > 0 ? [op("L13MONT.01", "Pré-montagem gavetas", m.gavetas * 8)] : []),
    op("L10MONT.02", "Montagem", 20 + m.portas * 5 + m.gavetas * 6),
    op("88MES.10", "Embalagem", 5),
  ];

  return { ...m, pecas, ferragens: fs, operacoes: ops };
}

/** Volta a ler os preços da base de dados para as linhas existentes (mantém quantidades e medidas). */
export function actualizarPrecos(m: Movel, cat: Catalogo, escalao: Escalao = "placa"): Movel {
  const pecas = m.pecas.map((p) => {
    if (p.sup === "manual") return p;
    const esp = especDaPeca(m, p);
    if (p.sup === "frente") {
      const f = precoFrente(cat, esp, p.e, escalao);
      return { ...p, preco_m2: f.m2, preco_extra_m2: f.faces > 0 ? f.extra : null, faces_extra: f.faces, face_dentro: f.faceDentro, preco_dentro_m2: f.dentro, preco_orla_ml: precoOrla(cat, esp), nota: f.nota || p.nota };
    }
    const pr = precoPlaca(cat, esp, p.e, escalao);
    return { ...p, preco_m2: pr.m2, preco_extra_m2: p.faces_extra > 0 ? pr.extra : p.preco_extra_m2, preco_orla_ml: precoOrla(cat, esp), nota: pr.nota || p.nota };
  });
  const ferragens = m.ferragens.map((f) => (f.ref_famo && cat.ferragens[f.ref_famo] ? { ...f, preco: cat.ferragens[f.ref_famo].preco } : f));
  const operacoes = m.operacoes.map((o) => ({ ...o, custo_minuto: cat.postos[o.posto]?.custo_minuto ?? cat.parametros.custo_minuto }));
  return { ...m, pecas, ferragens, operacoes };
}

/** Muda só o preço por m² das placas laminadas para o escalão escolhido (placa/palete/camião). */
export function aplicarEscalao(m: Movel, cat: Catalogo, escalao: Escalao): Movel {
  return {
    ...m,
    pecas: m.pecas.map((p) => {
      let esp: EspecMaterial | null = null;
      if (p.sup === "manual") {
        if (m.tipo === "tampo" && m.corpo.material === "laminado") esp = m.corpo;
        else if (p.designacao === "Rodapé" && m.rodape_tipo === "laminado") esp = m.frente.material === "laminado" ? m.frente : m.corpo;
      } else if (p.sup === "frente" && especDaPeca(m, p).faces === "diferentes" && especDaPeca(m, p).dentro) {
        // bi-decor laminado: preço pela regra das frentes
        const ef = especDaPeca(m, p);
        if (ef.material === "laminado" && ef.dentro!.material === "laminado") {
          const v = precoFrente(cat, ef, p.e, escalao).m2;
          return v == null ? p : { ...p, preco_m2: v };
        }
        return p;
      } else {
        const e = especDaPeca(m, p);
        if (e.material === "laminado") esp = e;
      }
      if (!esp || esp.material !== "laminado") return p;
      const v = precoPlaca(cat, esp, p.e, escalao).m2;
      return v == null ? p : { ...p, preco_m2: v };
    }),
  };
}

/* ------------------------------------------------------------------ códigos */

/**
 * Codificação provisória (a definir pela FAMO):
 *  produto  COZ + Y + base.NN       (NN = posição da divisão no pedido)
 *  móvel    10 + REF + Y + base.NN
 *  sub-conj 13.4.<n> + Y + base.NN  (33.4 quando é madeira/folheado montado em marcenaria)
 *  peça     03.4.<n> + Y + base.NN
 */
export function codigos(numeroProjecto: string | null, divisoes: Divisao[], moveis: Movel[]): Movel[] {
  if (!numeroProjecto) return moveis;
  const base = numeroProjecto.split(".")[0];
  return moveis.map((m) => {
    const d = divisoes.find((x) => x.id === m.divisao_id);
    const pos = String(d?.ordem ?? 1).padStart(2, "0");
    const suf = `Y${base}.${pos}`;
    const doMovel = moveis.filter((x) => x.divisao_id === m.divisao_id);
    // numeração sequencial das peças dentro do produto (divisão)
    let seq = 0;
    for (const x of doMovel) {
      if (x.id === m.id) break;
      seq += x.pecas.length;
    }
    // 33.4 quando é madeira/folheado montado em marcenaria (corpo: material do corpo; gavetas: das frentes)
    const marc = (e: EspecMaterial) => (e.material === "folheado" || e.material === "madeira" ? "33.4" : "13.4");
    const subs = [...new Set(m.pecas.map((p) => p.subconjunto).filter(Boolean))];
    return {
      ...m,
      codigo: `10${m.ref}${suf}`,
      pecas: m.pecas.map((p, i) => ({
        ...p,
        codigo: `03.4.${seq + i + 1}${suf}`,
        subconjunto: p.subconjunto,
        nota: p.nota,
        // código do sub-conjunto a que pertence
        ...(p.subconjunto ? { codigo_sub: `${marc(p.subconjunto === SUB_CORPO ? m.corpo : m.frente)}.${subs.indexOf(p.subconjunto) + 1}${m.ref}${suf}` } : {}),
      })),
    };
  });
}

export function codigoProduto(numeroProjecto: string | null, d: Divisao): string | null {
  if (!numeroProjecto) return null;
  return `${PREFIXO_PRODUTO[d.tipo]}Y${numeroProjecto.split(".")[0]}.${String(d.ordem).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ cálculo */

export type CustoMovel = { material: number; orla: number; desperdicio: number; ferragens: number; mao_obra: number; extras: number; total: number; pendentes: number; area_m2: number; orla_ml: number };

/** Arestas com orla (a partir do registo explícito ou das contagens antigas). */
export function arestasOrla(p: Peca): [boolean, boolean, boolean, boolean] {
  return p.orlas ?? [p.oc >= 1, p.oc >= 2, p.ol >= 1, p.ol >= 2];
}

export function custoPeca(p: Peca) {
  const area = (p.qtd * p.c * p.l) / 1e6;
  const ar = arestasOrla(p);
  const orlaMl = (p.qtd * ((Number(ar[0]) + Number(ar[1])) * p.c + (Number(ar[2]) + Number(ar[3])) * p.l)) / 1000;
  const placa = p.preco_m2 == null ? null : area * p.preco_m2;
  const fora = p.faces_extra > 0 ? (p.preco_extra_m2 == null ? null : area * p.faces_extra * p.preco_extra_m2) : 0;
  const dentro = p.face_dentro ? (p.preco_dentro_m2 == null ? null : area * p.preco_dentro_m2) : 0;
  const extra = fora == null || dentro == null ? null : fora + dentro;
  const orla = orlaMl > 0 ? (p.preco_orla_ml == null ? null : orlaMl * p.preco_orla_ml) : 0;
  const pendente = placa == null || extra == null || orla == null;
  return { area, orlaMl, material: (placa ?? 0) + (extra ?? 0), orla: orla ?? 0, pendente };
}

export function custoMovel(m: Movel, par: Parametros): CustoMovel {
  let material = 0, orla = 0, area = 0, orlaMl = 0, pend = 0;
  for (const p of m.pecas) {
    const c = custoPeca(p);
    material += c.material;
    orla += c.orla;
    area += c.area;
    orlaMl += c.orlaMl;
    if (c.pendente) pend++;
  }
  const desperdicio = (material + orla) * (par.desperdicio_pct / 100);
  let ferragens = 0;
  for (const f of m.ferragens) {
    if (f.preco == null) pend++;
    else ferragens += f.qtd * f.preco;
  }
  let mao = 0;
  const nP = nPecasMovel(m);
  for (const o of m.operacoes) mao += custoOperacao(o, nP, par.custo_minuto);
  let extras = 0;
  for (const x of m.extras) {
    if (x.valor == null) pend++;
    else extras += x.valor;
  }
  const total = material + orla + desperdicio + ferragens + mao + extras;
  return { material: r2(material), orla: r2(orla), desperdicio: r2(desperdicio), ferragens: r2(ferragens), mao_obra: r2(mao), extras: r2(extras), total: r2(total), pendentes: pend, area_m2: r2(area), orla_ml: r2(orlaMl) };
}

export type Totais = {
  porMovel: Record<string, CustoMovel>;
  porDivisao: Record<string, { custo: number; preco: number; qtd: number }>;
  porTampo: Record<string, CustoTampo>;
  extrasGerais: number;
  custo: number;
  preco: number;
  pendentes: number;
};

export function calcularTotais(dados: DadosOrcamento, divisoes: Divisao[], par: Parametros, margem: number): Totais {
  const porMovel: Record<string, CustoMovel> = {};
  const porDivisao: Totais["porDivisao"] = {};
  let pend = 0;
  for (const d of divisoes) porDivisao[d.id] = { custo: 0, preco: 0, qtd: d.quantidade };
  for (const m of dados.moveis) {
    const c = custoMovel(m, par);
    porMovel[m.id] = c;
    pend += c.pendentes;
    if (porDivisao[m.divisao_id]) porDivisao[m.divisao_id].custo += c.total * m.qtd;
  }
  const porTampo: Record<string, CustoTampo> = {};
  for (const d of divisoes) {
    const t = dados.tampos?.[d.id];
    if (!t?.incluir) continue;
    const ct = custoTampo(t, d, dados.moveis, par);
    porTampo[d.id] = ct;
    pend += ct.pendentes;
    porDivisao[d.id].custo += ct.total;
  }
  let custo = 0;
  for (const d of divisoes) {
    const pd = porDivisao[d.id];
    pd.custo = r2(pd.custo);
    pd.preco = r2(pd.custo * (1 + margem / 100));
    custo += pd.custo * d.quantidade;
  }
  let extrasGerais = 0;
  for (const x of dados.extras_gerais) {
    if (x.valor == null) pend++;
    else extrasGerais += x.valor;
  }
  custo += extrasGerais;
  return { porMovel, porDivisao, porTampo, extrasGerais: r2(extrasGerais), custo: r2(custo), preco: r2(custo * (1 + margem / 100)), pendentes: pend };
}

export const euro = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

/** Perguntas de checklist por móvel (ajudam o desenho e as ferragens). */
export const CHECKLIST: { id: string; l: string; opcoes?: string[] }[] = [
  { id: "dobradica", l: "Dobradiças", opcoes: ["Com amortecimento", "Sem amortecimento", "Push-to-open", "A definir"] },
  { id: "corredica", l: "Corrediças de gaveta", opcoes: ["Ocultas c/ amortecimento", "Laterais de esferas", "Blum Tandem/Movento", "A definir"] },
  { id: "abertura", l: "Sentido de abertura das portas", opcoes: ["Esquerda", "Direita", "Dupla", "A definir"] },
  { id: "costa", l: "Costa", opcoes: ["Encastrada", "Meio fio", "Aplicada", "Sem costa", "A definir"] },
  { id: "montagem", l: "Fixação", opcoes: ["Pés niveladores + rodapé", "Suspenso na parede", "Pousado", "A definir"] },
  { id: "eletro", l: "Electrodoméstico / equipamento integrado" },
  { id: "iluminacao", l: "Iluminação" },
  { id: "obs_desenho", l: "Observações para o desenho" },
];
