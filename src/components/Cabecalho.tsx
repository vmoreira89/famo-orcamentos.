import Link from "next/link";

export default function Cabecalho() {
  return (
    <header className="border-b border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-famo.png" alt="FAMO" className="h-10 w-10" />
          <span className="text-sm font-medium text-slate-600">Orçamentação &amp; Desenho</span>
        </Link>
        <Link href="/login" className="text-sm font-medium text-marca hover:underline">
          Área de colaboradores
        </Link>
      </div>
    </header>
  );
}
