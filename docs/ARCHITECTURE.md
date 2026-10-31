# Architecture

Sequence Walkthrough turns an annotated Mermaid sequence diagram into a guided, step-by-step walkthrough. Version 3 is a TypeScript monorepo managed with npm workspaces. This page describes the pieces and the rules between them.

## Layout

```text
.
├── apps/
│   └── web/                     React app (Vite). The hosted site and the one-file build.
│       └── src/
│           ├── app/             Start-up, layout, and tools/registry.ts: one data line per tool
│           ├── features/        One folder per feature. Features never import each other.
│           ├── shared/          ui, hooks, storage, tokens. No feature logic.
│           └── main.tsx
├── packages/
│   ├── core/                    Parser, flow model, lint, review rules. No browser or React code.
│   └── ai/                      Model clients, usage, auto-switch, cache, prompts, schemas
├── skills/                      Claude skills, built from one shared set of rules
├── examples/demo-store/         Small real project behind the demo flow
├── tools/                       check-budgets, check-refs, build-skills
├── e2e/                         Playwright tests, plus the live-site smoke test
├── docs/                        This page, decisions, the plan, feature parity
└── .github/                     Pages deployment, Dependabot
```

## Dependency direction

```text
apps/web  ──►  packages/ai  ──►  packages/core
tools     ──►  packages/core
```

- `packages/core` depends on nothing else in this repository and on no browser or React library.
- `packages/ai` may use `packages/core`.
- `apps/web` may use both packages. Inside it, `features/*` may use `shared/*`, never each other and never `app/*`.
- `tools/*` may use `packages/core`.

`dependency-cruiser` checks these rules in `npm run verify` (`.dependency-cruiser.cjs`). Features talk to each other only through `ui` flags in the store (`shared/state`).

## How packages are consumed

Each package's `package.json` points `exports` at its TypeScript source. There is no per-package build:

- Vite bundles the source into the app.
- Vitest imports it directly.
- Node 24 runs the `tools/*` scripts as `.ts` files with type stripping, so every file uses only erasable TypeScript syntax (no enums, namespaces or parameter properties; `erasableSyntaxOnly` enforces this).

## Checks

`npm run check` is the gate before a merge: types, lint, unit tests, build, size budgets, then the built site in one browser. `npm run verify` is the full run by hand, in order: format, lint, types, unit tests, build, browser tests, dependency boundaries, duplication, unused code, size budgets, demo code links and `npm audit`. The browser tests can run on Chromium, Firefox, WebKit and a phone profile (`SWV_E2E_PROJECTS` picks them), and include an axe-core accessibility scan. No workflow runs them; only the Pages deployment runs on GitHub, followed by `npm run smoke` by hand.

## Security model

See `SECURITY.md`. In one line: keys stay in the browser and go only to their own URL, pasted code and model replies are untrusted data, and raw HTML reaches the page in exactly one sanitised component.
