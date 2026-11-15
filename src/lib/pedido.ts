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
