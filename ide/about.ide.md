## How it works

- Select code (or text in a console, terminal, Output window or error list), right-click → **Anonymize with Redacto**. The Redacto panel shows the original next to the anonymized text.
- Detects regex/checksum-backed personal data such as email addresses, phone numbers, credit cards, IBANs, IP addresses and dates, and secrets in source code: API keys and tokens from common providers, private key blocks, credentials assigned in code and configuration files, the user, password and host of connection strings, internal hostnames and account names in home-directory paths.
- **Local AI** adds a transformer NER model for names, addresses, identifiers and other free-text personal data. Detection, rules and model alike, runs on this device; nothing you select leaves it, and there is no telemetry.
- **Rename code identifiers** (on by default in the IDEs) renames the classes, methods and variables your code declares consistently (`alma` → `var3`), while leaving the language's and the well-known libraries' own names alone. Names in which Local AI finds personal data are replaced whole by a placeholder such as `PERSON_1`.
- Replacements are stable placeholders (`[EMAIL_1]`, `[PERSON_1]`) or aliases. The map is saved to **History**; paste an AI reply into **History & restore** and the original values come back, ready to copy.
- Your code and your selection are never changed.
- The **Settings** tab holds the language, Local AI, code blocks, sensitivity, allow/blocklist and identity vault settings.

## Local AI model

The plugin does not contain the Local AI model. When the Redacto panel first opens, it downloads the model once (about 170 MB) from Redacto's Hugging Face repository, checks every file against its SHA-256 and shows the progress in the panel and in the IDE. Only model files are downloaded. Until the model is there, and whenever Local AI is switched off, detection uses the pattern rules only, which cover a narrower set of categories.

## Code languages

**Rename code identifiers** detects the language of each code block, locally and offline, so it knows which names are the language's and its libraries' own (keywords, built-ins, standard library) and leaves those alone. It recognizes these 50 languages:

| | | | | |
| --- | --- | --- | --- | --- |
| JavaScript | TypeScript | Python | Java | C# |
| C++ | C | Go | Rust | PHP |
| Kotlin | Swift | Ruby | SQL | Bash |
| PowerShell | R | Dart | Scala | Lua |
| Perl | Haskell | Elixir | Erlang | Julia |
| Objective-C | VB.NET | F# | Groovy | Clojure |
| OCaml | MATLAB | Fortran | Delphi / Pascal | x86 Assembly |
| Ada | Common Lisp | Scheme | Prolog | Smalltalk |
| Tcl | VBScript | D | Nim | Crystal |
| Elm | Haxe | CoffeeScript | VHDL | Verilog |

JavaScript/TypeScript, Python, C#, Java, Kotlin, Go, PHP and Ruby also have their full standard-library names. It also recognizes jQuery, React, Lodash, Node.js, Express, Angular, Vue, RxJS, NumPy, pandas, requests, Django, ASP.NET Core, Entity Framework Core, LINQ, Spring and JUnit (with Mockito and AssertJ) from how the code uses them. Code in another language is still renamed, just without that language's own names, which errs on the side of renaming more.

## Known limitations

> **Status — public beta (`0.x`).** Detection is assistive: it helps you catch personal data before it leaves your machine, but it will not catch everything and is not a compliance or DLP product.

- Detection can miss sensitive content and can flag harmless text.
- Short names, ambiguous words, tables and unusual formatting reduce detection quality.
- Local AI can be slow or unavailable depending on the device's memory; pattern-only detection covers a narrower set of categories.
- Restoring placeholders in an AI reply depends on the local History and may not handle every rewrite.

## Documentation

- [Privacy posture](PRIVACY.md)
- [Terms of Use](TERMS.md)
- [Security reporting](SECURITY.md)
- [Support](SUPPORT.md)
- [Changelog](CHANGELOG.md)
- [IDE plugins (developer guide)](docs/developer/ide-plugins.md)
- [Impressum / Legal notice](IMPRESSUM.md)

## Fork and license

Redacto is an independent, non-commercial fork of [Privacy Guardrail](https://github.com/dfki-dsa/pii-guardrail-browser-extension) by the German Research Center for Artificial Intelligence (DFKI); it is **not affiliated with or endorsed by DFKI**. It is maintained by Benedek Koncsik and licensed under the [Apache License, Version 2.0](LICENSE). See [`NOTICE`](NOTICE), [`FORK.md`](FORK.md) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Redacto is free. If it is useful to you, you can support its development through [GitHub Sponsors](https://github.com/sponsors/BenKoncsik).
