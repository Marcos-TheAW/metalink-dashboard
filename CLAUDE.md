# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal dashboard for metalinkbuilding.com.br (link building agency) that replaces a Google Sheets
workbook ("Controle Operacional — Vendas e Relacionamento.xlsx"). Tracks pedidos (orders), ações
comerciais (sales/outreach actions) and clientes (clients), and derives relationship/revenue metrics
from that raw data. Deploys to Cloudflare Workers at dashboard.metalinkbuilding.com.br.

Stack: Astro 7 (SSR) + `@astrojs/cloudflare` adapter, Cloudflare D1 (SQLite), Tailwind CSS v4, Bun as
local runtime/package manager. No client-side JS framework — pages are server-rendered HTML with plain
`<form>` POSTs; no build step beyond the standard Astro/Bun toolchain.

## Commands

```sh
bun install                    # install deps
bun run dev                    # dev server (backgrounds itself; see below)
bun run build                  # astro build -> dist/
bunx astro-check                # typecheck .astro + .ts files (astro-check, not tsc directly)
bun run db:migrate:local       # apply migrations/0001_init.sql to local D1 (wrangler --local)
bun run db:migrate:remote      # apply migrations/0001_init.sql to the real D1 database
bun run generate-types         # regenerate worker-configuration.d.ts from wrangler.jsonc bindings
bun run deploy                 # astro build && wrangler deploy
bun run import:planilha        # scripts/importar-planilha.ts — see header of that file for flags
```

Migration files run in filename order; `0002_views.sql` must be applied after `0001_init.sql` (apply it
the same way, `wrangler d1 execute metalink-dashboard-db --local --file=./migrations/0002_views.sql`,
swapping `--local`/`--remote` as needed — there's no combined npm script for it yet).

`astro dev` in this Astro version detaches into a background daemon and the foreground command returns
immediately once it's up; control it with `bun run astro -- dev stop` / `dev status` / `dev logs` rather
than expecting `bun run dev` to block.

**Windows/Bun note:** `astro add <integration>` fails under Bun's runtime (`node:module registerHooks`
is not implemented by Bun yet) — run integration-add commands with real Node instead:
`node node_modules/astro/bin/astro.mjs add <integration>`. Everyday commands (`dev`, `build`,
`astro-check`, `wrangler`) run fine under Bun.

## Architecture

### Env bindings: no `Astro.locals.runtime`

This project uses `@astrojs/cloudflare` v14 (Astro 6+ era adapter). The old `Astro.locals.runtime.env`
API was removed. **Bindings are accessed via `import { env } from 'cloudflare:workers'`**, both in
Workers production and in `astro dev` (the Cloudflare Vite plugin proxies it). `src/lib/db.ts` is the
only place that should import `cloudflare:workers` directly — everything else goes through its exported
functions. The `Env` type (currently `{ DB: D1Database; ASSETS: Fetcher }`) is generated into
`worker-configuration.d.ts` by `wrangler types` / the build process; that file is gitignored and
regenerated automatically, don't hand-edit it.

### Auth: own email/password login, session via Astro Sessions

No Cloudflare Access — that was the original design but was replaced with a self-hosted login because
Access required team members to have/use a Cloudflare account to sign in. `/login` posts to
`/api/login`, which calls `src/lib/auth.ts#autenticar(email, senha)`: looks up `usuarios` by email
(`src/lib/db.ts#getCredenciaisPorEmail`, including inactive/unset-password rows so it can give an
accurate reason), verifies the password with `src/lib/senha.ts#verificarSenha` (PBKDF2-SHA256, 100k
iterations, per-user random salt — both columns live on `usuarios.senha_hash`/`senha_salt`, added in
`migrations/0005_auth_senha.sql`), and on success stores `usuarioId` in the session
(`session.set('usuarioId', ...)` after `session.regenerate()`). `src/middleware.ts` reads
`context.session.get('usuarioId')` on every request, loads the user via `getUsuarioPorId`, and attaches
it to `Astro.locals.usuario` (typed in `src/env.d.ts`, along with `App.SessionData`). No valid session →
redirect to `/login`. `papel` is `'admin' | 'colaborador'`; `/admin/*` and `/api/admin/*` are blocked
for non-admins in the middleware, and `/admin/exportar` + `/api/admin/exportar.ts` each re-check
`locals.usuario.papel === 'admin'` server-side as defense in depth.

