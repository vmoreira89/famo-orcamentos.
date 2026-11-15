import Link from "next/link";

export default function Office() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Office</h1>
      <p className="mt-2 text-slate-600">Esta área está em preparação.</p>
      <Link href="/" className="btn-secundario mt-6">Voltar</Link>
    </div>
  );
}
