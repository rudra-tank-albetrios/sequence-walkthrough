#!/bin/sh
# Copies the sequence-walkthrough skill into your personal Claude Code skills folder.
# Run from the unzipped kit folder:  sh ./install-claude-code.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
src="$here/sequence-walkthrough"
[ -f "$src/SKILL.md" ] || { echo "sequence-walkthrough/SKILL.md not found next to this script." >&2; exit 1; }
dest="$HOME/.claude/skills/sequence-walkthrough"
mkdir -p "$HOME/.claude/skills"
if [ -e "$dest" ]; then
  # Outside the skills folder, so Claude Code doesn't load the old copy as a second skill.
  mkdir -p "$HOME/.claude/skill-backups"
  backup="$HOME/.claude/skill-backups/sequence-walkthrough-$(date +%Y%m%d-%H%M%S)"
  mv "$dest" "$backup"
  echo "Moved the old copy to $backup"
fi
cp -R "$src" "$dest"
echo "Installed to $dest"
echo "Start a new Claude Code session, then type /sequence-walkthrough or ask for a walkthrough diagram."
