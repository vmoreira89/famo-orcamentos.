"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function Registo() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);

  async function registar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) return setErro("Indique o seu nome.");
    if (pw.length < 8) return setErro("A palavra-passe tem de ter pelo menos 8 caracteres.");
    if (pw !== pw2) return setErro("As palavras-passe não coincidem.");
    setAEnviar(true);
    const { error } = await supabase().auth.signUp({
      email: email.trim(),
      password: pw,
      options: { data: { nome: nome.trim() }, emailRedirectTo: `${window.location.origin}/login` },
    });
    setAEnviar(false);
    if (error) {
      setErro(
        error.message.includes("Signups not allowed")
          ? "O registo está desligado de momento. Contacte a administração."
          : error.message.includes("already registered")
            ? "Já existe uma conta com este email."
            : error.message,
      );
      return;
    }
    await supabase().auth.signOut();
    setFeito(true);
  }

  if (feito)
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="cartao space-y-3 p-6 text-center">
          <h1 className="text-xl font-bold">Pedido de acesso enviado</h1>
          <p className="text-sm text-slate-600">
            Enviámos um email para <strong>{email}</strong> para confirmar o endereço. Depois de confirmar, a administração vai analisar o pedido
            e atribuir-lhe um nível de acesso. Até lá, ao entrar verá a indicação «conta a aguardar activação».
          </p>
          <Link href="/login" className="btn-secundario">Ir para o login</Link>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <form onSubmit={registar} className="cartao space-y-4 p-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-famo.png" alt="FAMO" className="h-12 w-12" />
          <h1 className="text-xl font-bold">Pedir acesso</h1>
        </div>
        <p className="text-sm text-slate-600">Só para colaboradores FAMO. O acesso fica activo depois de aprovado pela administração.</p>
        <div>
          <label className="rotulo" htmlFor="r-nome">Nome</label>
          <input id="r-nome" className="campo" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label className="rotulo" htmlFor="r-email">Email</label>
          <input id="r-email" type="email" autoComplete="email" required className="campo" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="rotulo" htmlFor="r-pw">Palavra-passe</label>
          <input id="r-pw" type="password" autoComplete="new-password" required className="campo" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div>
          <label className="rotulo" htmlFor="r-pw2">Repetir palavra-passe</label>
          <input id="r-pw2" type="password" autoComplete="new-password" required className="campo" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {erro && <p role="alert" className="text-sm text-rose-700">{erro}</p>}
        <button className="btn-primario w-full" disabled={aEnviar}>{aEnviar ? "A enviar…" : "Pedir acesso"}</button>
        <p className="text-center text-sm"><Link href="/login" className="text-marca hover:underline">Já tenho conta</Link></p>
      </form>
    </div>
  );
}
