export type TipoCampo = "texto" | "textarea" | "numero" | "bool" | "opcoes" | "fk" | "imagem" | "cor" | "link";

export type Campo = {
  k: string;
  l: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  opcoes?: { v: string; l: string }[];
  fk?: { tabela: string; rotulo: string; ou?: string }; // ou: filtro PostgREST (or) para a lista de opções
  lista?: boolean; // mostrar na tabela
  ajuda?: string;
  sufixo?: string;
};

export type ConfigTabela = {
  id: string;
  nome: string;
  descricao: string;
  campos: Campo[];
  ordem: { col: string; asc?: boolean }[];
  pesquisa: string[];
  limite?: number;
  /** ordenação final no ecrã (depois da leitura), quando a da base de dados não chega */
  ordenar?: (a: Record<string, unknown>, b: Record<string, unknown>) => number;
  /** separadores agrupados: tabelas com o mesmo grupo aparecem como sub-separadores */
  grupo?: string;
  subnome?: string;
  /** tabela na base de dados, quando é diferente do id (várias vistas da mesma tabela) */
  tabela?: string;
  /** filtro fixo desta vista (coluna = valor ou lista de valores) */
  filtro?: Record<string, string | string[]>;
  /** valores fixos dos registos novos desta vista */
  novo?: Record<string, unknown>;
  /** ajuste dos dados antes de gravar */
  aoGuardar?: (d: Record<string, unknown>) => Record<string, unknown>;
};

const RANK_TIPO: Record<string, number> = { placa: 0, orla: 1, orla_laser: 2 };
const largura = (m: unknown) => parseFloat(String(m ?? "").split(/x/i)[0]) || 0;

const CATEGORIAS = [
  ["mdf", "MDF"],
  ["mdf_hidrofugo", "MDF hidrófugo"],
  ["mdf_ignifugo", "MDF ignífugo"],
  ["aglomerado", "Aglomerado"],
  ["laminado", "Laminado"],
  ["termolaminado", "Termolaminado (HPL)"],
  ["folha_madeira", "Folha de madeira"],
  ["madeira_macica", "Madeira maciça"],
  ["orla", "Orla"],
  ["verniz_laca", "Verniz / laca"],
  ["tecido", "Tecido"],
  ["outro", "Outro"],
].map(([v, l]) => ({ v, l }));

const UNIDADES = [
  ["m2", "m²"],
  ["ml", "m linear"],
  ["m3", "m³"],
  ["un", "unidade"],
  ["kg", "kg"],
  ["l", "litro"],
  ["jg", "jogo"],
].map(([v, l]) => ({ v, l }));

const fornecedor: Campo = { k: "fornecedor_id", l: "Fornecedor", tipo: "fk", fk: { tabela: "fornecedores", rotulo: "nome" }, lista: true };
const ativo: Campo = { k: "ativo", l: "Activo", tipo: "bool", lista: true };
const notas: Campo = { k: "notas", l: "Notas", tipo: "textarea" };

