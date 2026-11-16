"use client";

import { useState, type InputHTMLAttributes } from "react";

const mostrar = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "" : String(v).replace(".", ","));

/**
 * Campo numérico que deixa apagar tudo e escrever à vontade (aceita vírgula ou ponto).
 * Enquanto se escreve, o texto fica como está; o valor só é «arrumado» ao sair do campo.
 * Campo vazio devolve `vazio` (null por defeito).
 */
export default function CampoNumero({
  valor,
  onValor,
  vazio = null,
  ...props
}: {
  valor: number | null | undefined;
  onValor: (v: number | null) => void;
  vazio?: number | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  // enquanto o campo tem o foco, mostra o que se escreve; fora dele, o valor actual
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={txt ?? mostrar(valor)}
      onFocus={(e) => { setTxt(mostrar(valor)); props.onFocus?.(e); }}
      onBlur={(e) => { setTxt(null); props.onBlur?.(e); }}
      onChange={(e) => {
        const s = e.target.value;
        setTxt(s);
        const n = s.trim().replace(/\s/g, "").replace(",", ".");
        if (n === "") onValor(vazio);
        else if (/^-?\d*\.?\d*$/.test(n) && n !== "-" && n !== ".") onValor(Number(n));
      }}
    />
  );
}
