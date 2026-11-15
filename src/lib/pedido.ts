export type TipoDivisao = "cozinha" | "quarto" | "wc" | "sala_estar" | "sala_jantar" | "outros";
export type Material = "laminado" | "madeira" | "folheado" | "lacado";
export type Mdf = "normal" | "hidrofugo" | "ignifugo";
export type EstadoPedido = "novo" | "aberto" | "pendente" | "terminado";

export const DIVISOES: { id: TipoDivisao; nome: string; prefixo: string }[] = [
  { id: "cozinha", nome: "Cozinha", prefixo: "Cozinha" },
  { id: "quarto", nome: "Quarto", prefixo: "Quarto" },
  { id: "wc", nome: "WC", prefixo: "WC" },
  { id: "sala_estar", nome: "Sala de Estar", prefixo: "Sala de Estar" },
  { id: "sala_jantar", nome: "Sala de Jantar", prefixo: "Sala de Jantar" },
  { id: "outros", nome: "Outros", prefixo: "Outro" },
];

export const MATERIAIS: { id: Material; nome: string; nota?: string }[] = [
  { id: "laminado", nome: "Laminado" },
  { id: "madeira", nome: "Madeira maciça" },
  { id: "folheado", nome: "Folheado", nota: "MDF + folha de madeira" },
  { id: "lacado", nome: "Lacado", nota: "MDF lacado" },
];

export const MDFS: { id: Mdf; nome: string }[] = [
  { id: "normal", nome: "MDF normal" },
  { id: "hidrofugo", nome: "MDF hidrófugo" },
  { id: "ignifugo", nome: "MDF ignífugo" },
];

export const ESTADOS: Record<EstadoPedido, { nome: string; cor: string }> = {
  novo: { nome: "Novo", cor: "bg-sky-100 text-sky-800" },
  aberto: { nome: "Aberto", cor: "bg-amber-100 text-amber-800" },
  pendente: { nome: "Pendente", cor: "bg-rose-100 text-rose-800" },
  terminado: { nome: "Terminado", cor: "bg-emerald-100 text-emerald-800" },
};

export function precisaMdf(m: Material) {
  return m === "folheado" || m === "lacado";
}

/** Campo do descritivo. Os comuns aparecem em todas as divisões; os específicos por tipo. */
export type CampoDescritivo = {
  id: string;
  label: string;
  ajuda?: string;
  tipo: "texto" | "textarea" | "opcoes";
  opcoes?: string[];
};

export const DESCRITIVO_COMUM: CampoDescritivo[] = [
  { id: "dimensoes", label: "Dimensões totais", ajuda: "Ex.: 3200 x 600 x 2400 mm (largura x profundidade x altura)", tipo: "texto" },
  { id: "n_componentes", label: "Nº de móveis / componentes", ajuda: "Ex.: 3 superiores + 4 inferiores + 1 coluna", tipo: "texto" },
  { id: "tipo_portas", label: "Tipo de portas", tipo: "opcoes", opcoes: ["Batente", "Correr", "Basculante", "Sem portas (aberto)", "Misto", "A definir"] },
  { id: "gavetas", label: "Gavetas", ajuda: "Quantidade e tipo (ex.: 6 gavetas com amortecimento)", tipo: "texto" },
  { id: "puxadores", label: "Tipo de puxadores", tipo: "opcoes", opcoes: ["Puxador exterior", "Gola / perfil", "Push-to-open", "Puxador embutido / fresado", "A definir"] },
  { id: "ferragens", label: "Ferragens pretendidas", ajuda: "Marca/modelo de dobradiças, corrediças, etc., se souber", tipo: "textarea" },
  { id: "acabamento_ref", label: "Cor / referência de acabamento", ajuda: "Ex.: código do laminado, espécie da folha, RAL do lacado", tipo: "texto" },
  { id: "notas", label: "Outras informações", tipo: "textarea" },
];

