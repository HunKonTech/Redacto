"""Synthetic training fragments built from the code lexicons.

The repository-derived snippets teach the model what real projects look
like, but pastes are often one or two lines (`$.each(orders, …)`,
`customers.Where(c => c.IsActive)`) whose library names the model saw rarely
in that shape. These fragments put the official names of the extension's
lexicons (`src/shared/code-lexicon`, built by `scripts/build-code-lexicon.js`)
next to real OWN names from the training repositories, labelled LIB and OWN.

Only the train split gets them: validation and test stay real code, so the
reported scores remain scores on unseen projects.

Spans use code-point offsets, like build_dataset.py's output.
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path

DEFAULT_LEXICON_DIR = Path(__file__).resolve().parents[2] / "src" / "shared" / "code-lexicon"

IDENTIFIER_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")

# Which lexicons apply to the extractors' languages.
LANGUAGE_LEXICONS = {
    "typescript": ["javascript.json", "profiles/jquery.json", "profiles/react.json", "profiles/lodash.json", "profiles/node.json", "profiles/express.json", "profiles/rxjs.json", "profiles/angular.json", "profiles/vue.json"],
    "csharp": ["csharp.json", "profiles/linq.json", "profiles/efcore.json", "profiles/aspnetcore.json"],
}


def load_lexicons(lexicon_dir: Path, language: str) -> list[dict]:
    out = []
    for name in LANGUAGE_LEXICONS.get(language, []):
        path = lexicon_dir / name
        if path.exists():
            out.append(json.loads(path.read_text(encoding="utf-8")))
    return out


class Fragment:
    """Builds a text piece by piece and records the label of every name in it."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.spans: list[list] = []
        self.length = 0

    def text(self, value: str) -> "Fragment":
        self.parts.append(value)
        self.length += len(value)
        return self

    def name(self, value: str, label: str) -> "Fragment":
        self.spans.append([self.length, self.length + len(value), label])
        return self.text(value)

    def own(self, value: str) -> "Fragment":
        return self.name(value, "OWN")

    def lib(self, value: str) -> "Fragment":
        return self.name(value, "LIB")

    def build(self, repo: str, lang: str) -> dict:
        return {"repo": repo, "lang": lang, "text": "".join(self.parts), "spans": self.spans}


def _pick(rng: random.Random, values) -> str:
    return rng.choice(sorted(values))


def typescript_fragment(rng: random.Random, lexicons: list[dict], own: list[str]) -> Fragment | None:
    o = lambda: rng.choice(own)  # noqa: E731
    static = [(owner, names) for lex in lexicons for owner, names in lex["members"].items() if owner in lex["globals"] and names]
    values = sorted({name for lex in lexicons for owner in lex["valueTypes"] for name in lex["members"].get(owner, [])})
    types = sorted({name for lex in lexicons for name in lex["types"]})
    hooks = sorted({name for lex in lexicons for name in lex["globals"] if name.startswith("use") and name[3:4].isupper()})
    options = [(owner, lex) for lex in lexicons for owner in lex["optionTypes"]]
    kind = rng.randrange(6)
    f = Fragment()
    if kind == 0 and static:
        receiver, members = rng.choice(static)
        f.lib(receiver).text(".").lib(rng.choice(members)).text("(").own(o()).text(", ").own(o()).text(");")
    elif kind == 1 and values:
        variable, item = o(), o()
        f.own(variable).text(".").lib(rng.choice(values)).text("((").own(item).text(") => ").own(item).text(".").own(o()).text(");")
    elif kind == 2 and types:
        f.text("function ").own(o()).text("(").own(o()).text(": ").lib(rng.choice(types)).text(") {}")
    elif kind == 3 and hooks:
        f.text("const [").own(o()).text(", ").own(o()).text("] = ").lib(rng.choice(hooks)).text("(").own(o()).text(");")
    elif kind == 4 and options and static:
        owner, lex = rng.choice(options)
        keys = lex["members"][owner]
        receiver, members = rng.choice([(r, m) for r, m in static if r in lex["globals"]] or static)
        f.lib(receiver).text(".").lib(rng.choice(members)).text("({ ").lib(rng.choice(keys)).text(": ").own(o()).text(" });")
    elif values:
        variable = o()
        f.text("const ").own(variable).text(" = ").lib("$").text("(").own(o()).text("); ").own(variable).text(".")
        jquery = next((lex for lex in lexicons if lex["id"] == "jquery"), None)
        f.lib(rng.choice(jquery["members"]["JQuery"]) if jquery else rng.choice(values)).text("();")
    else:
        return None
    return f


def csharp_fragment(rng: random.Random, lexicons: list[dict], own: list[str]) -> Fragment | None:
    o = lambda: rng.choice(own)  # noqa: E731
    values = {lex["id"]: sorted({n for owner in lex["valueTypes"] for n in lex["members"].get(owner, [])}) for lex in lexicons}
    linq = values.get("linq") or []
    ef = values.get("efcore") or []
    helpers = sorted(next((lex["globals"] for lex in lexicons if lex["id"] == "aspnetcore"), []))
    types = sorted({name for lex in lexicons for name in lex["types"]})
    kind = rng.randrange(4)
    f = Fragment()
    if kind == 0 and linq:
        item = o()[:1].lower() or "x"
        f.own(o()).text(".").lib(rng.choice(linq)).text("(").own(item).text(" => ").own(item).text(".").own(o()).text(").").lib(rng.choice(linq)).text("();")
    elif kind == 1 and ef:
        f.text("var ").own(o()).text(" = await ").own(o()).text(".").own(o()).text(".").lib(rng.choice(ef)).text("();")
    elif kind == 2 and helpers:
        f.text("return ").lib(rng.choice(helpers)).text("(").own(o()).text(");")
    elif types:
        f.text("public ").own(o()).text("(").lib(rng.choice(types)).text(" ").own(o()).text(") { }")
    else:
        return None
    return f


BUILDERS = {"typescript": typescript_fragment, "csharp": csharp_fragment}


def lexicon_fragments(rng: random.Random, train_snippets: list[dict], count: int, lexicon_dir: Path = DEFAULT_LEXICON_DIR) -> list[dict]:
    """`count` fragments per language that has lexicons, OWN names drawn from `train_snippets`."""
    own_by_lang: dict[str, set[str]] = {}
    for snippet in train_snippets:
        names = own_by_lang.setdefault(snippet["lang"], set())
        for start, end, label in snippet["spans"]:
            name = snippet["text"][start:end]
            if label == "OWN" and IDENTIFIER_RE.match(name) and len(name) > 2:
                names.add(name)
    out = []
    for lang, builder in BUILDERS.items():
        lexicons = load_lexicons(lexicon_dir, lang)
        own = sorted(own_by_lang.get(lang, set()))
        if not lexicons or not own:
            continue
        made = 0
        for _ in range(count * 3):
            if made >= count:
                break
            fragment = builder(rng, lexicons, own)
            if fragment is None:
                continue
            out.append(fragment.build(f"lexicon/{lang}", lang))
            made += 1
    return out
