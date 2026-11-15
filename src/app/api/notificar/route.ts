import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServidor } from "@/lib/supabase";

type Resumo = {
  referencia: string;
  nome_projecto: string;
  origem: string;
  contacto_nome: string;
  contacto_email: string | null;
  contacto_telefone: string | null;
  contacto_empresa: string | null;
  n_ficheiros: number;
  divisoes: { designacao: string; quantidade: number; material: string; mdf: string | null }[];
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false }, { status: 400 });

  const chave = process.env.RESEND_API_KEY;
  const destino = process.env.EMAIL_ORCAMENTISTA_CHEFE;
  if (!chave || !destino) {
    console.warn("Resend não configurado: RESEND_API_KEY / EMAIL_ORCAMENTISTA_CHEFE em falta");
    return NextResponse.json({ ok: false, motivo: "email não configurado" });
  }

  // A função só devolve dados uma vez por pedido e nos primeiros 15 minutos.
  const { data, error } = await supabaseServidor().rpc("pedido_para_notificar", { p_id: id });
  if (error || !data) return NextResponse.json({ ok: false });
  const p = data as Resumo;

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const linhas = p.divisoes
    .map((d) => `<tr><td>${esc(d.designacao)}</td><td>${d.quantidade}</td><td>${esc(d.material)}${d.mdf ? " / MDF " + esc(d.mdf) : ""}</td></tr>`)
    .join("");

  const html = `
    <h2>Novo pedido de orçamento ${esc(p.referencia)}</h2>
    <p><strong>Projecto:</strong> ${esc(p.nome_projecto)} (${p.origem === "interno" ? "criado internamente" : "pedido público"})</p>
    <p><strong>Contacto:</strong> ${esc(p.contacto_nome)}${p.contacto_empresa ? " · " + esc(p.contacto_empresa) : ""}<br/>
       ${esc(p.contacto_email ?? "")} ${esc(p.contacto_telefone ?? "")}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
      <tr><th>Divisão</th><th>Qtd.</th><th>Material</th></tr>${linhas}
    </table>
    <p>Ficheiros anexos: ${p.n_ficheiros}</p>
    <p><a href="${esc(site)}/interno">Abrir a plataforma</a></p>`;

  const resend = new Resend(chave);
  const { error: errEmail } = await resend.emails.send({
    from: process.env.EMAIL_REMETENTE ?? "FAMO Orçamentos <onboarding@resend.dev>",
    to: destino.split(",").map((s) => s.trim()),
    subject: `Novo pedido de orçamento ${p.referencia} · ${p.nome_projecto}`,
    html,
  });
  if (errEmail) {
    console.error("Erro Resend", errEmail);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
