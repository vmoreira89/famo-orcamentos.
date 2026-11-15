import Link from "next/link";

export default function Cabecalho() {
  return (
    <header className="border-b border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="rounded bg-marca px-2 py-1 text-sm font-bold tracking-widest text-white">FAMO</span>
          <span className="text-sm font-medium text-slate-600">Orçamentação &amp; Desenho</span>
        </Link>
        <Link href="/login" className="text-sm font-medium text-marca hover:underline">
          Área de colaboradores
        </Link>
      </div>
    </header>
  );
}
