/**
 * Motor de orçamentação: gera móveis a partir do pedido, decompõe cada móvel
 * em peças, ferragens e operações, atribui códigos e calcula custos.
 *
 * Os preços usados ficam guardados em cada linha (instantâneo). Alterar
 * preços ou parâmetros na base de dados não mexe num orçamento já guardado;
 * só "Actualizar preços" (quando o orçamento ainda é editável) os volta a ler.
 */
import type { Divisao, Material, Mdf, TipoDivisao } from "./pedido";

/* ------------------------------------------------------------------ tipos */

export type TipoMovel = "inferior" | "superior" | "coluna" | "gaveteiro" | "roupeiro" | "estante" | "wc" | "outro";

export const TIPOS_MOVEL: Record<TipoMovel, { nome: string; ref: string; L: number; A: number; P: number; pes: boolean }> = {
  inferior: { nome: "Móvel inferior", ref: "INF", L: 600, A: 720, P: 560, pes: true },
  superior: { nome: "Móvel superior", ref: "SUP", L: 600, A: 720, P: 320, pes: false },
  coluna: { nome: "Coluna", ref: "COL", L: 600, A: 2100, P: 560, pes: true },
  gaveteiro: { nome: "Gaveteiro", ref: "GAV", L: 600, A: 720, P: 560, pes: true },
  roupeiro: { nome: "Roupeiro", ref: "ROU", L: 1000, A: 2400, P: 600, pes: true },
  estante: { nome: "Estante / aberto", ref: "EST", L: 800, A: 1800, P: 350, pes: false },
  wc: { nome: "Móvel WC", ref: "WC", L: 800, A: 500, P: 450, pes: false },
  outro: { nome: "Outro", ref: "MOV", L: 600, A: 720, P: 500, pes: false },
};

/** Como se obtém o preço de uma superfície (corpo ou frentes). */
export type EspecMaterial = {
  material: Material; // laminado | madeira | folheado | lacado
  mdf: Mdf | "";
  acabamento: string; // referência do decor / folha / cor
  grupo: string; // grupo de laminado (código), quando laminado
  extra_m2: number | null; // folheado: folha €/m²; lacado: lacagem €/m²; madeira: €/m² (manual)
};

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
  preco_orla_ml: number | null;
  nota: string; // ex.: folha de madeira a usar
  codigo?: string;
  codigo_sub?: string;
};

export type LinhaFerragem = { id: string; ref_famo: string | null; descricao: string; qtd: number; preco: number | null; unidade?: string };
export type LinhaOperacao = { id: string; posto: string; descricao: string; minutos: number; custo_minuto: number | null };
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
  codigo?: string;
};

export type DadosOrcamento = { moveis: Movel[]; extras_gerais: LinhaExtra[] };

export type Parametros = { custo_minuto: number; desperdicio_pct: number; orla_preco_ml: number };

