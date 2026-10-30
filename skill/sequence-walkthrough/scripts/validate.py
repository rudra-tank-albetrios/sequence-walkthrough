#!/usr/bin/env python3
"""Check Mermaid sequence code written in the walkthrough/2 format (walkthrough/1 files are accepted too).

Runs the same lint rules as the Sequence Walkthrough Viewer, plus syntax checks
for mistakes that make Mermaid 12 refuse or silently change the diagram.
Python 3.8+, standard library only.

Usage:
  python validate.py -                         read the code from stdin (no file needed)
  python validate.py flow.mmd [more.mmd ...]   check files (.md files: every ```mermaid block)
  python validate.py --json -                  machine-readable result
  python validate.py --strict -                hints fail the check too

Severity:
  error    Mermaid will not draw it, or drops part of a label
  warning  the viewer's own lint (missing @step, orphan annotation, ...)
  hint     house style of the sequence-walkthrough skill

Exit code: 0 = no errors or warnings, 1 = errors or warnings (or hints with --strict),
2 = a file could not be read.
"""
import json
import re
import sys

SPEC = "walkthrough/2"
ACCEPTED_SPECS = ("walkthrough/1", "walkthrough/2")
LONG_STEP = 240
FLOW_TAGS = ("spec", "title", "mode", "scope", "trigger", "term", "layer")
CHAPTER_TAGS = ("section", "summary")
STEP_TAGS = ("step", "payload", "ref", "uses", "effect", "field", "schema", "state",
             "async", "retry", "timeout", "idempotent", "unconfirmed")
KNOWN_TAGS = FLOW_TAGS + CHAPTER_TAGS + STEP_TAGS
PAYLOAD_PARTS = ("headers", "query", "params", "cookies", "body", "sql", "event", "input", "result")
LAYER_KINDS = ("person", "client", "edge", "middleware", "service", "worker", "db", "cache", "queue", "external")
USES_KINDS = ("hook", "cron", "listener", "job", "worker", "util", "config", "env", "cache", "flag", "migration", "test", "lib")
MODES = ("proposed",)

# Same keyword list as the viewer: lines starting with these are never arrows.
SEQ_KEYWORD = re.compile(
    r"^(participant|actor|note|loop|alt|else|opt|par_over|par|and|critical|option|break|rect|end|"
    r"activate|deactivate|autonumber|box|create|destroy|title|acctitle|accdescr|links?|properties|"
    r"details|sequencediagram)\b",
    re.I,
)
# Tag names may carry one dotted part: @payload.body
ANNOTATION = re.compile(r"^%%\s*@([A-Za-z]+(?:\.[A-Za-z]+)?)\b[ \t]?(.*)$")
ARROW_STRONG = re.compile(r"(<<-->>|<<->>|-->>|->>|-->|->)\s*[+-]?")
ARROW_WEAK = re.compile(r"(--x|-x|--\)|-\)|--?[|\\/]{1,2}|[|\\/]{1,2}--?)\s*[+-]?")
PARTICIPANT = re.compile(r"^(?:create\s+)?(participant|actor)\s+(.+?)\s*$", re.I)
BLOCK_START = {"loop", "alt", "opt", "par", "par_over", "critical", "break", "rect", "box"}
BLOCK_MID = {"else": ("alt",), "and": ("par", "par_over"), "option": ("critical",)}
BRANCH_KINDS = ("alt", "opt", "loop", "par", "critical", "break")
RESERVED_ALIAS = {
    "end", "alt", "else", "opt", "loop", "par", "par_over", "and", "critical", "option", "break",
    "rect", "box", "note", "participant", "actor", "activate", "deactivate", "autonumber",
    "create", "destroy", "title", "links", "link", "properties", "details",
}
ENTITY = re.compile(r"#\w+;")
HTTP_REQUEST = re.compile(r"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(/|https?://)")
STATUS = re.compile(r"^([1-5]\d\d)\b\s*(.*)$")
# A @uses reference: path:line, path:line-line, or a URL
REF_TOKEN = re.compile(r"^(https?://\S+|\S+:\d+(?:-\d+)?)$")
# Words that show a reply's @step names what the caller gets back (stems, see step-outcome)
OUTCOME_WORD = re.compile(r"\b(return|get|gets|got|see|sees|told|tell|back|answer|receiv|repl|respon)", re.I)


