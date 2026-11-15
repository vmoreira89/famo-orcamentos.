"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Janela para confirmar uma alteração. O motivo é sempre obrigatório
 * e fica guardado no histórico.
 */
export default function DialogoMotivo({
  aberto,
  titulo,
  descricao,
  motivoPadrao = "",
  textoConfirmar = "Confirmar",
  children,
  podeConfirmar = true,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  motivoPadrao?: string;
  textoConfirmar?: string;
  children?: React.ReactNode;
  podeConfirmar?: boolean;
  onFechar: () => void;
  onConfirmar: (motivo: string) => Promise<string | null>;
}) {
  const [motivo, setMotivo] = useState(motivoPadrao);
  const [erro, setErro] = useState("");
  const [aGuardar, setAGuardar] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      setMotivo(motivoPadrao);
      setErro("");
      d.showModal();
    }
    if (!aberto && d.open) d.close();
  }, [aberto, motivoPadrao]);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) {
      setErro("Indique o motivo da alteração.");
      return;
    }
    setAGuardar(true);
    const r = await onConfirmar(motivo.trim());
    setAGuardar(false);
    if (r) setErro(r);
    else onFechar();
  }

  return (
    <dialog
      ref={ref}
      onClose={onFechar}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={confirmar} className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {descricao && <p className="text-sm text-slate-600">{descricao}</p>}
        {children}
        <div>
          <label className="rotulo" htmlFor="motivo-alteracao">Motivo *</label>
          <textarea
            id="motivo-alteracao"
            rows={2}
            className="campo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Porque está a fazer esta alteração?"
          />
          <p className="mt-1 text-xs text-slate-500">Fica registado no histórico, com o seu nome e a data.</p>
        </div>
        {erro && <p role="alert" className="text-sm text-rose-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={onFechar}>Cancelar</button>
          <button className="btn-primario" disabled={aGuardar || !podeConfirmar}>
            {aGuardar ? "A guardar…" : textoConfirmar}
          </button>
        </div>
      </form>
    </dialog>
  );
}
