#!/usr/bin/env bash
# Elkészíti a UI gépi fordítását macOS-en (scripts/i18n/machine-translate.js).
#
#   scripts/i18n/translate-macos.sh [machine-translate.js kapcsolók]
#
# Példák:
#   scripts/i18n/translate-macos.sh                      # minden hiányzó nyelv/kulcs
#   scripts/i18n/translate-macos.sh --only de,fr         # csak ezek a nyelvek
#   scripts/i18n/translate-macos.sh --force              # mindent újrafordít
#   scripts/i18n/translate-macos.sh --time-budget 30     # 30 perc után nem kezd új köteget
#   scripts/i18n/translate-macos.sh --workers 1 --cooldown 120   # 429 (túl sok kérés) esetén
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Ez a szkript macOS-re készült." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
VENV="$ROOT/.venv-i18n"

# Homebrew PATH (Apple Silicon / Intel)
for brew in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  [[ -x "$brew" ]] && eval "$("$brew" shellenv)" && break
done

command -v node >/dev/null || { echo "Hiányzik a Node.js (brew install node)." >&2; exit 1; }
command -v python3 >/dev/null || { echo "Hiányzik a Python 3 (brew install python)." >&2; exit 1; }

# A fordító git submodule
if [[ ! -f KO_language_translator/main.py ]]; then
  echo "==> KO_language_translator submodule letöltése"
  git submodule update --init KO_language_translator
fi

# Python virtuális környezet a függőségekkel
if [[ ! -x "$VENV/bin/python" ]]; then
  echo "==> Python venv létrehozása: $VENV"
  python3 -m venv "$VENV"
fi
if ! "$VENV/bin/python" -c "import deep_translator" 2>/dev/null; then
  echo "==> deep-translator telepítése"
  "$VENV/bin/pip" install --quiet --upgrade pip deep-translator
fi

echo "==> Google elérhetőségének ellenőrzése (1 kérés)"
if ! "$VENV/bin/python" -c "from deep_translator import GoogleTranslator as G; G(source='en', target='de').translate('Hello')" >/dev/null 2>&1; then
  echo "A Google most elutasítja a kéréseket (túl sok kérés / ideiglenes IP-tiltás)." >&2
  echo "Várj 30-60 percet, vagy válts hálózatot (pl. mobil hotspot), aztán futtasd újra." >&2
  exit 2
fi

echo "==> Fordítás indul"
# Altatás megakadályozása a hosszú futás alatt
caffeinate -i node scripts/i18n/machine-translate.js --python "$VENV/bin/python" "$@"

echo "==> Kész. Eredmény: src/shared/i18n/generated/"
git status --short src/shared/i18n/generated | head -20 || true