def find_arrow(left):
    return ARROW_STRONG.search(left) or ARROW_WEAK.search(left)


def parse_arrow_left(left):
    m = find_arrow(left)
    if not m:
        return None
    src, dst = left[: m.start()].strip(), left[m.end():].strip()
    return (src, dst, "--" in m.group(1), m.group(1)) if src and dst else None


def split_term(val):
    """'@term word: definition' -> (word, definition). Without a colon the first word is the term."""
    if ":" in val:
        word, _, text = val.partition(":")
        return word.strip(), text.strip()
    parts = val.split(None, 1)
    return (parts[0], parts[1] if len(parts) > 1 else "") if parts else ("", "")


def parse_uses(val):
    """'@uses kind name [path:line] text' -> dict or None when kind or name is missing."""
    parts = val.split()
    if len(parts) < 2:
        return None
    kind, name, rest = parts[0].lower(), parts[1], parts[2:]
    ref = ""
    if rest and REF_TOKEN.match(rest[0]):
        ref, rest = rest[0], rest[1:]
    return {"kind": kind, "name": name, "ref": ref, "text": " ".join(rest)}


class Result:
    def __init__(self, name, offset=0):
        self.name = name
        self.offset = offset  # line offset when the code came from a Markdown block
        self.issues = []
        self.summary = {}

    def add(self, line, severity, code, message):
        self.issues.append({"line": line + 1 + self.offset, "severity": severity, "code": code, "message": message})


def new_pending():
    """Step-level annotations waiting for their arrow. Mirrors the viewer's pending block."""
    return {
        "step": [], "step_line": -1, "payload": [], "refs": [], "uses": [], "effects": [], "fields": [],
        "schema": [], "state": [], "flags": [], "unconfirmed": [], "section": None, "section_line": -1, "lines": [],
    }


def pending_has_content(p):
    return any(p[k] for k in ("step", "payload", "refs", "uses", "effects", "fields", "schema", "state", "flags", "unconfirmed"))


