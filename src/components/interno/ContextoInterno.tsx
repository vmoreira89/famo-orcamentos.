"use client";

import { createContext, useContext } from "react";
import type { Nivel } from "@/lib/pedido";

export type PerfilAtual = { id: string; nome: string; email: string; nivel: Nivel; ativo: boolean };

export const ContextoInterno = createContext<PerfilAtual | null>(null);

export function usePerfil(): PerfilAtual {
  const p = useContext(ContextoInterno);
  if (!p) throw new Error("usePerfil fora da área interna");
  return p;
}

export const eOrcamentista = (n: Nivel) => n === "admin" || n === "orcamentista_chefe" || n === "orcamentista";
export const eGestao = (n: Nivel) => n === "admin" || n === "orcamentista_chefe";
