/** The attack text of the security specs. Everything here is hostile on purpose. */

/**
 * One piece of attack text with every common way to run code from markup. No `;` or `#`, because
 * Mermaid ends a label there. Each form calls `__pwned` if it ever reaches the page as markup.
 */
export const hostile = (where: string): string =>
  [
    `<img src=x onerror="__pwned('${where}')" data-pwn>`,
    `<script data-pwn>__pwned('${where}')</script>`,
    `<svg onload="__pwned('${where}')" data-pwn></svg>`,
    `<iframe srcdoc="<script>top.__pwned('${where}')</script>" data-pwn></iframe>`,
    `<a href="javascript:__pwned('${where}')" data-pwn>x</a>`,
    `<details open ontoggle="__pwned('${where}')" data-pwn></details>`,
    `<img src="https://evil.example/${where}.png">`,
  ].join(' ');

/** The word the glossary term of the hostile flow is about. */
export const TERM_WORD = 'zebrafish';

/** A flow with attack text in every annotation and every place a label can go. */
export const HOSTILE_FLOW = `sequenceDiagram
  autonumber
  %% @spec walkthrough/2
  %% @title ${hostile('title')}
  %% @scope ${hostile('scope')}
  %% @trigger ${hostile('trigger')}
  %% @summary ${hostile('summary')}
  %% @term ${TERM_WORD}: ${hostile('term')}
  %% @term <img src=x onerror="__pwned('term-name')">: a term with markup for a name
  %% @layer A kind=client ${hostile('layer')}
  %% @layer B kind=<img/src=x/onerror=__pwned('layer-kind')> ${hostile('layer-2')}
  participant A as ${hostile('participant')}
  participant B as <b data-pwn onmouseover="__pwned('participant-2')">B</b>
  %% @section ${hostile('section')}
  %% @summary ${hostile('section-summary')}
  %% @step ${TERM_WORD} ${hostile('step')}
  %% @payload ${hostile('payload')}
  %% @payload.body {"html": "<img src=x onerror=__pwned('payload-json')>"}
  %% @payload.headers X-Test: ${hostile('payload-headers')}
  %% @payload.query q=${hostile('payload-query')}
  %% @payload.params id=${hostile('payload-params')}
  %% @payload.cookies c=${hostile('payload-cookies')}
  %% @payload.event ${hostile('payload-event')}
  %% @payload.input ${hostile('payload-input')}
  %% @payload.result ${hostile('payload-result')}
  %% @payload.sql SELECT * FROM <img/src=x/onerror=__pwned('sql')> WHERE a = 1
  %% @ref javascript:__pwned('ref-script')
  %% @ref JaVaScRiPt:__pwned('ref-mixed'):1
  %% @ref data:text/html,<script>__pwned('ref-data')</script>
  %% @ref https://evil.example/"><img/src=x/onerror=__pwned('ref-break')>
  %% @uses hook <img/src=x/onerror=__pwned('uses-name')> javascript:__pwned('uses-ref'):1 ${hostile('uses')}
  %% @uses <img/src=x/onerror=__pwned('uses-kind')> name ${hostile('uses-2')}
  %% @effect ${hostile('effect')}
  %% @field <img/src=x/onerror=__pwned('field-name')> ${hostile('field')}
  %% @schema <img/src=x/onerror=__pwned('schema-name')> ${hostile('schema')}
  %% @state before ${hostile('state-before')}
  %% @state after ${hostile('state-after')}
  %% @async ${hostile('async')}
  %% @retry ${hostile('retry')}
  %% @timeout ${hostile('timeout')}
  %% @idempotent ${hostile('idempotent')}
  %% @unconfirmed ${hostile('unconfirmed')}
  A->>B: POST /x ${hostile('label')}
  %% @step ${hostile('reply-step')}
  %% @payload.body {"html": "<img src=x onerror=__pwned('reply-json')>"}
  B-->>A: 200 ${hostile('reply-label')}
  link A: Bad @ javascript:__pwned('link')
  links B: {"Bad": "javascript:__pwned('links')", "Data": "data:text/html,<script>__pwned('links-data')</script>"}
  properties A: {"class": "<img src=x onerror=__pwned('properties')>"}
  details A: <img src=x onerror=__pwned('details')>
  %% @step ${hostile('block-step')}
  alt ${hostile('alt')}
    A->>B: #lt;img src=x onerror=#quot;__pwned('entity')#quot;#gt;
  else ${hostile('else')}
    Note over A,B: ${hostile('note')}
    A->>B: $$\\href{javascript:__pwned('katex')}{math}$$
  end
  loop ${hostile('loop')}
    B->>B: ${hostile('self')}
  end
  rect rgb(0, 0, 0)
    A->>B: inside a rectangle
  end
`;

