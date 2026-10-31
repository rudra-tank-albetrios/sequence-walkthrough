# Security

## Reporting a problem

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a security problem.

You should hear back within a week. Fixes ship as a new release and are noted in the release notes.

## Supported versions

| Version | Supported |
|---|---|
| 3.x (`main`) | Yes |
| 2.x | No, please move to 3.x |

## How the repository is protected

| Area | In place |
|---|---|
| Dependencies | Lockfile committed, `npm ci` in the deploy, Dependabot version and security updates. `npm run audit` is run by hand. |
| Workflows | Only the Pages deployment runs. Every GitHub Action is pinned to a commit SHA, with least permissions per job and no persisted credentials in checkouts. |
| Secrets | GitHub secret scanning and push protection are on |
| Branch | `main` takes pull requests only, merge commits only, with no force push and no deletion |
| Code | Strict TypeScript, no `any` |
| Raw HTML | An ESLint rule blocks `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `createContextualFragment`, `srcdoc`, `eval` and `new Function` everywhere except the one sanitised diagram component |
| Page | The web app ships a Content Security Policy with no external scripts; everything is bundled, nothing loads from a CDN |

CodeQL, Gitleaks and CI on pull requests were removed on 2026-10-31 at the owner's request, so these scans no longer run. Tests and lint run locally before a merge (`npm run check`, `npm run verify`).

## Rules the app keeps

| Risk | Rule |
|---|---|
| API keys | A key is stored in this browser only and is sent only to the model URL it was saved for. It never appears in logs, URLs, exports, the answer cache or bug reports, and a reply that repeats it has it hidden. Settings offer "Forget key when this tab closes". Keys are not encrypted with a key stored beside them, because that adds no safety; the settings screen says plainly that the key is stored in this browser. |
| Pasted diagrams and code shared in a URL | Treated as untrusted. Mermaid runs at `securityLevel: 'strict'` and every SVG it produces goes through DOMPurify before it reaches the page. |
| Model replies | Treated as untrusted data. They are shown as plain text, validated with Zod schemas, and can never run an action. Flow text is clearly marked as data inside prompts. |
| Custom model URLs | `https` only, except `localhost` and `127.0.0.1`. A link cannot hold credentials or a query parameter named like a key, a key is removed when its address changes, and redirects are refused. |
| Voice | The page fetches nothing for it. A voice that is an online service of the browser or system receives the text it reads, and the settings say so. |

## Scope

The structure review and threat tags in the app point at possible problems in a flow. They are not a security audit, and a clean result does not mean a project is safe.
