import type { Metadata } from "next";
import AssistentePedido from "./AssistentePedido";

export const metadata: Metadata = { title: "Pedir orçamento · FAMO Living" };

export default function PaginaPedido() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">Pedido de orçamento · Living</h1>
      <p className="mt-2 text-slate-600">
        Quanto mais informação nos der, mais rigoroso será o orçamento. Os campos marcados com * são obrigatórios.
      </p>
      <AssistentePedido />
    </div>
  );
}
