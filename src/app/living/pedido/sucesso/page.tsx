import Link from "next/link";

export default async function Sucesso({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="cartao p-8">
        <p className="text-4xl">✓</p>
        <h1 className="mt-2 text-2xl font-bold">Pedido enviado</h1>
        {ref && (
          <p className="mt-3 text-slate-700">
            A referência do seu pedido é <strong className="font-mono">{ref}</strong>. Guarde-a para futuros contactos.
          </p>
        )}
        <p className="mt-2 text-slate-600">A nossa equipa de orçamentação vai analisar o pedido e entrará em contacto consigo.</p>
        <Link href="/" className="btn-secundario mt-6">Voltar ao início</Link>
      </div>
    </div>
  );
}
