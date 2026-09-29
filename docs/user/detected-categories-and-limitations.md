# Detected Categories And Limitations

Redacto detects a beta set of structured and free-text personal or sensitive data categories before paste.

Supported beta sites:

- `chatgpt.com`
- `chat.openai.com`
- `claude.ai`
- `gemini.google.com`

## Categories

| Group | Categories |
| --- | --- |
| Identity | `PERSON`, `USERNAME` |
| Contact | `EMAIL`, `PHONE`, `ADDRESS` |
| Financial | `CREDIT_CARD`, `IBAN`, `BANK_ACCOUNT`, `SSN` |
| Network | `IP_ADDRESS`, `HOSTNAME`, `URL`, `FILE_PATH` |
| Location | `LOCATION` |
| Password | `PASSWORD`, `SECRET` |
| Organization | `ORGANIZATION` |
| Low-signal | `DATE`, `MISC` |

Low-signal categories can be noisy and may be disabled by default or tuned in settings.

## What Pattern Detection Handles Best

Pattern recognizers are strongest when the text has a stable format, such as email addresses, credit card numbers, IBANs, IP addresses, and some phone numbers.

## Private Links And File Paths

Links and file paths are checked in every paste, not only in code. A link is replaced (`URL`) unless it points to a well-known public site — documentation, code hosting, package registries, Wikipedia, large platforms and government sites (`.gov`, `gov.hu`, `europa.eu`, …) — so a company's own website (`https://www.acme.hu/rolunk`, `linkedin.com/company/acme`) is replaced too. You can add sites to keep under **Options → Public domains** (subdomains included); `/usr/local/bin` and similar system paths are left alone.

Even on a public site, a link is replaced when it:

- points at an internal host (`.internal`, `.corp`, `.local`, `.lan`, a single-word host such as `http://jenkins:8080`) or an IP address;
- contains a user name or password (`postgres://user:password@host`);
- carries an identifier in its path, query or fragment: an email address, a UUID, a long number, hex digest or random-looking token, or a value for a key such as `token`, `key`, `session`, `email` or `user`;
- opens a private document or meeting (Google Docs and Drive, Dropbox, OneDrive, Notion, Figma, Teams, Zoom and similar), a company's own workspace (`acme.sharepoint.com`, `acme.atlassian.net`, `acme.slack.com`), or a personal profile (`linkedin.com/in/…`, a social-network handle, `medium.com/@…`).

A file path is replaced (`FILE_PATH`) when it names an account (`/home/<name>`, `/Users/<name>`, `C:\Users\<name>`, `/mnt/c/Users/<name>`), is a network share (`\\server\share\…`), or carries an identifier.

With synthetic replacements, the stand-in keeps the shape of the original so the AI treats it as a working link or path: the scheme, port, path depth, separators, file extensions and query keys stay, and service names such as `jira`, `wiki` or `docs.google.com` are kept. Hosts, account names, identifiers, credentials and project or client names are swapped for neutral values, for example `https://jira.acme.corp/browse/PAY-1234` → `https://jira.example.corp/browse/QXR-5821` or `C:\Users\mmueller\Clients\Acme\report.xlsx` → `C:\Users\casey_dev\Clients\Cedar\report.xlsx`. When the AI repeats the stand-in, it is turned back into the original.

## Secrets in Source Code

With **Detect secrets in code** on (the default, under Options → Code blocks), pasted text is also checked for:

