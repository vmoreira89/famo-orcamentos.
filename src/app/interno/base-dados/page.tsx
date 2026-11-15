export default function BaseDados() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold">Base de dados de apoio ao orçamento</h1>
      <p className="mt-3 text-slate-600">Chega na Fase 3. Vai incluir:</p>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-slate-700">
        <li>Ferragens e respectivos fornecedores (ref. fornecedor, fornecedor, ref. interna FAMO)</li>
        <li>Matérias-primas: placas, MDF normal/hidrófugo/ignífugo, folhas de madeira, orlas</li>
        <li>Grupos de laminado com preço por m²</li>
        <li>Tempos de trabalho e custos por posto (custo/minuto)</li>
      </ul>
    </div>
  );
}