export const DESCRITIVO_POR_TIPO: Partial<Record<TipoDivisao, CampoDescritivo[]>> = {
  cozinha: [
    { id: "layout", label: "Disposição", tipo: "opcoes", opcoes: ["Linear", "Em L", "Em U", "Paralela", "Com ilha / península", "A definir"] },
    { id: "tampo", label: "Tampo", ajuda: "Material e espessura (ex.: laminado 38 mm, compacto, pedra — fornecido por terceiros?)", tipo: "texto" },
    { id: "eletrodomesticos", label: "Eletrodomésticos a encastrar", ajuda: "Ex.: forno, micro-ondas, frigorífico, máquina loiça, placa, exaustor", tipo: "textarea" },
    { id: "rodape", label: "Rodapé / pés", tipo: "opcoes", opcoes: ["Rodapé com pés niveladores", "Móveis suspensos", "Sem rodapé", "A definir"] },
  ],
  quarto: [
    { id: "roupeiro", label: "Roupeiro", ajuda: "Interior pretendido: varões, prateleiras, gavetas, sapateira…", tipo: "textarea" },
    { id: "outros_moveis", label: "Outros móveis", ajuda: "Cabeceira, mesas-de-cabeceira, cómoda…", tipo: "texto" },
  ],
  wc: [
    { id: "montagem", label: "Montagem do móvel", tipo: "opcoes", opcoes: ["Suspenso", "Pousado no chão", "A definir"] },
    { id: "lavatorio", label: "Lavatório / bancada", ajuda: "Tipo e dimensões (encastrado, pousado, integrado…)", tipo: "texto" },
  ],
  sala_estar: [
    { id: "moveis_sala", label: "Móveis pretendidos", ajuda: "Móvel TV, estante, aparador…", tipo: "textarea" },
  ],
  sala_jantar: [
    { id: "moveis_jantar", label: "Móveis pretendidos", ajuda: "Aparador, cristaleira, mesa…", tipo: "textarea" },
  ],
};

export type FicheiroCarregado = { path: string; nome: string; tamanho: number; mime: string };

export type VarianteDivisao = {
  chave: string;
  tipo: TipoDivisao;
  designacao: string;
  quantidade: number;
  material: Material | "";
  mdf: Mdf | "";
  requer_desenho: boolean | null;
  descritivo: Record<string, string>;
  ficheiros: FicheiroCarregado[];
};

export function letra(i: number) {
  return String.fromCharCode(65 + (i % 26));
}

export type Nivel = "admin" | "orcamentista_chefe" | "orcamentista" | "colaborador";

export const NIVEIS: Record<Nivel, string> = {
  admin: "Administração",
  orcamentista_chefe: "Orçamentista chefe",
  orcamentista: "Orçamentista",
  colaborador: "Colaborador",
};

export const nomeDivisao = (t: string) => DIVISOES.find((d) => d.id === t)?.nome ?? t;
export const nomeMaterial = (m: string | null) => MATERIAIS.find((x) => x.id === m)?.nome ?? m ?? "";
export const nomeMdf = (m: string | null) => MDFS.find((x) => x.id === m)?.nome ?? m ?? "";

export const FORMATO_NUMERO_PROJECTO = /^[0-9]{4,7}\.[0-9]{2}$/;

export type Pedido = {
  id: string;
  referencia: string;
  segmento: string;
  nome_projecto: string;
  identificacao_projecto: string | null;
  contacto_nome: string;
  contacto_email: string | null;
  contacto_telefone: string | null;
  contacto_empresa: string | null;
  observacoes: string | null;
  estado: EstadoPedido;
  numero_projecto: string | null;
  origem: string;
  responsavel: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type Divisao = {
  id: string;
  pedido_id: string;
  ordem: number;
  tipo: TipoDivisao;
  designacao: string;
  quantidade: number;
  material: Material;
  mdf: Mdf | null;
  acabamento: string | null;
  requer_desenho: boolean;
  descritivo: Record<string, string>;
};

export type Ficheiro = {
  id: string;
  divisao_id: string | null;
  storage_path: string;
  nome_original: string;
  tamanho: number | null;
  mime: string | null;
  created_at: string;
};

export type Comentario = { id: string; autor: string; texto: string; resolvido: boolean; created_at: string };

export type Membro = { id: string; nome: string; email: string; nivel: Nivel; ativo: boolean };

export type Permissoes = {
  nivel: Nivel | null;
  pode_editar: boolean;
  pode_gerir: boolean;
  pode_comentar: boolean;
  autorizacao_ate: string | null;
};

export const dataHora = (s: string) =>
  new Date(s).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

export function nomeFicheiroSeguro(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
}
