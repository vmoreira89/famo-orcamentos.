"use client";

import AssistentePedido from "@/app/living/pedido/AssistentePedido";
import { eOrcamentista, usePerfil } from "@/components/interno/ContextoInterno";

export default function NovoPedidoInterno() {
  const perfil = usePerfil();
  if (!eOrcamentista(perfil.nivel))
    return <p className="p-10 text-center text-slate-500">O seu nível de acesso não permite abrir orçamentos.</p>;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Abrir orçamento</h1>
      <p className="mt-1 text-sm text-slate-600">
        Mesmo questionário dos pedidos de clientes. O pedido fica registado como criado internamente, em seu nome.
      </p>
      <AssistentePedido interno />
    </div>
  );
}
