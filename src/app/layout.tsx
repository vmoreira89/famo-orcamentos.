import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Cabecalho from "@/components/Cabecalho";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FAMO · Orçamentação e Desenho",
  description: "Pedidos de orçamento, orçamentação e desenhos técnicos de mobiliário FAMO.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Cabecalho />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
          FAMO · Orçamentação e Desenho Técnico
        </footer>
      </body>
    </html>
  );
}