def check(code, name="<code>", offset=0):
    """Lint one diagram. Mirrors Annotations.parse + buildFlow in the viewer."""
    res = Result(name, offset)
    warn = lambda line, msg, c: res.add(line, "warning", c, msg)
    err = lambda line, msg, c: res.add(line, "error", c, msg)
    hint = lambda line, msg, c: res.add(line, "hint", c, msg)

    lines = code.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    fm_title = ""
    if i < len(lines) and lines[i].strip() == "---":
        for j in range(i + 1, len(lines)):
            if lines[j].strip() == "---":
                i = j + 1
                break
            m = re.match(r"^title:\s*(.+)$", lines[j])
            if m:
                fm_title = m.group(1).strip().strip("\"'")

    title, title_line, spec, spec_line = "", -1, "", -1
    mode, trigger = "", ""
    diagram_type, type_line = "", -1
    layers = {}  # alias -> dict(text, kind, line)
    terms = {}  # word -> definition
    participants = {}  # alias -> display name, in order of first appearance
    actors = set()
    arrows = []
    blocks = []  # stack of (kind, line)
    branches = {}
    in_acc = False
    last_section = None  # dict(name, line, used)
    sections = []  # (name, first arrow index, line)
    flow_summary = []
    pending = new_pending()

    for i in range(i, len(lines)):
        raw = lines[i]
        t = raw.strip()
        if not t:
            continue
        if in_acc:
            if "}" in t:
                in_acc = False
            continue
        am = ANNOTATION.match(t)
        if am:
            full, val = am.group(1).lower(), am.group(2).strip()
            tag, _, part = full.partition(".")
            if tag == "spec":
                spec, spec_line = val, i
            elif tag == "title":
                title, title_line = val, i
            elif tag == "mode":
                mode = val
                if val not in MODES:
                    hint(i, '@mode "%s" is not known (only "proposed")' % val, "mode-value")
            elif tag == "scope":
                pass
            elif tag == "trigger":
                trigger = val
            elif tag == "term":
                word, text = split_term(val)
                if not word or not text:
                    warn(i, "@term needs a word and a definition: @term tombstone: …", "term-empty")
                else:
                    terms[word] = text
            elif tag == "layer":
                m = re.match(r"^(\S+)\s*(.*)$", val)
                if m:
                    alias, rest = m.group(1), m.group(2).strip()
                    kind = ""
                    km = re.match(r"^kind=(\S+)\s*(.*)$", rest)
                    if km:
                        kind, rest = km.group(1).lower(), km.group(2).strip()
                        if kind not in LAYER_KINDS:
                            hint(i, 'Layer %s has unknown kind "%s" (known: %s)' % (alias, kind, ", ".join(LAYER_KINDS)), "layer-kind")
                    layers[alias] = {"text": rest, "kind": kind, "line": i}
                else:
                    warn(i, "@layer needs an alias and a description", "layer-empty")
            elif tag == "section":
                if last_section and not last_section["used"]:
                    warn(last_section["line"], 'Chapter "%s" has no steps' % (last_section["name"] or "(no name)"), "empty-section")
                if not val:
                    warn(i, "@section needs a name", "empty-section")
                last_section = {"name": val, "line": i, "used": False, "summary": []}
                pending["section"] = val or "Untitled"
                pending["section_line"] = i
                pending["lines"].append(i)
            elif tag == "summary":
                # Belongs to the latest chapter; before any @section it describes the whole flow.
                (last_section["summary"] if last_section else flow_summary).append(val)
            elif tag == "step":
                if pending["step_line"] < 0:
                    pending["step_line"] = i
                pending["step"].append(val)
                pending["lines"].append(i)
            elif tag == "payload":
                if part and part not in PAYLOAD_PARTS:
                    warn(i, 'Unknown payload part "%s" (known: %s)' % (part, ", ".join(PAYLOAD_PARTS)), "payload-part")
                pending["payload"].append((part, val))
                pending["lines"].append(i)
            elif tag == "ref":
                if val:
                    pending["refs"].append(val)
                pending["lines"].append(i)
            elif tag == "uses":
                u = parse_uses(val)
                if not u:
                    warn(i, "@uses needs a kind and a name: @uses hook useCart …", "uses-format")
                else:
                    u["line"] = i
                    if u["kind"] == "middleware":
                        hint(i, "@uses middleware: middleware is a layer with its own @layer kind=middleware, not a side part", "uses-middleware")
                    elif u["kind"] not in USES_KINDS:
                        hint(i, 'Unknown @uses kind "%s" (known: %s)' % (u["kind"], ", ".join(USES_KINDS)), "uses-kind")
                    pending["uses"].append(u)
                pending["lines"].append(i)
            elif tag == "effect":
                pending["effects"].append(val)
                pending["lines"].append(i)
            elif tag == "field":
                if len(val.split(None, 1)) < 2:
                    warn(i, "@field needs a name and where it comes from", "field-empty")
                else:
                    pending["fields"].append(val)
                pending["lines"].append(i)
            elif tag == "schema":
                if len(val.split(None, 1)) < 2:
                    warn(i, "@schema needs a field and its rule", "schema-empty")
                else:
                    pending["schema"].append(val)
                pending["lines"].append(i)
            elif tag == "state":
                m = re.match(r"^(before|after)\b\s*(.*)$", val, re.I)
                if not m:
                    warn(i, "@state needs before or after", "state-kind")
                else:
                    pending["state"].append((m.group(1).lower(), m.group(2)))
                pending["lines"].append(i)
            elif tag in ("async", "retry", "timeout", "idempotent"):
                pending["flags"].append((tag, val))
                pending["lines"].append(i)
            elif tag == "unconfirmed":
                pending["unconfirmed"].append(val)
                pending["lines"].append(i)
            else:
                warn(i, "Unknown tag @%s (known: %s)" % (am.group(1), ", ".join("@" + x for x in KNOWN_TAGS)), "unknown-tag")
            continue
        if t.startswith("%%"):
            if t.startswith("%%{"):
                hint(i, "%%{ ... }%% is Mermaid config; walkthrough code leaves it out so the viewer's theme applies", "config")
            continue
        if not diagram_type:
            diagram_type = re.split(r"[\s:;{]", t)[0]
            type_line = i
            continue
        if not re.match(r"^sequenceDiagram$", diagram_type, re.I):
            continue

        # ---- syntax checks (Mermaid 12.2.0 behaviour, verified) ----
        body = ENTITY.sub("", t)
        if ";" in body:
            err(i, "Mermaid ends a statement at ';', so this line will not parse. Use a comma or write #59;", "semicolon")
        if "#" in body and not re.match(r"^(rect|box)\b", t, re.I):  # colours like #fee are fine there
            warn(i, "Mermaid drops everything after '#' in a label. Write #35; or 'No.' instead", "hash-cut")
        if "%%" in t:
            hint(i, "Mermaid keeps '%%' inside a line as label text. Put comments on their own line", "inline-comment")

        if re.match(r"^acc(Descr|Title)\s*\{", t, re.I) and "}" not in t:
            in_acc = True
            continue
        if SEQ_KEYWORD.match(t):
            word = t.split()[0].lower()
            pm = PARTICIPANT.match(t)
            if pm:
                rest = re.sub(r"@\{.*\}\s*$", "", pm.group(2)).strip()
                am2 = re.match(r"^(\S+)(?:\s+as\s+(.+))?$", rest)
                if am2:
                    alias = am2.group(1)
                    if alias.lower() in RESERVED_ALIAS:
                        err(i, 'Alias "%s" is a Mermaid keyword; pick another alias' % alias, "keyword-alias")
                    participants.setdefault(alias, (am2.group(2) or alias).strip())
                    if pm.group(1).lower() == "actor":
                        actors.add(alias)
            elif word in BLOCK_START:
                blocks.append((word, i))
                if word in BRANCH_KINDS or word == "par_over":
                    k = "par" if word == "par_over" else word
                    branches[k] = branches.get(k, 0) + 1
            elif word in BLOCK_MID:
                if not blocks or blocks[-1][0] not in BLOCK_MID[word]:
                    err(i, "'%s' only works inside %s ... end" % (word, " or ".join(BLOCK_MID[word])), "block")
            elif word == "end":
                if blocks:
                    blocks.pop()
                else:
                    err(i, "'end' without an open block (alt, opt, loop, par, critical, break, rect, box)", "block")
            continue
        if "-" not in t:
            continue  # every Mermaid arrow contains a dash

        colon = t.find(":")
        left = t[:colon].strip() if colon >= 0 else t
        text = t[colon + 1:].strip() if colon >= 0 else ""
        parsed = parse_arrow_left(left)
        if colon < 0:
            if find_arrow(t):
                err(i, "Arrow needs a label after ':' (it may be empty, but the ':' must be there)", "no-colon")
            else:
                err(i, "Mermaid will not understand this line", "unknown-line")
        elif not parsed:
            err(i, "No arrow found before ':' (use ->>, -->>, -x, -) and friends)", "unknown-line")
        if parsed:
            for alias in parsed[:2]:
                alias = alias.lstrip("+-").strip()
                if alias.lower() in RESERVED_ALIAS:
                    err(i, 'Alias "%s" is a Mermaid keyword; pick another alias' % alias, "keyword-alias")
                participants.setdefault(alias, alias)
        arrow = {
            "line": i,
            "from": parsed[0] if parsed else "?",
            "to": parsed[1].lstrip("+-").strip() if parsed else "?",
            "dotted": parsed[2] if parsed else False,
            "token": parsed[3] if parsed else "",
            "text": text,
            "step": " ".join(pending["step"]).strip(),
            "step_line": pending["step_line"],
            "payload": "\n".join(v for _, v in pending["payload"]).strip(),
            "refs": list(pending["refs"]),
            "uses": list(pending["uses"]),
            "effects": list(pending["effects"]),
            "unconfirmed": list(pending["unconfirmed"]),
        }
        if pending["section"] is not None:
            sections.append((pending["section"], len(arrows), pending["section_line"]))
            if last_section:
                last_section["used"] = True
        arrows.append(arrow)
        pending = new_pending()

    if pending_has_content(pending):
        warn(pending["lines"][0] if pending["lines"] else len(lines) - 1, "Annotation has no arrow after it", "orphan")
    if last_section and not last_section["used"]:
        warn(last_section["line"], 'Chapter "%s" has no steps' % (last_section["name"] or "(no name)"), "empty-section")

    if not re.match(r"^sequenceDiagram$", diagram_type, re.I):
        err(max(type_line, 0), "%s is for sequenceDiagram code (found %s)" % (SPEC, diagram_type or "nothing"), "not-sequence")
        res.summary = {"title": title or fm_title or "Sequence diagram", "steps": 0}
        res.issues.sort(key=lambda x: x["line"])
        return res

    for kind, line in blocks:
        err(line, "'%s' block is never closed with 'end'" % kind, "block")

    name_of = lambda a: participants.get(a, a)
    for alias, layer in layers.items():
        if alias not in participants:
            warn(layer["line"], "@layer %s: no participant has this alias" % alias, "unknown-alias")
    for n, a in enumerate(arrows, 1):
        if not a["step"]:
            warn(a["line"], "Step %d (%s → %s) has no @step" % (n, name_of(a["from"]), name_of(a["to"])), "no-step")
        if len(a["step"]) > LONG_STEP:
            warn(a["step_line"], "Step %d: @step is %d characters (keep it under %d)" % (n, len(a["step"]), LONG_STEP), "long-step")
    if not title:
        warn(max(type_line, 0), "Add %% @title <flow name> so the flow has a name", "no-title")
    if not arrows:
        warn(max(type_line, 0), "No arrows, so there is nothing to walk through", "no-arrows")

    # ---- house style (hints) ----
    if spec not in ACCEPTED_SPECS:
        hint(max(spec_line, type_line, 0), "Add %%%% @spec %s right after sequenceDiagram" % SPEC if not spec else "Unknown spec %r (expected %s)" % (spec, SPEC), "spec")
    for alias in participants:
        if alias not in layers:
            hint(max(type_line, 0), "Layer %s has no @layer description" % alias, "layer-missing")
    if len(arrows) > 8 and not sections:
        hint(max(type_line, 0), "%d steps and no @section: split the flow into 2-6 chapters" % len(arrows), "no-sections")
    if len(arrows) > 8 and not trigger:
        hint(max(title_line, type_line, 0), "%d steps and no @trigger: say what starts the flow (a click, a cron, a webhook)" % len(arrows), "no-trigger")
    for n, a in enumerate(arrows, 1):
        if len(a["refs"]) > 2:
            hint(a["line"], "Step %d has %d @ref lines: point at the one line where the hop happens (two at most)" % (n, len(a["refs"])), "many-refs")

    # ---- API detail (hints): every call shows what is sent, every reply its status and outcome ----
    last_request = {}  # (from, to) -> the latest solid arrow between them
    answered = set()
    for n, a in enumerate(arrows, 1):
        a["n"] = n
        if a["from"] == a["to"]:
            continue
        if not a["dotted"]:
            last_request[(a["from"], a["to"])] = a
            if HTTP_REQUEST.match(a["text"]) and a["text"].split()[0] in ("POST", "PUT", "PATCH") and not a["payload"]:
                hint(a["line"], "Step %d: %s has no @payload. Show what is sent: the body and any header that matters" % (n, a["text"].split("<br")[0]), "request-payload")
            continue
        req = last_request.get((a["to"], a["from"]))
        if not req or not HTTP_REQUEST.match(req["text"]):
            continue
        answered.add(req["n"])
        call = req["text"].split("<br")[0]
        status = STATUS.match(a["text"])
        if not status:
            hint(a["line"], "Step %d answers %s: start the label with the status code and reason, e.g. 201 Created" % (n, call), "reply-status")
            continue
        code_, reason = status.group(1), status.group(2).split("<br")[0]
        if code_.startswith("2") and code_ != "204" and not a["payload"]:
            hint(a["line"], "Step %d: the %s reply to %s has no @payload. Show what comes back" % (n, code_, call), "reply-payload")
        # The card for a reply must say what the caller gets: the status, its reason phrase or an outcome word.
        if a["step"]:
            step_text = a["step"].lower()
            reason_words = [w.lower() for w in re.findall(r"[A-Za-z]{3,}", reason)]
            names_outcome = code_ in step_text or any(w in step_text for w in reason_words) or OUTCOME_WORD.search(a["step"])
            if not names_outcome:
                hint(a["step_line"] if a["step_line"] >= 0 else a["line"], "Step %d: the @step of a reply should name the outcome (the status, its reason or what the caller gets back)" % n, "step-outcome")
    for a in arrows:
        if a["token"] in ("->>", "->") and a["from"] != a["to"] and HTTP_REQUEST.match(a["text"]) and a["n"] not in answered:
            hint(a["line"], "Step %d: %s gets no reply. Add the response arrow (-->>) with its status code" % (a["n"], a["text"].split("<br")[0]), "no-reply")
    with_code = {a["from"] for a in arrows if a["refs"]}  # layers whose code is in this repository
    external = {alias for alias, layer in layers.items() if layer["kind"] == "external"}
    for a in arrows:
        if not a["refs"] and a["from"] in with_code and a["from"] not in actors and a["from"] not in external:
            hint(a["line"], "Step %d has no @ref, but other steps from %s do. Link it to the line where it happens" % (a["n"], name_of(a["from"])), "no-ref")
    if with_code:  # a flow built from code: side parts should say where they live too
        for a in arrows:
            for u in a["uses"]:
                if not u["ref"]:
                    hint(u["line"], "Step %d: @uses %s %s has no path:line. Point at where it lives" % (a["n"], u["kind"], u["name"]), "uses-ref")

    chapter_names = [s[0] for s in sections]
    if sections and sections[0][1] > 0:
        chapter_names.insert(0, "Start")
    res.summary = {
        "title": title or fm_title or "Sequence diagram",
        "mode": mode or "explain",
        "steps": len(arrows),
        "explained": sum(1 for a in arrows if a["step"]),
        "layers": len(participants),
        "chapters": chapter_names,
        "branches": branches,
        "replies": sum(1 for a in arrows if a["dotted"]),
        "self_calls": sum(1 for a in arrows if a["from"] == a["to"]),
        "payloads": sum(1 for a in arrows if a["payload"]),
        "refs": sum(len(a["refs"]) for a in arrows),
        "linked": sum(1 for a in arrows if a["refs"]),
        "side_parts": sum(len(a["uses"]) for a in arrows),
        "effects": sum(len(a["effects"]) for a in arrows),
        "terms": len(terms),
        "unconfirmed": sum(len(a["unconfirmed"]) for a in arrows),
    }
    res.issues.sort(key=lambda x: (x["line"], x["severity"]))
    return res


