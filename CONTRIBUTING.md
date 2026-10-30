# Contributing

Thanks for helping. This page explains how the project is set up and what a change needs before it can merge.

## Set up

You need **Node 24** or later (`.nvmrc` has the version). Nothing else is installed on your machine.

```bash
npm ci
npx playwright install --with-deps
```

Then:

| Command | What it does |
|---|---|
| `npm run dev` | Starts the web app with live reload |
| `npm run verify` | Every check CI runs, in the same order. Must pass before a pull request. |
| `npm run test` | Unit and component tests only |
| `npm run test:e2e` | Browser tests (run `npm run build` first) |
| `npm run smoke` | Smoke test against the live site (`SMOKE_URL=...` to point it elsewhere) |
| `npm run format` | Formats every file |

## How the code is organised

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The short version:

- `packages/core` holds parsing, the flow model, lint and review rules. It has no browser or React code and depends on nothing else in this repository.
- `packages/ai` holds model clients, usage tracking, auto-switch, the answer cache, prompts and reply schemas. It may use `packages/core`.
- `apps/web` is the React app. Features live in `src/features/<name>` and do not import each other. Code two features need goes to `src/shared`.
- `skills/` holds the two Claude skills. Rules both skills share are written once in `skills/shared`.
- `tools/` holds the small scripts CI runs: budgets, code-link checks and the skill build.

CI enforces the boundaries with dependency-cruiser, keeps duplication under 2% with jscpd, and fails on unused code with knip. Strict TypeScript is on and `any` is not allowed.

## Making a change

1. Branch from the latest `main`. One branch per change.
2. Keep files small and focused, ideally under 300 lines.
3. Add or update tests with the change. Browser-visible changes need a Playwright test.
4. Run `npm run verify`. Fix every failure; never weaken a check to get a pass.
5. Open a pull request that says what changed and how it was tested.
6. CI must pass. Merge with a merge commit, then delete the branch.

## Security

Please read [SECURITY.md](SECURITY.md) before touching anything that handles API keys, pasted diagrams, shared links or model replies. In short: keys stay in the browser and go only to their own model URL, pasted and shared code is untrusted, model replies are data and never actions, and raw HTML is written to the page in exactly one sanitised component.

## Recording decisions

A decision that the plan does not already make goes into `docs/decisions.md` in one or two lines, with the date.
