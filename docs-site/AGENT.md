# This Nimbus docs site

Astro-based docs. The `nimbus-docs` package handles content schemas, sidebar/TOC, MDX→markdown, build hooks, and the `nimbus` CLI. Everything in `src/` is yours to edit.

## Project conventions

Use Bun pinned by the root package.json. Run `bun run check:docs` from the repository root after documentation changes; it must pass before handoff. Install and change dependencies through the root dependency-policy scripts.

For type checking, use the workspace `typecheck` script: TS7 checks TypeScript files, then an isolated TS6-powered Astro/Volar process checks templates. See README.md for this compatibility boundary and its removal criteria. The root documentation gate includes regression tests for both checkers; a Nimbus preflight alone is not the acceptance criterion.

Published article sources live in root `docs/` and the explicitly allowed Mobile guides listed in README.md, selected by `content-map.mjs`. Edit those sources, not generated `src/content/docs/*.md`. Add the canonical source to the map when adding a page. For a new source outside `docs/`, update the validator allowlist, frontend Docker context and cross-directory link tests together. The generator runs before build, typecheck and dev; restart dev after changing a source Markdown file.

## File layout

```
astro.config.ts              # imports nimbus + defineNimbusConfig
src/
├── components.ts            # MDX globals registry — every component used in .mdx must be listed
├── components/              # AgentDirective, Header, Render + ui/<slug>/
├── content/
│   ├── docs/*.mdx
│   └── partials/*.mdx       # referenced via <Render file="..." />
├── content.config.ts        # registers docsCollection() + partialsCollection()
├── layouts/                 # BaseLayout (NimbusHead), DocsLayout (sidebar/TOC/breadcrumbs)
├── lib/cn.ts                # Tailwind className merger
├── pages/
│   ├── [...slug].astro
│   ├── [...slug]/index.md.ts   # per-page markdown alternate
│   ├── llms.txt.ts
│   ├── og.png.ts                # site-level OG card
│   ├── og/
│   │   ├── _og-card-config.ts   # shared OG theme tokens (underscore = not a route)
│   │   └── [...slug].ts         # per-page OG cards
│   └── robots.txt.ts
└── styles/                  # globals.css, prose.css
```

Cloudflare deploys also have `wrangler.jsonc` at the project root.

## Writing docs

Frontmatter validates against `docsSchema` (`nimbus-docs/schemas`). Required: `title`.

```mdx
---
title: My page
description: One-line summary.
---

Content here. The page H1 comes from `title` — don't repeat it in the body.

## Section heading
```

Rules:

