#!/usr/bin/env python3
"""Check Mermaid sequence code written in the walkthrough/1 format.

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

KNOWN_TAGS = ("spec", "title", "layer", "section", "step", "payload", "ref")
SPEC = "walkthrough/1"
LONG_STEP = 240

# Same keyword list as the viewer: lines starting with these are never arrows.
SEQ_KEYWORD = re.compile(
    r"^(participant|actor|note|loop|alt|else|opt|par_over|par|and|critical|option|break|rect|end|"
    r"activate|deactivate|autonumber|box|create|destroy|title|acctitle|accdescr|links?|properties|"
    r"details|sequencediagram)\b",
    re.I,
)
ANNOTATION = re.compile(r"^%%\s*@([A-Za-z]+)\b[ \t]?(.*)$")
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
STATUS = re.compile(r"^([1-5]\d\d)\b")


def find_arrow(left):
    return ARROW_STRONG.search(left) or ARROW_WEAK.search(left)


def parse_arrow_left(left):
    m = find_arrow(left)
    if not m:
        return None
    src, dst = left[: m.start()].strip(), left[m.end():].strip()
    return (src, dst, "--" in m.group(1), m.group(1)) if src and dst else None


class Result:
    def __init__(self, name, offset=0):
        self.name = name
        self.offset = offset  # line offset when the code came from a Markdown block
        self.issues = []
        self.summary = {}

    def add(self, line, severity, code, message):
        self.issues.append({"line": line + 1 + self.offset, "severity": severity, "code": code, "message": message})


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
    diagram_type, type_line = "", -1
    layers = {}  # alias -> (text, line)
    participants = {}  # alias -> display name, in order of first appearance
    actors = set()
    arrows = []
    blocks = []  # stack of (kind, line)
    branches = {}
    in_acc = False
    last_section = None  # dict(name, line, used)
    sections = []  # (name, first arrow index, line)

    def new_pending():
        return {"step": [], "step_line": -1, "payload": [], "refs": [], "section": None, "section_line": -1, "lines": []}

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
            tag, val = am.group(1).lower(), am.group(2).strip()
            if tag == "spec":
                spec, spec_line = val, i
            elif tag == "title":
                title, title_line = val, i
            elif tag == "layer":
                m = re.match(r"^(\S+)\s*(.*)$", val)
                if m:
                    layers[m.group(1)] = (m.group(2).strip(), i)
                else:
                    warn(i, "@layer needs an alias and a description", "layer-empty")
            elif tag == "section":
                if last_section and not last_section["used"]:
                    warn(last_section["line"], 'Chapter "%s" has no steps' % (last_section["name"] or "(no name)"), "empty-section")
                if not val:
                    warn(i, "@section needs a name", "empty-section")
                last_section = {"name": val, "line": i, "used": False}
                pending["section"] = val or "Untitled"
                pending["section_line"] = i
                pending["lines"].append(i)
            elif tag == "step":
                if pending["step_line"] < 0:
                    pending["step_line"] = i
                pending["step"].append(val)
                pending["lines"].append(i)
            elif tag == "payload":
                pending["payload"].append(val)
                pending["lines"].append(i)
            elif tag == "ref":
                if val:
                    pending["refs"].append(val)
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
            "payload": "\n".join(pending["payload"]).strip(),
            "refs": list(pending["refs"]),
        }
        if pending["section"] is not None:
            sections.append((pending["section"], len(arrows), pending["section_line"]))
            if last_section:
                last_section["used"] = True
        arrows.append(arrow)
        pending = new_pending()

    if pending["step"] or pending["payload"] or pending["refs"]:
        warn(pending["lines"][0] if pending["lines"] else len(lines) - 1, "Annotation has no arrow after it", "orphan")
    if last_section and not last_section["used"]:
        warn(last_section["line"], 'Chapter "%s" has no steps' % (last_section["name"] or "(no name)"), "empty-section")

    if not re.match(r"^sequenceDiagram$", diagram_type, re.I):
        err(max(type_line, 0), "walkthrough/1 is for sequenceDiagram code (found %s)" % (diagram_type or "nothing"), "not-sequence")
        res.summary = {"title": title or fm_title or "Sequence diagram", "steps": 0}
        res.issues.sort(key=lambda x: x["line"])
        return res

    for kind, line in blocks:
        err(line, "'%s' block is never closed with 'end'" % kind, "block")

    name_of = lambda a: participants.get(a, a)
    for alias, (_text, line) in layers.items():
        if alias not in participants:
            warn(line, "@layer %s: no participant has this alias" % alias, "unknown-alias")
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
    if spec != SPEC:
        hint(max(spec_line, type_line, 0), "Add %%%% @spec %s right after sequenceDiagram" % SPEC if not spec else "Unknown spec %r (expected %s)" % (spec, SPEC), "spec")
    for alias in participants:
        if alias not in layers:
            hint(max(type_line, 0), "Layer %s has no @layer description" % alias, "layer-missing")
    if len(arrows) > 8 and not sections:
        hint(max(type_line, 0), "%d steps and no @section: split the flow into 2-6 chapters" % len(arrows), "no-sections")
    for n, a in enumerate(arrows, 1):
        if len(a["refs"]) > 2:
            hint(a["line"], "Step %d has %d @ref lines: point at the one line where the hop happens (two at most)" % (n, len(a["refs"])), "many-refs")

    # ---- API detail (hints): every call shows what is sent, every reply its status ----
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
        elif status.group(1).startswith("2") and status.group(1) != "204" and not a["payload"]:
            hint(a["line"], "Step %d: the %s reply to %s has no @payload. Show what comes back" % (n, status.group(1), call), "reply-payload")
    for a in arrows:
        if a["token"] in ("->>", "->") and a["from"] != a["to"] and HTTP_REQUEST.match(a["text"]) and a["n"] not in answered:
            hint(a["line"], "Step %d: %s gets no reply. Add the response arrow (-->>) with its status code" % (a["n"], a["text"].split("<br")[0]), "no-reply")
    with_code = {a["from"] for a in arrows if a["refs"]}  # layers whose code is in this repository
    for a in arrows:
        if not a["refs"] and a["from"] in with_code and a["from"] not in actors:
            hint(a["line"], "Step %d has no @ref, but other steps from %s do. Link it to the line where it happens" % (a["n"], name_of(a["from"])), "no-ref")

    chapter_names = [s[0] for s in sections]
    if sections and sections[0][1] > 0:
        chapter_names.insert(0, "Start")
    res.summary = {
        "title": title or fm_title or "Sequence diagram",
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