Sessions are backed by the Cloudflare KV namespace the `@astrojs/cloudflare` adapter auto-provisions
(you'll see "Enabling sessions with Cloudflare KV" in build/dev output) — there was no extra binding to
wire up for this. Five failed logins in a row locks the account for 15 minutes
(`usuarios.tentativas_falhas` / `bloqueado_ate`, reset on success). `/admin/usuarios` (admin-only) is
where new users get created and passwords get reset — it generates a random temporary password shown
once in the response (never emailed; there's no outbound email integration), and the user changes it
themselves at `/minha-conta`. There's no self-serve "forgot password" flow — that's on-purpose scope
cut for an internal tool with a handful of users; an admin resets it manually if someone gets locked out
or forgets. In local dev there's nothing special to fake — just seed a `usuarios` row with a known
`senha_hash`/`senha_salt` pair (see git history around the 0005 migration for a one-off Node snippet
that derives them with the same PBKDF2 params) and log in through `/login` normally.

### Business rules live in SQL views, not stored columns

`migrations/0002_views.sql` defines `v_clientes_status` (per-client status: `ativo` ≤30d since last
order, `em_risco` 31–60d, `perdido` >60d, `nunca_comprou`; plus `key_account` when lifetime revenue >
R$3.000) and `v_kpis_gerais` (ticket médio, taxa de conversão, receita em risco, etc.), both computed
from `pedidos`/`acoes_comerciais` on every query. Never add a stored "status" or "key_account" column —
extend the views instead. `src/lib/db.ts` wraps these views and other aggregate queries (by canal, by
month, retention buckets, commercial execution) as typed functions; page/API code should call those
functions rather than writing raw SQL inline.

### Historico (audit trail) is written by the API layer, not the DB layer implicitly

`pedidos` and `acoes_comerciais` edits must produce rows in `historico_alteracoes` (one row per changed
field, old/new value as text). This happens inside `atualizarPedido`/`atualizarAcao` in `src/lib/db.ts`
via the private `registrarHistorico` diff helper — it compares the fetched "before" row against the
submitted input field-by-field and only inserts rows for fields that actually changed. `clientes` has no
edit flow (create-only) and therefore no historico entries; don't add update logic for clientes without
also deciding whether it needs history tracking.

### Request flow: plain HTML forms → API routes → redirect

Pages under `src/pages/pedidos/`, `src/pages/comercial/`, `src/pages/clientes/` render `<form
method="post" action="/api/...">` with no client JS. The actual validation + DB write + historico
logging lives in the matching route under `src/pages/api/` (e.g. `pedidos/novo.astro` posts to
`api/pedidos/index.ts`, `pedidos/[id].astro` posts to `api/pedidos/[id].ts`). On success the API route
redirects (303) to the record's detail page; on validation failure it redirects back to the form with
`?erro=<mensagem>`, which the page reads via `Astro.url.searchParams` and renders through
`ErrorBanner.astro`. Submitted form state is not preserved across a validation error (the user re-enters
it) — this is an accepted tradeoff for keeping forms JS-free; don't "fix" it by duplicating form-render
logic inside the API routes. Astro's built-in CSRF Origin check applies to all these POSTs, so testing
them with `curl` requires a matching `Origin` header (real browsers send this automatically).

`cliente_id` is always a closed `<select>` populated server-side from the `clientes` table (via
`FormSelect.astro`) — never a free-text input, to avoid duplicate client names with different spelling.

**Exception:** `src/pages/admin/importar.astro` (bulk `.xlsx` upload) handles its own POST directly in
frontmatter instead of going through `src/pages/api/`. It's a deliberate exception, not drift — a bulk
import needs to render a rich per-row result summary (counts + a table of skipped rows with reasons),
which doesn't fit the redirect-with-`?erro=` pattern. The actual parsing/insert logic still lives in a
dedicated module (`src/lib/importacao.ts`), not inlined in the page, so it stays testable/reusable the
same way `db.ts` functions are.

### Closed enums live in `src/lib/types.ts`, not scattered across pages

`canal`, `status` (pedidos), `canal`/`tipo`/`resultado` (ações comerciais) are CHECK-constrained in SQL
and mirrored as `{value, label}` arrays in `src/lib/types.ts` (`CANAIS`, `STATUS_PEDIDO`,
`CANAIS_COMERCIAIS`, `TIPOS_ACAO`, `RESULTADOS_ACAO`). Both form `<select>` options and API-route
server-side validation read from these same arrays — if you add/rename an enum value, update the DB
CHECK constraint (new migration), the array in `types.ts`, and nothing else; forms, filters, badges, and
the xlsx export all derive from it via `labelFor()`.

### Styling: Tailwind v4, tokens/components centralized in one file

`src/styles/global.css` is the single stylesheet (Tailwind v4 CSS-first config via `@theme`/`@layer`,
no `tailwind.config.js`). Brand color tokens (`--color-brand-*`), base element styles (`input`,
`select`, `table`, headings), and shared component classes (`.btn-primary`, `.btn-secondary`, `.card`)
all live here — don't add one-off `<style>` blocks or inline style spaghetti in pages. Status/result
color mapping for badges is centralized separately in `src/lib/badges.ts` (`badgeClasses()`), consumed
by `StatusBadge.astro`. **Tailwind v4 gotcha:** `@apply` can only reference real Tailwind utilities, not
another custom class defined via `@apply` in the same file (v3 allowed chaining custom classes; v4
doesn't) — write out the full utility list on each component class instead of composing them.

### Export/import mirror the original spreadsheet's column layout, not the DB schema

`/api/admin/exportar.ts` (admin-only) generates a 3-sheet `.xlsx` (Clientes, Pedidos, Ações Comerciais)
using the `xlsx` (SheetJS) package with `XLSX.utils.aoa_to_sheet` — headers and column order are the
**spreadsheet's** historical names (e.g. "Canal de Origem", "Status do Pedido"), not the DB's snake_case
enum keys; values pass through `labelFor()` to convert back to human labels. The "Semana (segunda)"
column is reconstructed from `data_pedido`/`data_acao` at export time (`segundaFeiraDaSemana()`) — it is
never stored. There are two importers, both reverse-mapping labels back to enum values via the same
`CANAIS`/`STATUS_PEDIDO`/etc. arrays: `/admin/importar` (in-app, admin-only, accepts the original
`.xlsx` directly — parsing/upsert logic lives in `src/lib/importacao.ts`, which has D1 access via
`cloudflare:workers` like the rest of the app) and `scripts/importar-planilha.ts` (CLI, CSV-only, shells
out to `wrangler d1 execute --file=<generated .sql>` since a plain Bun script outside the Workers
runtime has no `cloudflare:workers` binding access). Prefer pointing people at `/admin/importar` — it's
the lower-friction path; the CLI script mainly exists for scripted/CI use. Money is `R$` strings/numbers
at the spreadsheet boundary but always integer centavos inside the DB and app code — convert at the
edges (`parseValorReais`, `centavosParaReais`), never carry floats through business logic.

### D1 is already provisioned

`wrangler.jsonc`'s `d1_databases[0].database_id` points at the real production D1 database
(`metalink-dashboard-db`) — this isn't a template placeholder anymore. If you ever see the literal
string `REPLACE_WITH_D1_DATABASE_ID` there instead, it means you're on a fresh clone/branch that hasn't
had the real id filled in yet; `--local` commands work fine regardless (wrangler resolves local D1 by
name), but `wrangler deploy`/`--remote` commands need the real id first.
