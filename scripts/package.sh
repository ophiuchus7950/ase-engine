#!/usr/bin/env bash
#
# Rivela ASE — build a clean, portable source tarball for a tester/debugger.
#
# Output: ase-engine-<git-ref>.tar.gz  (and a .zip copy) in ./dist-pkg
#
# Excludes everything a fresh machine will rebuild: node_modules, .git, .env,
# scratch venvs, docs (held separately in Documents/ase-engine-docs), and
# Vite/web build output. Writes a HOW_TO_RUN.txt snapshot into the tarball so
# the tester always has the run instructions at hand.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REF="$(git describe --always --tags 2>/dev/null || echo snapshot)"
OUT="dist-pkg"
PKG_NAME="ase-engine-$REF"
OUT_DIR="$OUT/$PKG_NAME"

echo "[pkg] staging $PKG_NAME ..."
rm -rf "$OUT"
mkdir -p "$OUT_DIR"

# 1. Copy source (respecting .gitignore-like excludes).
rsync -a \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'web/node_modules/' \
  --exclude 'dist/' \
  --exclude 'dist-pkg/' \
  --exclude '.env' \
  --exclude '*.log' \
  --exclude '.scrapling-venv/' \
  --exclude 'docs/' \
  ./ "$OUT_DIR/"

# 2. Snapshot the run instructions into the package.
if [ -f "/home/zephy/Documents/ase-engine-docs/HOW_TO_RUN.md" ]; then
  cp "/home/zephy/Documents/ase-engine-docs/HOW_TO_RUN.md" "$OUT_DIR/HOW_TO_RUN.md"
elif [ -f "HOW_TO_RUN.md" ]; then
  cp "HOW_TO_RUN.md" "$OUT_DIR/HOW_TO_RUN.md"
else
  echo "[pkg] WARNING: no HOW_TO_RUN.md found; tester has no run instructions"
fi

# 3. Archive.
tar -czf "$OUT/ase-engine-$REF.tar.gz" -C "$OUT" "$PKG_NAME"
(cd "$OUT" && zip -rq "ase-engine-$REF.zip" "$PKG_NAME" 2>/dev/null || echo "[pkg] zip unavailable; tarball only")

echo "[pkg] done:"
ls -lh "$OUT"/*.tar.gz "$OUT"/*.zip 2>/dev/null || true
