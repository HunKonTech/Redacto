"""Prints, as JSON, the languages KO_language_translator can translate into.

Usage: python list-languages.py <KO_language_translator dir>

Reads Google Translate's language list from deep-translator and keeps the
codes the translator's own `normalize_lang` maps to a code Google accepts,
so a language it cannot handle yet is left out until the translator is fixed.
Output: [{"code": "<Google code>", "name": "<English name>"}, ...]
"""

import json
import sys

# Importing main.py would leave a __pycache__ inside the submodule, which
# makes the self-hosted runner's shared checkout dirty for Build and Release.
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])

from deep_translator import GoogleTranslator  # noqa: E402
from main import normalize_lang  # noqa: E402

languages = GoogleTranslator(source="auto", target="en").get_supported_languages(as_dict=True)
codes = set(languages.values())
usable = [
    {"code": code, "name": name}
    for name, code in languages.items()
    if normalize_lang(code) in codes
]
print(json.dumps(usable))