def blocks_from_markdown(text):
    """Yield (code, line offset) for every ```mermaid fence in a Markdown file."""
    lines = text.replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        if re.match(r"^\s*(```|~~~)\s*mermaid\b", lines[i]):
            fence = lines[i].strip()[:3]
            start = i + 1
            j = start
            while j < len(lines) and not lines[j].strip().startswith(fence):
                j += 1
            yield "\n".join(lines[start:j]), start
            i = j + 1
        else:
            i += 1


def failed(res, strict):
    bad = ("error", "warning", "hint") if strict else ("error", "warning")
    return any(x["severity"] in bad for x in res.issues)


def describe(s):
    if not s.get("steps"):
        return "no steps"
    count = lambda n, word: "%d %s%s" % (n, word, "" if n == 1 else "s")
    linked = ", %d linked to code" % s["linked"] if s.get("linked") else ""
    parts = ["%s (%d explained%s)" % (count(s["steps"], "step"), s["explained"], linked), count(s["layers"], "layer")]
    if s["chapters"]:
        parts.append("%s: %s" % (count(len(s["chapters"]), "chapter"), ", ".join(s["chapters"])))
    if s["branches"]:
        parts.append("branches: " + ", ".join("%s %d" % kv for kv in sorted(s["branches"].items())))
    extras = [count(s[k], w) for k, w in (("side_parts", "side part"), ("terms", "term"), ("unconfirmed", "unconfirmed")) if s.get(k)]
    if extras:
        parts.append(", ".join(extras))
    if s.get("mode") and s["mode"] != "explain":
        parts.append("mode: " + s["mode"])
    return '"%s": %s' % (s["title"], "; ".join(parts))


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    as_json, strict = "--json" in argv, "--strict" in argv
    if not args or "--help" in argv or "-h" in args:
        print(__doc__.strip())
        return 0 if ("--help" in argv or "-h" in args) else 2
    for stream, encoding in ((sys.stdin, "utf-8-sig"), (sys.stdout, "utf-8"), (sys.stderr, "utf-8")):
        try:
            stream.reconfigure(encoding=encoding, errors="replace")
        except AttributeError:
            pass
    results, status = [], 0
    for path in args:
        try:
            text = sys.stdin.read() if path == "-" else open(path, encoding="utf-8-sig").read()
        except OSError as e:
            print("%s: cannot read (%s)" % (path, e.strerror), file=sys.stderr)
            status = 2
            continue
        name = "<stdin>" if path == "-" else path
        if path.lower().endswith((".md", ".markdown")):
            found = list(blocks_from_markdown(text))
            if not found:
                r = Result(name)
                r.add(0, "error", "no-mermaid", "No ```mermaid block in this Markdown file")
                results.append(r)
            for n, (code, off) in enumerate(found, 1):
                results.append(check(code, "%s#%d" % (name, n) if len(found) > 1 else name, off))
        else:
            results.append(check(text, name))
    for r in results:
        if failed(r, strict) and status == 0:
            status = 1
    if as_json:
        print(json.dumps({"ok": status == 0, "files": [
            {"file": r.name, "ok": not failed(r, strict), "summary": r.summary, "issues": r.issues} for r in results
        ]}, ensure_ascii=False, indent=2))
        return status
    for r in results:
        base = r.name.split("#")[0]
        print("%s: %s" % (r.name, describe(r.summary)))
        for x in r.issues:
            print("%s:%d: %s [%s] %s" % (base, x["line"], x["severity"], x["code"], x["message"]))
        counts = {s: sum(1 for x in r.issues if x["severity"] == s) for s in ("error", "warning", "hint")}
        if not failed(r, strict):
            extra = " (%d hint%s)" % (counts["hint"], "" if counts["hint"] == 1 else "s") if counts["hint"] else ""
            print("%s: clean%s" % (r.name, extra))
        else:
            print("%s: %d error(s), %d warning(s), %d hint(s)" % (r.name, counts["error"], counts["warning"], counts["hint"]))
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
