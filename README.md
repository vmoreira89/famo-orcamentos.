# FAMO · Orçamentação e Desenho Técnico

Plataforma online para pedidos de orçamento (Living), orçamentação e geração de desenhos técnicos (PDF, STEP, DXF).

- **Produção:** https://famo-orcamentos.vercel.app
- **Stack:** Next.js (App Router) · Supabase (Postgres, Auth, Storage) · Resend · Vercel

## Fases
1. ✅ Página inicial, pedido de orçamento público (multi-divisão, anexos), login, lista interna, email ao orçamentista chefe
2. Área interna: abrir orçamentos, nº de projecto, estados com motivo, comentários, histórico
3. Bases de dados: ferragens, matérias-primas, grupos de laminado, tempos e custos
4. Orçamentação por móvel, BOM e codificação, margens, relatórios PDF/Excel
5. Desenhos: PDF de conjunto e peças, STEP/DXF por peça, pasta ZIP

## Desenvolvimento
```bash
cp .env.example .env.local   # preencher
npm install
npm run dev
```

Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `EMAIL_ORCAMENTISTA_CHEFE`, `EMAIL_REMETENTE`, `NEXT_PUBLIC_SITE_URL`.