- API keys and tokens with a recognizable shape: AWS access keys, GitHub, OpenAI/Anthropic, Stripe, Slack and Google API keys, and JSON Web Tokens (`SECRET`).
- Private key blocks (`-----BEGIN … PRIVATE KEY-----`) (`SECRET`).
- Values assigned to credential-like names, such as `password = "…"`, `DB_PASSWORD=…` or `"apiToken": "…"` (`PASSWORD` or `SECRET`). Values that are clearly code — function calls, `os.environ[...]`, `${VAR}` — or obvious placeholders are skipped; token-like names only count when the value looks random.
- The user, password and host of connection strings such as `postgres://user:password@host` (`USERNAME`, `PASSWORD`, `HOSTNAME`).
- Hostnames under private-network suffixes such as `.internal`, `.corp`, `.local` or `.lan` (`HOSTNAME`).
- Account names in home-directory paths such as `/Users/<name>/`, `/home/<name>/` or `C:\Users\<name>\` (`USERNAME`).

With Local AI on, code is also read with its identifiers split into words, so a name hidden in `getAnnaMuellerInvoice` or `anna_mueller_id` can be found. When a word inside an identifier is flagged, every other identifier containing that word is flagged too, so the name is replaced the same way throughout the paste.

Replacements keep the code valid. Inside quoted strings and comments the usual placeholder is used, such as `[SECRET_1]`, which is itself a valid string. Inside an identifier the brackets are dropped: `getAnnaMuellerInvoice` becomes `getPERSON_1Invoice`. When you copy code back from a reply, those placeholders are restored inside identifiers too, including new identifiers the AI built from them, such as `setPERSON_1Invoice`. Only words the detector flags are changed; other variable, function and class names stay as they are. If you untick one occurrence of a flagged identifier word in the review, the others are still replaced, and the pasted code may no longer compile.

### Renaming code identifiers

With **Rename code identifiers** on (Options → Code blocks, off by default), the classes, functions, variables, fields and parameters that pasted code declares are renamed after the review, the same way everywhere in the paste:

```text
alma = Alma("piros")        →   var3 = Class1("piros")
print(alma.nev)             →   print(var3.field2)
```

- Aliases keep the original naming style: `_etags` → `_field2`, `ClientName` → `Field3`, `MAX_SIZE` → `CONST_4`, `load_user` → `func_5`.
- Every name the code declares is renamed, however generic: `Name`, `Url`, `value`, `args`, `i`. So are the names it uses without declaring them, which are taken to come from elsewhere in your project: `(L.IsHu ? DescriptionHu : DescriptionEn)` becomes `(Class2.Field3 ? Field4 : Field5)`. Imported names and well-known library and runtime names are left alone (`requests.get`, `Console.WriteLine`, `Math.max`, `response.status_code`), as are keywords, `self`/`this`, entry points such as `main`, overridden methods and Python `__dunder__` names. Member access is renamed only on the snippet's own objects (`alma.nev`, `self.nev`, `this.nev`).
- A name in which Local AI finds personal data keeps a typed placeholder instead (`getAnnaMuellerInvoice` → `getPERSON_1Invoice`).
- Names are also renamed inside interpolations (`f"{alma.nev}"`, `` `${alma}` ``, `$"{alma}"`) and in comments, but not inside plain strings.
- Aliases are remembered: with cross-session memory on they are stored in the identity vault as `IDENTIFIER` records, so `alma` is `var3` in every later paste, including pastes that only use it. When you copy code back from a reply, every alias is restored to the original name, also in code the AI added.
- The review's **Replaced** tab shows the renamed code before you paste. Renaming also applies on protected web search pages, and to code pasted as a single line when it holds several statements (`int a = 1; var b = a;`).
- Nothing is renamed in text that does not look like code. The analysis reads code shapes rather than compiling it, so an unusual declaration can be missed (its name then stays) and a library name that happens to match one of your names can be renamed (it is restored on copy-back).

#### Error messages and stack traces

Error output pasted with the code, or on its own, is renamed too: stack traces from Python, Node/JavaScript/TypeScript, .NET, Java/Kotlin, Go and Rust, exception lines, and compiler diagnostics from tsc, the C# compiler, gcc/clang, javac, kotlinc, rustc and `go build`.

```text
   at Acme.Billing.InvoiceService.LoadInvoice(Int32 id) in C:\src\Acme\InvoiceService.cs:line 42
→  at Ns1.Ns2.Class3.Func4(Int32 id) in C:\src\Acme\Class3.cs:line 42
```

- A name renamed in the code gets the same alias in the error output (`in load_invoice` → `in func_1`, `Property 'customerName'` → `Property 'field2'`).
- The namespaces, classes and methods of your own stack frames are renamed even when no code is pasted (`Acme` → `Ns1`); frames of libraries and the runtime (`System.`, `java.`, `node_modules/`, `site-packages/`, the Go and Rust standard libraries) stay as they are. In Java package names the leading domain (`com`, `org`, …) stays.
- The file name follows its class (`InvoiceService.cs` → `Class3.cs`); the folders stay. An account name in a home-directory path is replaced by the secret detection as before.
- A name the output only quotes (`'customerName'`, `` `customer_name` ``) is renamed only when the paste, or an earlier one, renames it anyway. The message text itself (`Traceback (most recent call last)`, `has no attribute`) is never changed, and neither is a `KeyError` key.

## What Local AI Helps With

Local AI can help identify context-sensitive spans such as person names, organizations, addresses, locations, usernames, passwords, and miscellaneous sensitive phrases. It can still miss spans or flag harmless text.

## Known Limits

- Detection can miss sensitive content.
- Detection can flag text that is not sensitive in context.
- Ambiguous words, short names, code, tables, and unusual formatting can reduce quality.
- Local AI can be unavailable, slow, or degraded depending on browser and device resources.
- Restoration depends on local placeholder or vault records and may not handle every response rewrite.
- Unsupported sites are outside the first public beta scope.

Redacto supports local review before sending. It does not guarantee perfect detection, prevention, or regulatory compliance.
