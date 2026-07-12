# metalink-dashboard

Dashboard interno da [metalinkbuilding.com.br](https://metalinkbuilding.com.br), substituindo a
planilha "Controle Operacional — Vendas e Relacionamento.xlsx". Roda em Cloudflare Workers +
D1, servido em `dashboard.metalinkbuilding.com.br`.

Stack: Astro (SSR) + `@astrojs/cloudflare` + Tailwind CSS v4 + Bun. Autenticação via Cloudflare
Access (sem login/senha próprio).

## Desenvolvimento

```sh
bun install
bun run db:migrate:local   # aplica migrations/0001_init.sql no D1 local
node node_modules/wrangler/bin/wrangler.js d1 execute metalink-dashboard-db --local --file=./migrations/0002_views.sql
bun run dev                # sobe o servidor de dev (background daemon; ver CLAUDE.md)
```

Veja [CLAUDE.md](./CLAUDE.md) para a arquitetura completa (bindings, auth, regras de negócio,
export/import, estilo).

## Deploy

Deploy automático via GitHub Actions a cada push em `main` (`.github/workflows/deploy.yml`),
usando os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. Deploy manual:
`bun run deploy`.