/** The number of arrows in HOSTILE_FLOW. */
export const HOSTILE_STEPS = 6;

/** `%%{init}%%` directives and front matter that try to loosen Mermaid. */
export const CONFIG_ATTACKS: Record<string, string> = {
  'an init directive that asks for securityLevel loose': `%%{init: {"securityLevel": "loose", "startOnLoad": true, "secure": []}}%%
flowchart LR
  A["<img src=x onerror=__pwned('loose-label')>"] --> B
  click A call __pwned("loose-call")
  click B href "javascript:__pwned('loose-href')"`,

  'an init directive that asks for the sandbox level': `%%{init: {"securityLevel": "sandbox"}}%%
sequenceDiagram
  A->>B: <img src=x onerror=__pwned('sandbox')>`,

  'an init directive that loosens DOMPurify': `%%{init: {"htmlLabels": true, "dompurifyConfig": {"ADD_TAGS": ["script", "iframe", "foreignObject"], "ADD_ATTR": ["onerror", "onload", "srcdoc"], "ALLOW_UNKNOWN_PROTOCOLS": true, "FORBID_TAGS": [], "FORBID_ATTR": []}}}%%
flowchart LR
  A["<img src=x onerror=__pwned('purify-label')>"] --> B["<iframe srcdoc='<script>top.__pwned(1)</script>'></iframe>"]`,

  'theme CSS that closes the style element': `%%{init: {"themeCSS": "</style><img src=x onerror=__pwned('css-close')><style>", "fontFamily": "x}</style><img src=x onerror=__pwned('css-font')>"}}%%
sequenceDiagram
  A->>B: styled`,

  'theme CSS that reaches for another site': `%%{init: {"themeCSS": "@import url(https://evil.example/theme.css); .actor { background: url(https://evil.example/bg.png); fill: url(https://evil.example/fill.svg) } @font-face { font-family: x; src: url(https://evil.example/font.woff2) }"}}%%
sequenceDiagram
  A->>B: styled`,

  'theme variables with markup': `%%{init: {"theme": "base", "themeVariables": {"primaryColor": "</style><img src=x onerror=__pwned('var')>", "background": "url(https://evil.example/var.png)"}}}%%
sequenceDiagram
  A->>B: styled`,

  'a theme name that is a member of Object': `%%{init: {"theme": "__proto__"}}%%
sequenceDiagram
  A->>B: styled`,

  'an init directive that targets the prototype': `%%{init: {"__proto__": {"polluted": "yes"}, "constructor": {"prototype": {"polluted": "yes"}}, "sequence": {"__proto__": {"polluted": "yes"}}}}%%
sequenceDiagram
  A->>B: styled`,

  'front matter that asks for securityLevel loose': `---
title: <img src=x onerror=__pwned('fm-title')>
config:
  securityLevel: loose
  startOnLoad: true
  secure: []
  htmlLabels: true
  dompurifyConfig:
    ADD_TAGS: [script]
    ADD_ATTR: [onerror]
---
sequenceDiagram
  A->>B: <img src=x onerror=__pwned('fm-label')>`,
};

