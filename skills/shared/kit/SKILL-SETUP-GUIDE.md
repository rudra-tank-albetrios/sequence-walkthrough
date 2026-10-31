# Sequence diagram skills: setup guide

Two skills teach Claude to write Mermaid sequence diagrams in the annotated `walkthrough/2` format, from your project's real code. Every arrow gets a plain-language `%% @step` card, every API call shows its method and path, and every reply its status code and message. Paste the result into the Sequence Walkthrough Viewer to step through it card by card. The diagram still renders unchanged on mermaid.live, GitHub and anywhere else Mermaid runs.

| Skill | Use it for | Say |
|---|---|---|
| `seq-diagram` | The fast everyday flow, in about a minute. | "diagram this flow", "how does X work", "walk me through the checkout" |
| `detailed-seq-diagram` | Every detail, checked with the validator. Takes several minutes and more tokens. | "detailed seq diagram", "detailed flow", "full detail" |

The code comes back in the chat. A file is written only when the code is over about 50 KB, and then as one `<flow-name>.seq.md` in your project.

## What is in this kit

| File | Use it for |
|---|---|
| `SKILL-SETUP-GUIDE.md` | This guide |
| `seq-diagram.zip`, `detailed-seq-diagram.zip` | Uploading a skill to the Claude app (claude.ai, desktop, mobile) or to the Claude API |
| `seq-diagram/`, `detailed-seq-diagram/` | The skill folders, for Claude Code or an Agent SDK project |
| `install.mjs` | Installs both for Claude Code. Needs Node 20 or newer |

## 1. Claude Code (terminal, desktop app, IDE)

From the unzipped kit folder:

```bash
node install.mjs
```

This copies both skills to `~/.claude/skills` (on Windows, `C:\Users\<you>\.claude\skills`). You can run it again at any time:

- A skill that is already up to date is left alone.
- Anything it replaces moves to `~/.claude/skill-backups/<name>-<date>-<time>`.
- The old skills `sequence-walkthrough` and `detailed-seqflow` move there too, so they stop answering the same requests.

To install somewhere else, give the folder that holds `skills/`: `node install.mjs /path/to/.claude`. For one project only, copy the two folders to `<project>/.claude/skills/` and commit them, so your team gets them.

Then start a new Claude Code session, since skills are picked up when a session starts. Type `/` and look for both names.

To use them, call one by name or just ask:

```text
/seq-diagram diagram the checkout flow in ./src/checkout
```

```text
How does login work in this repo? Walk me through it.
```

```text
Give me the detailed flow of the password reset.
```

```text
Check this diagram and fix any missing @step lines: <paste the Mermaid code>
```

## 2. Claude app (claude.ai, desktop, mobile)

Skills need code execution, on a plan that has it.

1. Open **Customize → Skills**.
2. Upload `seq-diagram.zip` and `detailed-seq-diagram.zip`. If the older `sequence-walkthrough` or `detailed-seqflow` is there, remove it.
3. Turn both on.
4. Check it: say "diagram this flow", then "detailed flow", and see that each one uses the right skill.

In the app, give Claude the code (attach the files or a project), since it cannot see your disk.

The validator is a Node script. If Node cannot run where the skill runs, `detailed-seq-diagram` falls back to its checklist and says so in its reply. Everything else works, and the viewer checks the code on paste either way.

## 3. Claude API and the Agent SDK

Upload each zip as a custom skill with the Skills API, or put the two folders in `.claude/skills/` of the project your Agent SDK process runs in. Zip layout: `<skill-name>/SKILL.md` at the top.

## How to read the result

- **Modes:** Explain (default), Proposed ("how would I build X"), Scoped ("only the part after X"), Easy ("in easy language", same layers, simpler words) and Compact (only when you ask for fewer steps).
- **Layers** come from your project's own folders, in the order a request really runs, and each appears once. Middleware is always its own layer.
- **Side parts:** crons, hooks, utils, config and libraries show on the step where they act, unless a cron starts the flow.
- **`@threat`** is a possible problem seen in the code, to be checked by you. It is not a security audit.
- **Not confirmed** lists what could not be read in the code. Nothing is guessed, and a file link points only to code that was really opened.
