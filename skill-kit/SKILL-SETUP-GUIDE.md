# sequence-walkthrough skill: setup guide

The skill teaches Claude to write Mermaid sequence diagrams in the annotated `walkthrough/2` format: every arrow gets a plain-language `%% @step` card, with chapters (`@section`, `@summary`), layer descriptions (`@layer … kind=`), payload parts (`@payload.headers`, `@payload.body`, `@payload.sql` …), code links (`@ref`), side parts such as hooks and crons (`@uses`), effects, a glossary (`@term`) and more. Every API call shows its method and path, every reply its status code and message. Paste the result into the Sequence Walkthrough Viewer to step through it card by card. The diagram still renders unchanged on mermaid.live, GitHub and anywhere else Mermaid runs.

- **Skill name:** `sequence-walkthrough`
- **Slash command (Claude Code / Agent SDK):** `/sequence-walkthrough`

## What is in this kit

| File | Use it for |
|---|---|
| `SKILL-SETUP-GUIDE.md` | This guide |
| `sequence-walkthrough.zip` | Uploading the skill to the Claude app (claude.ai, desktop, mobile) or to the Claude API |
| `sequence-walkthrough/` | Copying the skill folder into Claude Code or an Agent SDK project |
| `install-claude-code.ps1` | Windows: copies the folder into `%USERPROFILE%\.claude\skills\` |
| `install-claude-code.sh` | macOS / Linux: copies the folder into `~/.claude/skills/` |

Inside the skill folder:

```text
sequence-walkthrough/
├── SKILL.md                       instructions Claude reads when the skill triggers
├── references/
│   ├── annotation-spec.md         the full walkthrough/2 format
│   ├── writing-guide.md           how to write each tag; Explain vs Easy, Proposed and Scoped flows
│   └── layer-naming.md            aliases, kinds and zones; layers vs side parts
└── examples/
    ├── oauth-login.mmd
    └── payment-idempotency.mmd
```

## 1. Claude Code (terminal, desktop app, IDE)

Claude Code finds skills in two places:

- **Personal, all projects:** `~/.claude/skills/sequence-walkthrough/` (on Windows, `C:\Users\<you>\.claude\skills\sequence-walkthrough\`)
- **One project only (commit it so your team gets it):** `<project>/.claude/skills/sequence-walkthrough/`

Install it with the script, or copy the folder yourself.

Windows (PowerShell, from the unzipped kit folder):

```powershell
powershell -ExecutionPolicy Bypass -File .\install-claude-code.ps1
```

macOS / Linux:

```bash
sh ./install-claude-code.sh
```

For one project only, copy it by hand instead:

```bash
mkdir -p .claude/skills && cp -R sequence-walkthrough .claude/skills/
```

Then start a new Claude Code session, since skills are picked up when a session starts. Check that it loaded: type `/` and look for `sequence-walkthrough` in the list, or ask "what skills do you have?".

To use it, either call it by name or just ask:

```text
/sequence-walkthrough diagram the checkout flow in ./src/checkout
```

```text
Make a walkthrough diagram of how login works in this repo, with code links.
```

```text
Check this diagram and fix any missing @step lines: <paste the Mermaid code>
```

Claude replies with the code in a fenced `mermaid` block. Paste the code into the viewer to step through it.

What the diagram contains:
- Every request arrow shows the method and full path (`POST /api/v1/orders`).
- Every reply shows the status code and message (`201 Created`, `401 Unauthorized "Invalid email or password"`).
- `@payload` lines show the headers and body sent and returned.
- Everything is taken from your project's code, with an `@ref` to the line. What Claude can't confirm is listed under *Not confirmed* instead of drawn.

Two levels:
- **Full**, the default: every hop, middleware and error response.
- **Easy**, when you add "in easy language", "simply" or "high level": the important steps only, in everyday words, with calls and status codes still exact.

## 2. Claude app chat (claude.ai, desktop, mobile)

1. Open **Settings → Capabilities**. Turn on **Code execution and file creation**, since skills need it.
2. Open **Customize → Skills**, click **+**, then **Create skill → Upload a skill**, and pick `sequence-walkthrough.zip`. Upload the zip itself, not the whole kit.
3. Make sure the `sequence-walkthrough` toggle is on.
4. In any new chat, ask in plain words, for example: "Diagram how a password reset moves through the web app, API and database, as a walkthrough." Attach code, an API spec or logs if you have them. Add "in easy language" for the short version.

Chat uses the skill on its own when your request fits. It doesn't need to appear in the "/" menu. Menu names can move between app versions: older versions had skills under **Settings → Capabilities → Skills**. On Team and Enterprise plans, an owner may need to allow skills for the organization first.

## 3. Claude Agent SDK (your own agent, TypeScript or Python)

The Agent SDK loads skills from the same folders as Claude Code. Put the folder in `<your project>/.claude/skills/sequence-walkthrough/` (or in `~/.claude/skills/`), then turn on the filesystem setting sources.

TypeScript (`npm install @anthropic-ai/claude-agent-sdk`):

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Make a walkthrough diagram of the payment flow in ./src",
  options: {
    cwd: process.cwd(),                    // .claude/skills/ lives here or in a parent folder
    settingSources: ["user", "project"],   // load skills from ~/.claude and ./.claude
    skills: ["sequence-walkthrough"],      // or "all"
    allowedTools: ["Read", "Grep", "Glob", "Bash"],
  },
})) {
  if (message.type === "system" && message.subtype === "init") console.log("skills:", message.skills);
  if (message.type === "result" && message.subtype === "success") console.log(message.result);
}
```