/** Dados da base de dados necessários para preços. */
export type Catalogo = {
  parametros: Parametros;
  gruposPreco: { grupo: string; acabamento: string | null; tipo: string; espessura: number; medida: string | null; preco: number | null }[];
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

export function precoPlaca(cat: Catalogo, esp: EspecMaterial, e: number): { m2: number | null; extra: number | null; nota: string } {
  if (esp.material === "laminado") {
    const ref = norm(esp.acabamento || "");
    const grupo = esp.grupo || cat.acabamentoGrupo[ref] || "";
    const especifico = cat.gruposPreco.find((p) => p.tipo === "placa" && p.acabamento && norm(p.acabamento) === ref && p.espessura === e);
    const doGrupo = cat.gruposPreco.find((p) => p.tipo === "placa" && !p.acabamento && p.grupo === grupo && p.espessura === e);
    return { m2: especifico?.preco ?? doGrupo?.preco ?? null, extra: null, nota: "" };
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
  const grupo = esp.grupo || cat.acabamentoGrupo[ref] || "";
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

export function especDaDivisao(d: Divisao): EspecMaterial {
  return { material: d.material, mdf: d.mdf ?? "", acabamento: d.descritivo?.acabamento_ref ?? d.acabamento ?? "", grupo: "", extra_m2: null };
}

export function novoMovel(divisao: Divisao, tipo: TipoMovel, indice: number): Movel {
  const t = TIPOS_MOVEL[tipo];
  const esp = especDaDivisao(divisao);
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
    corpo: { ...esp },
    frente: { ...esp },
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

export function decompor(m: Movel, cat: Catalogo): Movel {
  const e = 19;
  const L = m.L, A = m.A, P = m.P;
  const interior = L - 2 * e;
  const pc = precoPlaca(cat, m.corpo, e);
  const pf = precoPlaca(cat, m.frente, e);
  const pcosta = precoPlaca(cat, { ...m.corpo }, m.costa_e);
  const orlaC = precoOrla(cat, m.corpo);
  const orlaF = precoOrla(cat, m.frente);
  const facesC = m.corpo.material === "folheado" || m.corpo.material === "lacado" ? 2 : 0;
  const facesF = m.frente.material === "folheado" || m.frente.material === "lacado" ? 2 : 0;

  const peca = (p: Partial<Peca> & Pick<Peca, "designacao" | "c" | "l">): Peca => {
    const sup = p.sup ?? "corpo";
    const base = sup === "frente" ? pf : sup === "costa" ? pcosta : pc;
    return {
      id: uid(),
      qtd: 1,
      e,
      sup,
      oc: 2,
      ol: 2,
      subconjunto: "",
      preco_m2: base.m2,
      preco_extra_m2: sup === "costa" ? null : base.extra,
      faces_extra: sup === "frente" ? facesF : sup === "costa" ? 0 : facesC,
      preco_orla_ml: sup === "frente" ? orlaF : orlaC,
      nota: base.nota,
      ...p,
    };
  };

  const pecas: Peca[] = [];
  const ehAberto = m.tipo === "estante";
  pecas.push(peca({ designacao: "Lado esquerdo", c: A, l: P }));
  pecas.push(peca({ designacao: "Lado direito", c: A, l: P }));
  pecas.push(peca({ designacao: "Fundo", c: interior, l: P }));
  if (m.tipo === "inferior" || m.tipo === "gaveteiro") {
    pecas.push(peca({ designacao: "Travessa superior", qtd: 2, c: interior, l: 100 }));
  } else {
    pecas.push(peca({ designacao: "Cúpula", c: interior, l: P }));
  }
  if (!ehAberto || m.costa_e > 0) {
    pecas.push(peca({ designacao: "Costa", c: interior + 16, l: A - 2 * e + 16, e: m.costa_e, sup: "costa" }));
  }
  if (m.prateleiras > 0) {
    pecas.push(peca({ designacao: "Prateleira", qtd: m.prateleiras, c: interior - 2, l: P - 20 - m.costa_e }));
  }
  if (m.tipo === "roupeiro") {
    pecas.push(peca({ designacao: "Divisória vertical", c: A - 2 * e, l: P - 20 - m.costa_e }));
  }

  // Frentes: gavetas e portas
  const folga = 3;
  const altGaveta = m.gavetas > 0 ? (m.portas > 0 ? 180 : Math.floor((A - folga * (m.gavetas + 1)) / m.gavetas)) : 0;
  const altPortas = m.portas > 0 ? A - (m.gavetas > 0 ? m.gavetas * (altGaveta + folga) : 0) - folga * 2 : 0;
  for (let g = 1; g <= m.gavetas; g++) {
    const sub = `Gaveta ${g}`;
    pecas.push(peca({ designacao: `Frente gaveta ${g}`, c: L - 2 * folga, l: altGaveta, sup: "frente", subconjunto: sub }));
    pecas.push(peca({ designacao: `Fundo gaveta ${g}`, c: interior - 30, l: P - 60, e: 16, subconjunto: sub, faces_extra: 0, preco_extra_m2: null }));
    pecas.push(peca({ designacao: `Traseira gaveta ${g}`, c: interior - 30, l: Math.max(80, altGaveta - 60), e: 16, subconjunto: sub, faces_extra: 0, preco_extra_m2: null }));
  }
  if (m.portas > 0 && m.tipo_porta !== "Correr") {
    const larg = m.portas === 1 ? L - 2 * folga : Math.floor((L - folga * (m.portas + 1)) / m.portas);
    pecas.push(peca({ designacao: m.portas === 1 ? "Porta" : "Porta batente", qtd: m.portas, c: altPortas, l: larg, sup: "frente" }));
  } else if (m.portas > 0) {
    const larg = Math.floor(L / m.portas) + 30;
    pecas.push(peca({ designacao: "Porta de correr", qtd: m.portas, c: A - 40, l: larg, sup: "frente" }));
  }
  if (TIPOS_MOVEL[m.tipo].pes) {
    pecas.push(peca({ designacao: "Rodapé", c: L, l: 100, sup: "frente" }));
  }

  // Ferragens
  const fs: LinhaFerragem[] = [];
  if (m.portas > 0 && m.tipo_porta !== "Correr") {
    const porPorta = altPortas <= 900 ? 2 : altPortas <= 1600 ? 3 : 4;
    fs.push(ferr(cat, "03.2.387.01", m.portas * porPorta));
    fs.push(ferr(cat, "03.2.501.01", m.portas * porPorta));
  }
  if (m.portas > 0 && m.tipo_porta === "Correr") fs.push(ferr(cat, "03.2.342.01", m.portas, "Jogo por porta (correr)"));
  if (m.gavetas > 0) {
    fs.push(ferr(cat, "03.7.278.01", m.gavetas)); // par de corrediças
  }
  const frentes = m.portas + m.gavetas;
  const pux = (m.puxador || "").toLowerCase();
  if (frentes > 0) {
    if (pux.includes("push")) fs.push(ferr(cat, "03.2.519.18", frentes));
    else if (!pux.includes("gola") && !pux.includes("embutido")) fs.push(ferr(cat, null, frentes, "Puxador (genérico de orçamento)"));
  }
  if (m.prateleiras > 0) fs.push(ferr(cat, "03.2.187.01", m.prateleiras * 4));
  fs.push(ferr(cat, null, 4, "Minifix completo (genérico de orçamento)"));
  fs.push(ferr(cat, "03.1.912.01", 8));
  fs.push(ferr(cat, "04.2.020", 4));
  if (TIPOS_MOVEL[m.tipo].pes) {
    fs.push(ferr(cat, "03.6.432.01", 4));
    fs.push(ferr(cat, "03.6.433.01", 4));
    fs.push(ferr(cat, "03.2.761.01", 1));
  }
  if (m.tipo === "roupeiro") fs.push(ferr(cat, "03.2.401.01", 2, "Suporte varão"));

  // Operações (minutos por posto)
  const nPecas = pecas.reduce((s, p) => s + p.qtd, 0);
  const orlaMl = pecas.reduce((s, p) => { const a = arestasOrla(p); return s + (p.qtd * ((Number(a[0]) + Number(a[1])) * p.c + (Number(a[2]) + Number(a[3])) * p.l)) / 1000; }, 0);
  const op = (posto: string, descricao: string, minutos: number): LinhaOperacao => ({
    id: uid(),
    posto,
    descricao: cat.postos[posto]?.nome ?? descricao,
    minutos: r2(minutos),
    custo_minuto: cat.postos[posto]?.custo_minuto ?? cat.parametros.custo_minuto,
  });
  const ops: LinhaOperacao[] = [
    op("L70SEC.01", "Corte", nPecas * 1.0),
    op("ORLADORA", "Orladora", orlaMl * 0.6),
    op("L40MULTI.01", "Furação / CNC", nPecas * 1.5),
    ...(m.gavetas > 0 ? [op("L13MONT.01", "Pré-montagem gavetas", m.gavetas * 8)] : []),
    op("L10MONT.02", "Montagem", 20 + m.portas * 5 + m.gavetas * 6),
    op("88MES.10", "Embalagem", 5),
  ];

  return { ...m, pecas, ferragens: fs, operacoes: ops };
}

/** Volta a ler os preços da base de dados para as linhas existentes (mantém quantidades e medidas). */
export function actualizarPrecos(m: Movel, cat: Catalogo): Movel {
  const pecas = m.pecas.map((p) => {
    if (p.sup === "manual") return p;
    const esp = p.sup === "frente" ? m.frente : m.corpo;
    const pr = precoPlaca(cat, esp, p.e);
    return { ...p, preco_m2: pr.m2, preco_extra_m2: p.faces_extra > 0 ? pr.extra : p.preco_extra_m2, preco_orla_ml: precoOrla(cat, esp), nota: pr.nota || p.nota };
  });
  const ferragens = m.ferragens.map((f) => (f.ref_famo && cat.ferragens[f.ref_famo] ? { ...f, preco: cat.ferragens[f.ref_famo].preco } : f));
  const operacoes = m.operacoes.map((o) => ({ ...o, custo_minuto: cat.postos[o.posto]?.custo_minuto ?? cat.parametros.custo_minuto }));
  return { ...m, pecas, ferragens, operacoes };
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
    const marcenaria = m.frente.material === "folheado" || m.frente.material === "madeira" ? "33.4" : "13.4";
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
        ...(p.subconjunto ? { codigo_sub: `${marcenaria}.${subs.indexOf(p.subconjunto) + 1}${m.ref}${suf}` } : {}),
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
  const extra = p.faces_extra > 0 ? (p.preco_extra_m2 == null ? null : area * p.faces_extra * p.preco_extra_m2) : 0;
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
  for (const o of m.operacoes) {
    const cm = o.custo_minuto ?? par.custo_minuto;
    mao += o.minutos * cm;
  }
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
  return { porMovel, porDivisao, extrasGerais: r2(extrasGerais), custo: r2(custo), preco: r2(custo * (1 + margem / 100)), pendentes: pend };
}

export const euro = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

/** Perguntas de checklist por móvel (ajudam o desenho e as ferragens). */
export const CHECKLIST: { id: string; l: string; opcoes?: string[] }[] = [
  { id: "dobradica", l: "Dobradiças", opcoes: ["Com amortecimento", "Sem amortecimento", "Push-to-open", "A definir"] },
  { id: "corredica", l: "Corrediças de gaveta", opcoes: ["Ocultas c/ amortecimento", "Laterais de esferas", "Blum Tandem/Movento", "A definir"] },
  { id: "abertura", l: "Sentido de abertura das portas", opcoes: ["Esquerda", "Direita", "Dupla", "A definir"] },
  { id: "costa", l: "Costa", opcoes: ["Encastrada", "Aplicada", "Sem costa", "A definir"] },
  { id: "montagem", l: "Fixação", opcoes: ["Pés niveladores + rodapé", "Suspenso na parede", "Pousado", "A definir"] },
  { id: "eletro", l: "Electrodoméstico / equipamento integrado" },
  { id: "iluminacao", l: "Iluminação" },
  { id: "obs_desenho", l: "Observações para o desenho" },
];