export const TABELAS: ConfigTabela[] = [
  {
    id: "materias_primas",
    nome: "Matérias-primas",
    grupo: "Matérias-primas",
    subnome: "Gerais (MDF, aglomerado, folhas…)",
    descricao: "Placas, MDF, aglomerado, folhas de madeira, orlas… Preço por unidade de medida (normalmente €/m²).",
    ordem: [{ col: "categoria" }, { col: "espessura_mm" }],
    pesquisa: ["descricao", "codigo_famo", "ref_fornecedor"],
    campos: [
      { k: "codigo_famo", l: "Código FAMO", tipo: "texto", lista: true },
      { k: "descricao", l: "Descrição", tipo: "texto", obrigatorio: true, lista: true },
      { k: "categoria", l: "Categoria", tipo: "opcoes", opcoes: CATEGORIAS, obrigatorio: true, lista: true },
      { k: "espessura_mm", l: "Espessura", tipo: "numero", sufixo: "mm", lista: true },
      { k: "formato", l: "Formato da placa", tipo: "texto", ajuda: "Ex.: 2800x2070" },
      { k: "unidade", l: "Unidade", tipo: "opcoes", opcoes: UNIDADES, obrigatorio: true },
      { k: "preco", l: "Preço", tipo: "numero", sufixo: "€", lista: true, ajuda: "Preço de tabela, antes de desconto" },
      { k: "desconto_pct", l: "Desconto habitual", tipo: "numero", sufixo: "%", lista: true },
      fornecedor,
      { k: "ref_fornecedor", l: "Ref. fornecedor", tipo: "texto" },
      notas,
      ativo,
    ],
  },
  {
    id: "precos_placas",
    tabela: "precos_grupo_laminado",
    filtro: { tipo: "placa" },
    novo: { tipo: "placa" },
    nome: "Laminados: placas",
    grupo: "Matérias-primas",
    subnome: "Laminados: placas (€/m²)",
    descricao: "Preço das placas laminadas por referência e espessura, em €/m²: à placa (base das contas), à palete e ao camião (escolha no fim do orçamento).",
    ordem: [{ col: "espessura_mm" }],
    ordenar: (a, b) => Number(a.espessura_mm) - Number(b.espessura_mm),
    pesquisa: ["notas"],
    campos: [
      {
        k: "acabamento_id",
        l: "Referência (decor)",
        tipo: "fk",
        fk: { tabela: "acabamentos", rotulo: "referencia", ou: "tipo.ilike.lam%,tipo.ilike.termolam%" },
        lista: true,
        obrigatorio: true,
      },
      { k: "espessura_mm", l: "Espessura", tipo: "numero", sufixo: "mm", obrigatorio: true, lista: true },
      { k: "preco_m2", l: "Preço m² placa", tipo: "numero", sufixo: "€/m²", lista: true, ajuda: "Base das contas do orçamento." },
      { k: "preco_m2_palete", l: "Preço m² palete", tipo: "numero", sufixo: "€/m²", lista: true, ajuda: "Vazio = usa o preço à placa." },
      { k: "preco_m2_camiao", l: "Preço m² camião", tipo: "numero", sufixo: "€/m²", lista: true, ajuda: "Vazio = usa o preço à placa." },
      { k: "notas", l: "Notas", tipo: "texto", lista: true },
    ],
  },
  {
    id: "precos_orlas",
    tabela: "precos_grupo_laminado",
    filtro: { tipo: ["orla", "orla_laser"] },
    novo: { tipo: "orla" },
    nome: "Laminados: orlas",
    grupo: "Matérias-primas",
    subnome: "Laminados: orlas (€/ml)",
    descricao: "Preço das orlas por referência e medida (largura x espessura), em € por metro linear.",
    ordem: [{ col: "tipo" }, { col: "medida" }],
    ordenar: (a, b) => (RANK_TIPO[String(a.tipo)] ?? 9) - (RANK_TIPO[String(b.tipo)] ?? 9) || largura(a.medida) - largura(b.medida) || Number(a.espessura_mm) - Number(b.espessura_mm),
    pesquisa: ["notas", "medida"],
    // a espessura da orla tira-se da medida (ex.: 23x2 → 2 mm)
    aoGuardar: (d) => ({ ...d, espessura_mm: parseFloat(String(d.medida ?? "").split(/x/i)[1]?.replace(",", ".") ?? "") || d.espessura_mm || 2 }),
    campos: [
      {
        k: "acabamento_id",
        l: "Referência (decor)",
        tipo: "fk",
        fk: { tabela: "acabamentos", rotulo: "referencia", ou: "tipo.ilike.lam%,tipo.ilike.termolam%" },
        lista: true,
        obrigatorio: true,
      },
      {
        k: "tipo",
        l: "Tipo",
        tipo: "opcoes",
        obrigatorio: true,
        lista: true,
        opcoes: [
          { v: "orla", l: "Orla" },
          { v: "orla_laser", l: "Orla laser" },
        ],
      },
      { k: "medida", l: "Medida", tipo: "texto", obrigatorio: true, lista: true, ajuda: "Largura x espessura em mm, ex.: 23x2" },
      { k: "preco_m2", l: "Preço", tipo: "numero", sufixo: "€/ml", lista: true },
      { k: "notas", l: "Notas", tipo: "texto", lista: true },
    ],
  },
  {
    id: "acabamentos",
    nome: "Acabamentos",
    descricao: "Lista de acabamentos FAMO. Usar sempre a referência, nunca o código interno.",
    ordem: [{ col: "referencia" }],
    pesquisa: ["codigo", "referencia", "descricao", "tipo"],
    limite: 300,
    campos: [
      { k: "codigo", l: "Código", tipo: "texto", obrigatorio: true, lista: true },
      { k: "referencia", l: "Referência", tipo: "texto", lista: true },
      { k: "descricao", l: "Descrição", tipo: "texto", lista: true },
      { k: "tipo", l: "Tipo", tipo: "texto", lista: true },
      { k: "categoria", l: "Categoria", tipo: "texto" },
      { k: "amostra", l: "Amostra", tipo: "imagem", lista: true, ajuda: "Imagem do decor (é reduzida para 256 px). Usada no orçamento e para pintar as perspectivas dos desenhos." },
      { k: "cor", l: "Cor aproximada", tipo: "cor", lista: true, ajuda: "Usada nos desenhos quando não há amostra (ex.: lacados)." },
      { k: "observacoes", l: "Observações", tipo: "textarea" },
      ativo,
    ],
  },
  {
    id: "ferragens",
    nome: "Ferragens",
    descricao: "Catálogo por ref. FAMO, fornecedor e ref. do fornecedor.",
    ordem: [{ col: "categoria" }, { col: "descricao" }],
    pesquisa: ["descricao", "ref_famo", "ref_fornecedor", "categoria"],
    campos: [
      { k: "ref_famo", l: "Ref. FAMO", tipo: "texto", lista: true },
      { k: "descricao", l: "Descrição", tipo: "texto", obrigatorio: true, lista: true },
      { k: "categoria", l: "Categoria", tipo: "texto", lista: true },
      fornecedor,
      { k: "ref_fornecedor", l: "Ref. fornecedor", tipo: "texto", lista: true },
      { k: "unidade", l: "Unidade", tipo: "opcoes", opcoes: UNIDADES, obrigatorio: true },
      { k: "preco", l: "Preço", tipo: "numero", sufixo: "€", lista: true },
      { k: "url", l: "Página do produto", tipo: "link", lista: true },
      { k: "cad_url", l: "Link CAD (DXF/STEP)", tipo: "link" },
      notas,
      ativo,
    ],
  },
  {
    id: "fornecedores",
    nome: "Fornecedores",
    descricao: "Fornecedores de matérias-primas e ferragens.",
    ordem: [{ col: "nome" }],
    pesquisa: ["nome", "tipo", "contacto", "email"],
    campos: [
      { k: "nome", l: "Nome", tipo: "texto", obrigatorio: true, lista: true },
      { k: "tipo", l: "Tipo", tipo: "texto", lista: true },
      { k: "contacto", l: "Pessoa de contacto", tipo: "texto", lista: true },
      { k: "email", l: "Email", tipo: "texto", lista: true },
      { k: "telefone", l: "Telefone", tipo: "texto" },
      { k: "website", l: "Website", tipo: "texto" },
      notas,
      ativo,
    ],
  },
  {
    id: "postos_trabalho",
    nome: "Postos e custos",
    descricao: "Postos de trabalho (centros de trabalho da DBOM). Custo vazio = usa o custo por minuto geral.",
    ordem: [{ col: "codigo" }],
    pesquisa: ["codigo", "nome"],
    campos: [
      { k: "codigo", l: "Código", tipo: "texto", obrigatorio: true, lista: true },
      { k: "nome", l: "Nome", tipo: "texto", obrigatorio: true, lista: true },
      { k: "custo_minuto", l: "Custo por minuto", tipo: "numero", sufixo: "€/min", lista: true },
      { k: "notas", l: "Notas", tipo: "texto", lista: true },
      ativo,
    ],
  },
  {
    id: "parametros",
    nome: "Parâmetros",
    descricao: "Valores gerais usados nos cálculos dos orçamentos.",
    ordem: [{ col: "chave" }],
    pesquisa: ["chave", "descricao"],
    campos: [
      { k: "chave", l: "Parâmetro", tipo: "texto", obrigatorio: true, lista: true },
      { k: "valor", l: "Valor", tipo: "numero", obrigatorio: true, lista: true },
      { k: "unidade", l: "Unidade", tipo: "texto", lista: true },
      { k: "descricao", l: "Descrição", tipo: "texto", lista: true },
    ],
  },
];
