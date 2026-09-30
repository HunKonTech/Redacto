# Fork Notice

Redacto is a modified version of **Privacy Guardrail**
(<https://github.com/dfki-dsa/pii-guardrail-browser-extension>),
Copyright 2026 Deutsches Forschungszentrum für Künstliche Intelligenz GmbH (DFKI),
licensed under the Apache License, Version 2.0.

Redacto is maintained by Benedek Koncsik as a free, non-commercial project. It is
not affiliated with, sponsored by, or endorsed by DFKI.

## Upstream base

This fork is based on upstream commit
`867306f94b3ea137add5ec4a6531ddfd6e3ba86b` (Privacy Guardrail 0.5.0, 2026-09-21).

## Modified files

In accordance with Section 4(b) of the Apache License, Version 2.0: every file
in this repository that differs from that upstream commit has been modified by
the Redacto project, and every file that does not exist there was added by it.
`git diff 867306f94b3ea137add5ec4a6531ddfd6e3ba86b` lists the exact changes.
The main changes are:

- Renamed to Redacto, with a new logo and icons; the Privacy Guardrail and DFKI
  names and logos were removed from the product (they are not licensed under
  Apache-2.0, see `NOTICE`).
- New Terms of Use, Legal Notice and Privacy Policy with Redacto's maintainer as
  the provider; the DFKI documents no longer apply to this distribution.
- The features listed under **[Unreleased]** in `CHANGELOG.md`: the side panel
  with history and restore, source-code secret detection, code identifier
  renaming, web search protection, and the IDE plugins.

## Attribution

The original `NOTICE` text is kept unchanged at the top of `NOTICE`, and the
original authors are credited in `README.md`.
