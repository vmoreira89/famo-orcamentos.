"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");
  const [aEntrar, setAEntrar] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setAEntrar(true);
    setErro("");
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setAEntrar(false);
    if (error) {
      setErro(error.message === "Invalid login credentials" ? "Email ou palavra-passe incorrectos." : error.message);
      return;
    }
    router.push("/interno");
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <form onSubmit={entrar} className="cartao space-y-4 p-6">
        <h1 className="text-xl font-bold">Área de colaboradores</h1>
        <div>
          <label className="rotulo" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required className="campo" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="rotulo" htmlFor="pw">Palavra-passe</label>
          <input id="pw" type="password" autoComplete="current-password" required className="campo" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {erro && <p role="alert" className="text-sm text-rose-700">{erro}</p>}
        <button className="btn-primario w-full" disabled={aEntrar}>{aEntrar ? "A entrar…" : "Entrar"}</button>
        <p className="text-xs text-slate-500">As contas são criadas pela administração. Não há registo público.</p>
      </form>
    </div>
  );
}
