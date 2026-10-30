"""Builds the Sequence Walkthrough Viewer and the skill downloads from src/ and skill/.

Run: python build.py   (Python 3.8+, standard library only)

Outputs (both folders are rebuilt from scratch each time):
  dist/                                  the website: deploy this folder as it is
    index.html                           the viewer: one self-contained page, also works opened from disk
    sequence-walkthrough.zip             the skill, ready to upload to the Claude app or the Skills API
    sequence-walkthrough-skill-kit.zip   the skill zip, the skill folder, the setup guide and the install scripts
  dist-claude/sequence-viewer.html       the same page without its document skeleton, for publishing as a Claude artifact
"""
import base64
import io
import json
import pathlib
import re
import shutil
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
ARTIFACT = ROOT / "dist-claude"
JS_ORDER = ["core.js", "render.js", "walk.js", "views.js", "export.js", "shell.js"]
# src/fonts holds Google Fonts' CSS for Recursive (wght 300-1000, MONO 0-1) and its four woff2 subsets.
# They are inlined as data: URIs: the hosted page may not fetch() font files, and exports need the bytes.
FONT_SUBSETS = ["cyrillic-ext", "vietnamese", "latin-ext", "latin"]
SKILL = ROOT / "skill" / "sequence-walkthrough"
KIT = ROOT / "skill-kit"
KIT_NAME = "sequence-walkthrough-skill-kit"
# The diagram the viewer opens with: the skill's own payment example
DEFAULT_DIAGRAM = SKILL / "examples" / "payment-idempotency.mmd"
# Only in the hosted site's <head>: a tab icon (the header's yellow diamond) and link-preview tags for chat apps
SITE_META = (
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E'
    '%3Crect width=%2732%27 height=%2732%27 rx=%277%27 fill=%27%23ffd43b%27/%3E%3Cpath d=%27M16 7l9 9-9 9-9-9z%27 fill=%27%232a2000%27/%3E%3C/svg%3E">\n'
    '<meta name="theme-color" content="#e9edf2">\n'
    '<meta property="og:type" content="website">\n'
    '<meta property="og:title" content="Sequence Walkthrough">\n'
    '<meta property="og:description" content="Paste Mermaid sequence code and walk through it step by step, one card per arrow.">\n'
)


def read(p):
    return p.read_text(encoding="utf-8")


def font_css():
    css = read(SRC / "fonts" / "recursive.css")
    for subset in FONT_SUBSETS:
        data = base64.b64encode((SRC / "fonts" / f"recursive-{subset}.woff2").read_bytes()).decode()
        css, n = re.subn(
            r"(/\* " + re.escape(subset) + r" \*/\s*@font-face \{[^}]*?src: url\()https://fonts\.gstatic\.com/[^)]+\)",
            lambda m: m.group(1) + "data:font/woff2;base64," + data + ")",
            css,
        )
        if n != 1:
            raise SystemExit(f"font subset {subset} not found in recursive.css")
    if "gstatic" in css:
        raise SystemExit("recursive.css still links a font file")
    return css


def zip_bytes(entries):
    """entries: [(name in zip, bytes)]. Fixed timestamps and order, so the same sources give the same zip."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 29, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if name.endswith((".sh", ".py")) else 0o644) << 16
            z.writestr(info, data)
    return buf.getvalue()


def skill_files():
    """The skill folder as it ships: no evals (they are for testing the skill), no caches."""
    for f in sorted(SKILL.rglob("*")):
        rel = f.relative_to(SKILL).as_posix()
        if f.is_file() and not rel.startswith("evals/") and "__pycache__" not in rel and f.suffix != ".pyc":
            yield rel, f.read_bytes()


def skill_kit():
    files = list(skill_files())
    if not any(rel == "SKILL.md" for rel, _ in files):
        raise SystemExit("skill/sequence-walkthrough/SKILL.md missing")
    skill_zip = zip_bytes([(f"sequence-walkthrough/{rel}", data) for rel, data in files])
    kit = [(f"{KIT_NAME}/{f.name}", f.read_bytes()) for f in sorted(KIT.iterdir()) if f.is_file()]
    kit.append((f"{KIT_NAME}/sequence-walkthrough.zip", skill_zip))
    kit += [(f"{KIT_NAME}/sequence-walkthrough/{rel}", data) for rel, data in files]
    return skill_zip, zip_bytes(sorted(kit))


def main():
    sample = read(DEFAULT_DIAGRAM)
    sample_js = "const SAMPLE = " + json.dumps(sample, ensure_ascii=False).replace("</", "<\\/") + ";\n"
    js = "\n".join(read(SRC / "js" / name) for name in JS_ORDER)
    skill_zip, kit = skill_kit()
    kit_js = f"const SKILL_KIT = {{ name: '{KIT_NAME}.zip', b64: '{base64.b64encode(kit).decode()}' }};\n"
    js = js.replace("'use strict';", "'use strict';\n" + sample_js + kit_js, 1)
    if "</script" in js.lower():
        raise SystemExit("JS contains </script")
    css = read(SRC / "style.css")
    body = read(SRC / "body.html")
    head = (
        "<title>Sequence Walkthrough</title>\n"
        '<meta name="description" content="Paste Mermaid sequence code and walk through it step by step.">\n'
        f"<style>\n{css}</style>\n"
        f'<style id="swv-font-css">\n{font_css()}</style>\n'
    )
    script = f"<script>\n(() => {{\n{js}\n}})();\n</script>\n"
    standalone = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + SITE_META + head + "</head>\n<body>\n" + body + script + "</body>\n</html>\n"
    )
    hosted = head + body + script
    for out in (DIST, ARTIFACT):
        if out.exists():
            shutil.rmtree(out)
        out.mkdir()
    (DIST / "index.html").write_text(standalone, encoding="utf-8", newline="\n")
    (DIST / "sequence-walkthrough.zip").write_bytes(skill_zip)
    (DIST / f"{KIT_NAME}.zip").write_bytes(kit)
    (ARTIFACT / "sequence-viewer.html").write_text(hosted, encoding="utf-8", newline="\n")
    print(f"dist/index.html {len(standalone.encode()):,} bytes, dist-claude/sequence-viewer.html {len(hosted.encode()):,} bytes")
    print(f"dist/sequence-walkthrough.zip {len(skill_zip):,} bytes, dist/{KIT_NAME}.zip {len(kit):,} bytes")


if __name__ == "__main__":
    main()