- **Components must be PascalCase and registered in `src/components.ts`.** A pre-build validator catches typos with a "did you mean" hint.
- **Partials use `<Render file="..." />`.** Don't import `.mdx` directly. Shared content lives in `src/content/partials/<slug>.mdx`.
- **Icons use `astro-icon` + Phosphor.** `<Icon name="ph:<glyph>" class="w-4 h-4" />` from `astro-icon/components`. Glyphs: [phosphoricons.com](https://phosphoricons.com).
- **Don't remove `<AgentDirective />` from `BaseLayout.astro`.** It points agents at `/llms.txt`.

## Adding things

| Goal                         | Action                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New doc page                 | Add a root `docs/*.md` source and register it in `content-map.mjs`.                                                                                        |
| New partial                  | Create `src/content/partials/<slug>.mdx`. Use via `<Render file="<slug>" />`.                                                                              |
| UI from registry             | `bun run --bun nimbus-docs add <slug>`. Register in `src/components.ts` if used in MDX.                                                                    |
| Feature recipe               | `bun run --bun nimbus-docs add <feature-slug>`. Pipe the printed brief to your agent.                                                                      |
| Check it builds              | `bun run --bun nimbus-docs check` — build-free preflight (env + structure + authoring + types). `--json` for an agent loop, `--fix` to repair what's safe. |
| Custom page route            | Add a file under `src/pages/`.                                                                                                                             |
| Custom OG style              | Edit `src/pages/og/_og-card-config.ts`.                                                                                                                    |
| Check for updates            | `bun run --bun nimbus-docs outdated` — starter files behind their tag + registry components behind.                                                        |
| Upgrade a starter file       | `bun run --bun nimbus-docs diff <file>` to review, `diff --apply <file>` to pull a clean upstream change.                                                  |
| Upgrade a registry component | `bun run --bun nimbus-docs add <slug> --overwrite`, then review with `git diff`.                                                                           |

List installable items: `bun run --bun nimbus-docs list`.

## Audit this site

Start with `bun run --bun nimbus-docs check --json`. It runs the environment, structural, authoring, and type checks build-free — config validity, `site` placeholder, route collisions, MDX component resolution, the lint rules, and a `tsc` type-check — and returns three top-level signals plus per-scope detail:

- **`status`** (`passed` | `failed` | `partial`) and **`readiness`** (`buildable` | `blocked` | `unknown`) are the primary signals. `status` is the whole-run verdict; `readiness` answers "does env + structure say it builds?". `ok` (=== zero errors) is kept for back-compat only.
- **`findings[{scope,code,severity,file,line,message,fixable,fix}]`** are problems we evaluated. Apply each `fix` (or `check --fix`).
- **`scopes[].notes[{code,reason,requiresBuild?,requiresInput?}]`** are checks we _couldn't_ evaluate yet (e.g. types before a build). A note is never a finding and never carries a `fix` — you resolve it by making the missing thing exist (usually a build), not by `--fix`. `summary.notes` counts them.

Loop terminates on `status !== "failed" && summary.fixable === 0` — a `partial` run with nothing left to fix is a **stop** (optionally build, then re-check), not a `--fix` retry. Exit is `1` only when `status` is `"failed"`. For full coverage (types + link-checking) run a build first, then `check` again.

Then walk the categories below for what `check` doesn't cover yet — route-file existence, registry hygiene, the AI surface, post-build search, and Cloudflare config. Emit findings as:

```
- [error|warn|info] FILE:LINE — what + why + fix.
```

End with `Summary: N errors, N warnings.`

- **Config** — `astro.config.ts` calls `nimbus(defineNimbusConfig({ ... }))`; `site` is set; `editPattern` (if set) contains `{path}`; `output:` matches the deploy target.
- **Content** — `content.config.ts` registers `docsCollection()` (and `partialsCollection()` if used); every `.mdx` is inside a registered collection; frontmatter validates.
- **Sidebar** — every sidebar ref resolves to a content entry; no orphans; no slug collisions.
- **MDX** — every PascalCase component in `*.mdx` is registered; every `<Render file=...>` resolves; code-fence languages are valid.
- **Routes** — `llms.txt.ts`, `robots.txt.ts`, `[...slug]/index.md.ts`, `og.png.ts`, `og/[...slug].ts` all exist.
- **Registry hygiene** — every `src/components/ui/<slug>/` is either MDX-registered or imported in `src/`; transitive deps (`lib/cn.ts`, etc.) exist.
- **AI surface** — `<AgentDirective />` renders in `BaseLayout.astro`; doc `<head>` has `<link rel="alternate" type="text/markdown" ...>`.
- **Search** — `data-pagefind-body` is on the docs main wrapper; after `bun run build`, `dist/pagefind/` exists with ≥1 indexed page.
- **Cloudflare** (if applicable) — `wrangler.jsonc` has `name`, `compatibility_date`, `assets.directory = "./dist"`, `not_found_handling`.

## Don't

- Hand-add components under `src/components/ui/` that exists in the nimbus-docs registry — use `nimbus-docs add` so deps resolve.
- Import `.mdx` files directly — use `<Render file="..." />`.
- Attach remark/rehype plugins via `mdx({ remarkPlugins })` — Sätteri silently drops them. Framework-side transformations run as content passes.
- Remove `<AgentDirective />` unless asked.
- Edit `src/components.ts` to bypass registration — if a component is used in `.mdx`, register it.

## Project home

[nimbus-docs.com](https://nimbus-docs.com)