/** Other kinds of diagram, each with its own links, callbacks and label syntax. */
export const OTHER_DIAGRAMS: Record<string, string> = {
  flowchart: `flowchart TD
  A["<img src=x onerror=__pwned('flow-label')>"] --> B("<script>__pwned('flow-script')</script>")
  B --> C{"<a href='javascript:__pwned(1)' data-pwn>x</a>"}
  C -->|"<img src=x onerror=__pwned('flow-edge')>"| D["<foreignObject><body onload=__pwned('flow-fo')></body></foreignObject>"]
  D --> E["\`**md** <img src=x onerror=__pwned('flow-md')>\`"]
  click A "javascript:__pwned('flow-click')" "tip <img src=x onerror=__pwned('flow-tip')>"
  click B href "javascript:__pwned('flow-href')"
  click C call __pwned("flow-call")
  click D callback "<img src=x onerror=__pwned('flow-cb')>"`,
  // Mermaid 12.2 refuses a url() in a style line; the kind is kept apart so the flowchart above draws.
  'flowchart with styles that fetch': `flowchart TD
  A["a"] --> B["b"]
  style A fill:url(https://evil.example/style.png)
  classDef bad fill:url(https://evil.example/class.png),color:red
  class B bad`,
  classDiagram: `classDiagram
  class A["<img src=x onerror=__pwned('class-label')>"]
  A : +<img src=x onerror=__pwned('class-member')>
  link A "javascript:__pwned('class-link')" "tip"
  click A href "javascript:__pwned('class-href')"
  click A call __pwned("class-call")`,
  stateDiagram: `stateDiagram-v2
  state "<img src=x onerror=__pwned('state')>" as S1
  [*] --> S1 : <img src=x onerror=__pwned('state-edge')>
  note right of S1 : <img src=x onerror=__pwned('state-note')>`,
  erDiagram: `erDiagram
  A ||--o{ B : "<img src=x onerror=__pwned('er')>"
  A { string name "<img src=x onerror=__pwned('er-attr')>" }`,
  gantt: `gantt
  title <img src=x onerror=__pwned('gantt-title')>
  dateFormat YYYY-MM-DD
  section <img src=x onerror=__pwned('gantt-section')>
  Task :a1, 2026-01-01, 3d
  click a1 href "javascript:__pwned('gantt-href')"
  click a1 call __pwned("gantt-call")`,
  pie: `pie title <img src=x onerror=__pwned('pie-title')>
  "<img src=x onerror=__pwned('pie')>" : 1
  "b" : 2`,
  journey: `journey
  title <img src=x onerror=__pwned('journey-title')>
  section <img src=x onerror=__pwned('journey-section')>
    Task: 5: <img src=x onerror=__pwned('journey-actor')>`,
  gitGraph: `gitGraph
  commit id: "<img src=x onerror=__pwned('git')>"
  branch "x"
  commit tag: "<img src=x onerror=__pwned('git-tag')>"`,
  mindmap: `mindmap
  root(("<img src=x onerror=__pwned('mind')>"))
    child::icon(<img src=x onerror=__pwned('mind-icon')>)`,
  timeline: `timeline
  title <img src=x onerror=__pwned('time-title')>
  2026 : <img src=x onerror=__pwned('time')>`,
  quadrantChart: `quadrantChart
  title <img src=x onerror=__pwned('quad')>
  Point A: [0.3, 0.6]`,
  requirementDiagram: `requirementDiagram
  requirement r1 {
    id: 1
    text: "<img src=x onerror=__pwned('req')>"
  }`,
  C4Context: `C4Context
  title <img src=x onerror=__pwned('c4-title')>
  Person(a, "<img src=x onerror=__pwned('c4')>", "desc", $link="javascript:__pwned('c4-link')")`,
  kanban: `---
config:
  kanban:
    ticketBaseUrl: 'javascript:__pwned("kanban")//#TICKET#'
---
kanban
  todo[Todo]
    t1[<img src=x onerror=__pwned('kanban-card')>]@{ ticket: T1 }`,
  architecture: `architecture-beta
  group g(cloud)[<img src=x onerror=__pwned('arch-group')>]
  service s(server)[<img src=x onerror=__pwned('arch')>] in g`,
};

/** Code Mermaid refuses: its error message goes on the page, and must stay plain text. */
export const REFUSED_CODE = `sequenceDiagram
  <img src=x onerror="__pwned('refused')" data-pwn>
  ${hostile('refused-2')}`;
