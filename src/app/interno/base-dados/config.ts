export type TipoCampo = "texto" | "textarea" | "numero" | "bool" | "opcoes" | "fk";

export type Campo = {
  k: string;
  l: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  opcoes?: { v: string; l: string }[];
  fk?: { tabela: string; rotulo: string };
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
};

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
    id: "grupos_laminado",
    nome: "Grupos de laminado",
    descricao: "Cada acabamento laminado pertence a um grupo; o grupo define o preço por m² (ver Preços por grupo).",
    ordem: [{ col: "codigo" }],
    pesquisa: ["codigo", "descricao"],
    campos: [
      { k: "codigo", l: "Grupo", tipo: "texto", obrigatorio: true, lista: true },
      { k: "descricao", l: "Descrição", tipo: "texto", lista: true },
      notas,
      ativo,
    ],
  },
  {
    id: "precos_grupo_laminado",
    nome: "Preços por grupo",
    descricao: "Preço por m² de cada grupo de laminado, por espessura.",
    ordem: [{ col: "grupo_id" }, { col: "espessura_mm" }],
    pesquisa: ["notas"],
    campos: [
      { k: "grupo_id", l: "Grupo", tipo: "fk", fk: { tabela: "grupos_laminado", rotulo: "codigo" }, obrigatorio: true, lista: true },
      { k: "espessura_mm", l: "Espessura", tipo: "numero", sufixo: "mm", obrigatorio: true, lista: true },
      { k: "preco_m2", l: "Preço", tipo: "numero", sufixo: "€/m²", lista: true },
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
      { k: "grupo_id", l: "Grupo de laminado", tipo: "fk", fk: { tabela: "grupos_laminado", rotulo: "codigo" }, lista: true },
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
      { k: "cad_url", l: "Link CAD (DXF/STEP)", tipo: "texto" },
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
    id: "escaloes_desconto",
    nome: "Descontos",
    descricao: "Escalões de desconto por fornecedor.",
    ordem: [{ col: "fornecedor_id" }, { col: "desconto_pct" }],
    pesquisa: ["descricao"],
    campos: [
      { ...fornecedor },
      { k: "descricao", l: "Escalão", tipo: "texto", obrigatorio: true, lista: true },
      { k: "qtd_min", l: "Qtd. mínima", tipo: "numero", lista: true },
      { k: "qtd_max", l: "Qtd. máxima", tipo: "numero", lista: true },
      { k: "desconto_pct", l: "Desconto", tipo: "numero", sufixo: "%", obrigatorio: true, lista: true },
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