Python (`pip install claude-agent-sdk`):

```python
import asyncio, os
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

async def main():
    options = ClaudeAgentOptions(
        cwd=os.getcwd(),                        # .claude/skills/ lives here or in a parent folder
        setting_sources=["user", "project"],    # load skills from ~/.claude and ./.claude
        skills=["sequence-walkthrough"],        # or "all"
        allowed_tools=["Read", "Grep", "Glob", "Bash"],
    )
    async for message in query(prompt="/sequence-walkthrough diagram the login flow in ./src", options=options):
        if isinstance(message, ResultMessage) and message.subtype == "success":
            print(message.result)

asyncio.run(main())
```

Notes:

- If you set `settingSources` / `setting_sources` yourself and leave out `"project"` and `"user"`, no skills load.
- Check the `skills` list in the `init` system message to confirm `sequence-walkthrough` loaded.
- The skill returns the diagram in its reply and writes no files, so `Write` isn't needed. Add it only if your prompt asks the agent to save the diagram somewhere, for example "…and save it as docs/payment.mmd".

## 4. Claude API (Messages API with code execution)

Upload the skill once per workspace, then reference it by id in each request. The skill runs inside the code execution container.

Upload (Python, `pip install anthropic`):

```python
import anthropic

client = anthropic.Anthropic()
skill = client.skills.create(files=[open("sequence-walkthrough.zip", "rb")])
print(skill.id, skill.latest_version_id)   # keep skill.id, e.g. skill_01...
```

Upload (TypeScript, `npm install @anthropic-ai/sdk`):

```typescript
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import fs from "node:fs";

const client = new Anthropic();
const skill = await client.skills.create({
  files: [await toFile(fs.createReadStream("sequence-walkthrough.zip"), "sequence-walkthrough.zip")],
});
console.log(skill.id, skill.latest_version_id);
```

Use it in a request (Python):

```python
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    container={"skills": [{"type": "custom", "skill_id": "skill_01...", "version": "latest"}]},
    tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
    messages=[{"role": "user", "content": "Write a walkthrough sequence diagram for this webhook handler:\n\n<paste code>"}],
)
for block in response.content:
    if block.type == "text":
        print(block.text)
```

Limits: up to 20 skills per request, and the upload must be under 30 MB uncompressed. This one is about 55 KB. Uploaded skills are shared across the whole API workspace. The request shape above follows Anthropic's Skills guide at the time of writing. If the API rejects the tool type, check the current version there: <https://platform.claude.com/docs/en/build-with-claude/skills-guide>.

## 5. Claude Managed Agents

Upload the zip with the Skills API (section 4), then attach it to the agent:

```python
agent = client.beta.agents.create(
    name="Flow documenter",
    model="claude-opus-5-5",
    system="You document how requests move through our services.",
    skills=[{"type": "custom", "skill_id": "skill_01...", "version": "latest"}],
)
```

You can also skip the upload: commit the folder to `.claude/skills/sequence-walkthrough/` at the root of a GitHub repository and mount that repository on the session. Managed Agents load skills from that folder when the session starts.

## Updating the skill

- **Claude Code / Agent SDK:** replace the folder and start a new session.
- **Claude app:** delete the old skill in Customize → Skills, then upload the new zip.
- **API:** upload a new version with `client.skills.versions.create(skill_id="skill_01...", files=[open("sequence-walkthrough.zip", "rb")])`. A version is a full snapshot, so send every file each time. Requests that use `"version": "latest"` pick it up.

## Troubleshooting

- **The skill doesn't trigger.** Name it: "use the sequence-walkthrough skill to ...", or in Claude Code type `/sequence-walkthrough`.
- **"SKILL.md not found" on upload.** Upload `sequence-walkthrough.zip`, not the kit zip. Its top folder is `sequence-walkthrough/` with `SKILL.md` directly inside.
- **The viewer shows "no steps".** Every arrow needs a `%% @step` line directly above it. Ask Claude to "check this diagram with the sequence-walkthrough skill", or paste the viewer's fix-prompt into the chat.
