import Link from "next/link";

export default function Inicio() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">Que tipo de serviço procura?</h1>
      <p className="mt-2 text-slate-600">Escolha a área para pedir um orçamento ou aceder à plataforma.</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="cartao relative p-6 opacity-60">
          <span className="absolute right-4 top-4 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
            Brevemente
          </span>
          <h2 className="text-xl font-semibold">Office</h2>
          <p className="mt-2 text-sm text-slate-600">Mobiliário de escritório. Esta área ainda não está disponível.</p>
        </div>

        <Link href="/living" className="cartao group p-6 transition hover:border-marca hover:shadow-md">
          <h2 className="text-xl font-semibold group-hover:text-marca">Living</h2>
          <p className="mt-2 text-sm text-slate-600">
            Cozinhas, quartos, WC, salas e outros projectos à medida.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-marca">Entrar →</span>
        </Link>
      </div>
    </div>
  );
}
