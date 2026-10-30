# Decisions

Decisions the plan (`docs/IMPLEMENTATION-PLAN.md`) does not already make, one or two lines each, newest last.

## Phase 1: foundation (2026-10-30)

- **TypeScript 5.9, not 7.** TypeScript 7 (the native compiler) is current on npm, but typescript-eslint supports only versions below 6.1. The 5.9 line is pinned until the lint tooling catches up; Dependabot will propose the bump and CI will tell us when it works.
- **ESLint 10 without eslint-plugin-jsx-a11y.** The a11y plugin does not support ESLint 10. Accessibility is checked where it matters, on the rendered page, with axe-core in the Playwright tests.
- **Workspace packages export their TypeScript source.** `@swv/core` and `@swv/ai` point `exports` at `src/index.ts`. Vite bundles them into the app, Vitest reads them directly, and Node 24 runs the tools' `.ts` files without a build step. `erasableSyntaxOnly` is on so Node's type stripping always works. Nothing in `packages/` needs to be compiled before use.
- **Package scope `@swv`.** Short, and it matches the `swv:` prefix the viewer has always used for browser storage.
- **Content Security Policy as a `<meta>` tag.** GitHub Pages cannot set response headers. The tag is added only to production builds, because the Vite dev server and React refresh need an inline script while developing.
- **Python stays only in the deploy workflow** until Phase 4 switches hosting to the new app. `npm run verify` has no Python step.
- **Playwright runs a phone project (Pixel 7)** in addition to Chromium, Firefox and WebKit, because the plan requires a phone layout.
- **Gitleaks through the official GitHub Action.** It is free for repositories owned by a user account, which this one is.
- **Repository settings:** squash and rebase merges are turned off so every merge is a merge commit (plan section 1, rule 7); branches are deleted on merge; GitHub secret scanning, push protection, Dependabot security updates and private vulnerability reporting are turned on. All are free on a public repository.
- **Firefox runs in CI only on the build machine.** Playwright's Firefox build does not start on the Windows machine used for the build ("side-by-side configuration is incorrect", a missing system runtime), and installing system components is out of scope. CI on Ubuntu runs all four browser projects; locally `SWV_E2E_PROJECTS=chromium,webkit,phone npm run verify` runs the rest. The variable is ignored in CI.
- **A ruleset ("Protect main") instead of classic branch protection.** It requires a pull request, an up-to-date branch, merge commits only, and the checks `verify`, `gitleaks`, `CodeQL (javascript-typescript)` and `CodeQL (actions)` (the CodeQL job is a matrix, so each language reports its own check). It also blocks force pushes and deletion. No required review, since GitHub does not let an account approve its own pull request. Renaming a job or the matrix changes the check names and must be mirrored in the ruleset.
