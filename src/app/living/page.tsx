import Link from "next/link";

export default function Living() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Link href="/" className="text-sm text-slate-500 hover:underline">← Início</Link>
      <h1 className="mt-2 text-3xl font-bold">Living</h1>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Link href="/living/pedido" className="cartao group p-6 transition hover:border-marca hover:shadow-md">
          <h2 className="text-xl font-semibold group-hover:text-marca">Pedir orçamento</h2>
          <p className="mt-2 text-sm text-slate-600">
            Sem registo. Responda a algumas perguntas sobre o seu projecto e envie-nos os ficheiros que tiver.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-marca">Começar →</span>
        </Link>
        <Link href="/login" className="cartao group p-6 transition hover:border-marca hover:shadow-md">
          <h2 className="text-xl font-semibold group-hover:text-marca">Login</h2>
          <p className="mt-2 text-sm text-slate-600">Exclusivo para colaboradores FAMO: trabalhar nos orçamentos pedidos.</p>
          <span className="mt-4 inline-block text-sm font-semibold text-marca">Entrar →</span>
        </Link>
      </div>
    </div>
  );
}
