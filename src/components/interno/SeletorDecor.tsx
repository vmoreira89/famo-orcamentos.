"use client";

import { useId, useMemo, useRef, useState } from "react";

export type Decor = { referencia: string; descricao: string; grupo: string; amostra?: string | null; cor?: string | null };

/** Quadradinho com a amostra (imagem ou cor) de um decor. */
export function Amostra({ d, tam = 28 }: { d?: Decor | null; tam?: number }) {
  if (!d || (!d.amostra && !d.cor)) return <span className="inline-block shrink-0 rounded border border-dashed border-slate-300 bg-white" style={{ width: tam, height: tam }} title="Sem amostra" />;
  return (
    <span
      className="inline-block shrink-0 rounded border border-slate-300 bg-cover bg-center"
      style={{ width: tam, height: tam, backgroundColor: d.cor ?? undefined, backgroundImage: d.amostra ? `url(${d.amostra})` : undefined }}
      title={`${d.referencia}${d.descricao ? ` · ${d.descricao}` : ""}`}
    />
  );
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "");

/**
 * Referência de laminado: escreve-se para pesquisar, mas só fica gravada uma referência escolhida da lista.
 * A caixa «Referência fora da lista» permite escrever livremente uma referência que (ainda) não existe.
 */
export default function SeletorDecor({ decors, valor, pode, onChange }: { decors: Decor[]; valor: string; pode: boolean; onChange: (ref: string) => void }) {
  const id = useId();
  const existe = useMemo(() => !valor || decors.some((d) => d.referencia === valor), [decors, valor]);
  const [livre, setLivre] = useState(!existe);
  const [texto, setTexto] = useState<string | null>(null); // null = não está a escrever
  const [activo, setActivo] = useState(0);
  const [aviso, setAviso] = useState("");
  const lista = useRef<HTMLUListElement>(null);
  const acabouDeEscolher = useRef(false); // o clique na lista dispara o blur antes de o estado mudar

  const q = norm(texto ?? "");
  const resultados = useMemo(() => {
    if (texto == null) return [];
    const r = q ? decors.filter((d) => norm(d.referencia).includes(q) || norm(d.descricao ?? "").includes(q)) : decors;
    // primeiro as que começam pelo texto escrito
    return [...r].sort((a, b) => Number(!norm(a.referencia).startsWith(q)) - Number(!norm(b.referencia).startsWith(q))).slice(0, 60);
  }, [decors, q, texto]);

  const escolhido = decors.find((d) => d.referencia === valor);
  const desc = escolhido?.descricao;
  const escolher = (ref: string) => {
    acabouDeEscolher.current = true;
    onChange(ref);
    setTexto(null);
    setAviso("");
  };

  if (livre)
    return (
      <div>
        <input className="campo" disabled={!pode} value={valor} placeholder="Referência do fornecedor" onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <CaixaFora id={id} livre pode={pode} onChange={(v) => { setLivre(v); if (!v && valor && !decors.some((d) => d.referencia === valor)) onChange(""); }} />
        {valor && <p className="mt-1 text-xs text-amber-700">Referência fora da lista: sem preço na base de dados, preencha o €/m² nas peças.</p>}
      </div>
    );

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
      {valor && <Amostra d={escolhido} tam={34} />}
      <input
        className="campo"
        disabled={!pode}
        role="combobox"
        aria-expanded={texto != null && resultados.length > 0}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        placeholder="Escreva para pesquisar…"
        value={texto ?? (valor ? `${valor}${desc && desc !== valor ? ` · ${desc}` : ""}` : "")}
        onFocus={() => { setTexto(""); setActivo(0); acabouDeEscolher.current = false; }}
        onChange={(e) => { setTexto(e.target.value); setActivo(0); setAviso(""); acabouDeEscolher.current = false; }}
        onBlur={() => {
          // escrito mas não escolhido: não grava
          if (acabouDeEscolher.current) { acabouDeEscolher.current = false; setTexto(null); return; }
          if (texto) {
            const exacta = decors.find((d) => norm(d.referencia) === norm(texto));
            if (exacta) escolher(exacta.referencia);
            else setAviso("Escolha uma referência da lista (ou marque «Referência fora da lista»).");
          }
          setTexto(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, resultados.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && resultados[activo]) { e.preventDefault(); escolher(resultados[activo].referencia); (e.target as HTMLInputElement).blur(); }
          else if (e.key === "Escape") { setTexto(null); (e.target as HTMLInputElement).blur(); }
        }}
      />
      </div>
      {texto != null && (
        <ul id={`${id}-lista`} ref={lista} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {resultados.length === 0 && <li className="px-3 py-2 text-slate-500">Nenhuma referência encontrada.</li>}
          {resultados.map((d, i) => (
            <li
              key={d.referencia}
              role="option"
              aria-selected={i === activo}
              className={`cursor-pointer px-3 py-1.5 ${i === activo ? "bg-marca-claro" : ""} ${d.referencia === valor ? "font-semibold" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); escolher(d.referencia); (document.activeElement as HTMLElement)?.blur(); }}
              onMouseEnter={() => setActivo(i)}
            >
              <span className="flex items-center gap-2">
                {(d.amostra || d.cor) && <Amostra d={d} tam={18} />}
                <span>
                  {d.referencia}
                  {d.descricao && d.descricao !== d.referencia && <span className="text-slate-500"> · {d.descricao}</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="mt-1 text-xs text-rose-700">{aviso}</p>}
      <CaixaFora id={id} livre={false} pode={pode} onChange={setLivre} />
    </div>
  );
}

function CaixaFora({ id, livre, pode, onChange }: { id: string; livre: boolean; pode: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={`${id}-fora`} className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
      <input id={`${id}-fora`} type="checkbox" disabled={!pode} checked={livre} onChange={(e) => onChange(e.target.checked)} />
      Referência fora da lista
    </label>
  );
}
