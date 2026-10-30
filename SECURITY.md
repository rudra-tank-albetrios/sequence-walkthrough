# Security

## Reporting a problem

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a security problem.

You should hear back within a week. Fixes ship as a new release and are noted in the release notes.

## Supported versions

| Version | Supported |
|---|---|
| 3.x (`main`) | Yes |
| 2.x | No, please move to 3.x |

## How the project protects users

The viewer is a static page with no server and no accounts, so the risks are in the browser.

| Risk | What the project does |
|---|---|
| API keys | A key is stored in this browser only and is sent only to the model URL it was saved for. It never appears in logs, URLs, exports, the answer cache or bug reports. Settings offer "Forget key when this tab closes". Keys are not encrypted with a key stored beside them, because that adds no safety; the settings screen says plainly that the key is stored in this browser. |
| Pasted diagrams and code shared in a URL | Treated as untrusted. Mermaid runs at `securityLevel: 'strict'` and every SVG it produces goes through DOMPurify before it reaches the page. |
| Model replies | Treated as untrusted data. They are shown as plain text, validated with Zod schemas, and can never run an action. Flow text is clearly marked as data inside prompts. |
| Raw HTML | `dangerouslySetInnerHTML`, `innerHTML` and `insertAdjacentHTML` are blocked by an ESLint rule everywhere except the one sanitised diagram component. |
| Custom model URLs | `https` only, except `localhost`. |
| Page | A Content Security Policy with no external scripts. Everything is bundled, nothing loads from a CDN. |
| Dependencies | Lockfile committed, `npm ci` in CI, `npm audit` at high level on every pull request, Dependabot updates, GitHub Actions pinned to commit SHAs with least permissions. |
| Secrets in the repository | Gitleaks runs on every pull request. GitHub secret scanning and push protection are on. |
| Code | CodeQL runs on every pull request and weekly. |

## Scope

The structure review and threat tags in the app point at possible problems in a flow. They are not a security audit, and a clean result does not mean a project is safe.
