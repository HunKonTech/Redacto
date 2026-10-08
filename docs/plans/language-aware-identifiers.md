# Terv: nyelvfelismerés és hivatalos (könyvtári) azonosítók megkímélése

Állapot: javaslat · 2026-10-08

## Probléma

A kódátnevezés (`src/shared/code-rename.ts`) nyelvfüggetlen, lexikális. Ami nincs
deklarálva vagy importálva, és nincs a beégetett `LIBRARY_NAMES` listában (vagy az
`identifier-classifier` modell nem mondja LIB-nek), azt a felhasználó saját nevének veszi
és átnevezi.

Reprodukció (modell nélkül, `planIdentifierRenames`):

```ts
function initCart(root: JQuery<HTMLElement>): void {
  const items = $('.cart-item');
  $(document).ready(() => { items.addClass('active'); });
  jQuery.ajax({ url: '/api' });
  $.each(items, (i, el) => {});
}
```

Átnevezve: `JQuery` (class), `$` (function), `jQuery`, `ajax`, `each`, `url`. Ezek
mind a jQuery hivatalos API-jának részei, így az LLM nem tudja, milyen könyvtárról van szó.

Három külön hiba:

1. **Nincs nyelv- és könyvtár-kontextus.** A lista egyetlen globális halmaz; a jQuery,
   a React, a Lodash stb. nincs benne, és a `$` sem.
2. **Könyvtári objektum tagjai átneveződnek** (`jQuery.ajax`, `$.each`): a pont után álló
   név örökli a „saját” besorolást, pedig LIB receiver tagja.
3. **Könyvtári hívás objektum-literál kulcsai** (`{ url: … }`) is átneveződnek.

## Cél

- Felismerni a beillesztett kód nyelvét (TS/JS, Python, C#, Java, Kotlin, Go, Rust, PHP…).
- Nyelvenként és felismert könyvtáranként („profil”) tudni, mi hivatalos név.
- Hivatalos osztályt, függvényt, globálist és azok tagjait soha ne nevezzük át.
- Minden offline, csomagba épített adatból; hálózat és adatgyűjtés nincs
  (`check:privacy-boundary` továbbra is zöld).

## Architektúra

```
paste ─► kódrégiók ─► [1] nyelvfelismerés ─► [2] könyvtár-profilok aktiválása
                                                  │
     Analyzer (code-rename) ◄── [3] szimbólum-lexikon (nyelv + profilok)
            │                         ▲
            └─► [4] döntési sorrend ──┴─ identifier-classifier (meglévő modell)
```

### [1] Nyelvfelismerés

Javaslat: **highlight.js `highlightAuto`**, csak a szükséges nyelvekkel (`highlight.js/lib/core`
+ ~12 nyelv regisztrálva), így kicsi a csomag.

- Licenc: **BSD-3-Clause** → Apache-2.0-val kompatibilis, csak a szerzői jogi
  közlemény kell a `THIRD_PARTY_NOTICES.md`-be és a webpack `*.LICENSE.txt`-be.
- Tisztán regex-alapú, böngészőben fut, nincs hálózat, nincs modell.
- Rövid kódnál bizonytalan, ezért erős jelek felülírják: fence-címke (```` ```ts ````),
  `import … from '…'`, `using System;`, `package main`, `def …:`, `fn …->`, `<?php`.
- Kimenet: `{ language, confidence }` régiónként; alacsony bizalomnál `unknown`, és a mai
  nyelvfüggetlen viselkedés marad (nincs regresszió).

Megvizsgált alternatívák:

| Könyvtár | Licenc | Miért nem elsődleges |
| --- | --- | --- |
| `@vscode/vscode-languagedetection` (guesslang modell, TF.js) | MIT | Pontosabb, de nagy modell + TF.js runtime; 2. fázisos opció, ha a highlight.js kevés. |
| GitHub Linguist | MIT | Ruby, fájlnév/kiterjesztés-alapú; böngészőben nem fut. |
| guesslang | MIT | Python/TensorFlow, nem böngészős. |
| web-tree-sitter + grammatikák | MIT | Valódi parser, de nyelvenként WASM; a 3. fázisban a lexer kiváltására jöhet szóba. |

### [2] Könyvtár-profilok

Profil = nyelv + könyvtár + aktiváló jelek + szimbólumhalmaz. Példa (`jquery`):

- Jelek: `import $ from 'jquery'`, `require('jquery')`, `JQuery<`, `JQueryStatic`,
  `jQuery(`/`jQuery.`, `$(` + jQuery-tagnév (`.ready(`, `.on(`, `.addClass(`, `.ajax(`).
- Szimbólumok: `$`, `jQuery`, `JQuery`, `JQueryStatic`, `JQuery.*` névtér, plusz a
  `$`/`jQuery` statikus és példány tagjai (`ajax`, `each`, `ready`, `addClass`…).

Az első körös profilok: jquery, react, lodash/underscore (`_`), node (fs, path, http),
express, angular core, vue, rxjs; Python: numpy, pandas, requests, django; C#: ASP.NET Core,
EF Core, LINQ; Java: Spring, JUnit.

### [3] Szimbólum-lexikon (build-időben generált, csomagba épített)

A listákat nem kézzel írjuk, hanem build-szkript generálja engedélyes forrásokból, és csak
**neveket** (azonosítókat) tárolunk, dokumentációt vagy kódot nem.

| Forrás | Licenc | Kompatibilis? | Mit veszünk ki |
| --- | --- | --- | --- |
| TypeScript `lib.*.d.ts` (`typescript` devDependency, már megvan) | Apache-2.0 | igen | JS/DOM globálisok, típusok, tagok |
| DefinitelyTyped `@types/jquery`, `@types/react`, `@types/lodash`, `@types/node`… | MIT | igen | exportált nevek, interfészek, tagok |
| Python `builtins` + stdlib modulnevek (CPython) | PSF-2.0 | igen | beépített nevek, modulnevek |
| .NET `dotnet/runtime` referencia-API (`ref/*.cs`) | MIT | igen | BCL típusok és tagok |
| Go stdlib | BSD-3-Clause | igen | csomag- és exportnevek |
| Rust `std` | MIT / Apache-2.0 | igen | prelude, std típusok |
| OpenJDK `java.base` | GPL-2.0 + Classpath Exception | **kerülendő** forrásként | Java nevek kézzel, a nyilvános API-névlistából (nevek, nem kód), vagy kihagyjuk |

Megjegyzés: az API-nevek puszta listája általában nem szerzői jogvédett, de a biztonság
kedvéért csak Apache-2.0-val kompatibilis forrásból generálunk, és minden forrást a
`THIRD_PARTY_NOTICES.md`-ben felsorolunk. GPL-forrásból semmit nem másolunk.

Formátum: `src/shared/code-lexicon/<nyelv>.json` és `profiles/<profil>.json`
(`{ globals: [], types: [], members: { "$": [...], "JQuery": [...] } }`), lusta betöltéssel,
csak az aktivált nyelv/profil kerül memóriába.

Generátor: `scripts/build-code-lexicon.js` (Node, offline, a `node_modules`-ból olvas).
Eredményét commitoljuk, hogy a build ne függjön hálózattól.

### [4] Döntési sorrend egy nem deklarált névre

1. A snippet deklarálja → saját (mint most).
2. Importált név (`collectImports`) → külső (mint most).
3. **Aktív profil vagy nyelvi lexikon tartalmazza → LIB.** (új)
4. **LIB receiver tagja** (`$.each`, `jQuery.ajax`, `items.addClass` ha `items` típusa/forrása
   `$()`) → LIB. (új; egyszerű adatfolyam: `const x = $(…)` → `x` „jQuery-értékű”, a tagjai LIB)
5. **Objektum-literál kulcs LIB hívás argumentumában** → nem nevezzük át. (új)
6. `identifier-classifier` modell ítélete (mint most).
7. Fallback: beégetett `LIBRARY_NAMES` (megmarad, a lexikon lassan kiváltja).

A 3–5. lépés csak *kevesebb* átnevezést okozhat. Adatvédelmi kockázat: egy saját név, ami
véletlenül egyezik egy könyvtári névvel (pl. saját `each`), nem anonimizálódik. Ezért:
- tag-szintű neveket (`ajax`, `each`) csak LIB receiver után kímélünk, önállóan nem;
- a felhasználó saját deklarációja mindig nyer (1. lépés).

## Megvalósítási lépések

1. **Tesztek a hibára**: jQuery, React, Lodash, pandas, LINQ minták a
   `tests/code-rename*.test.ts` mellé; várt: hivatalos nevek érintetlenek, saját nevek
   átnevezve.
2. **Gyors javítás (1. fázis, függőség nélkül)**: `$`, `jQuery`, `JQuery`, `JQueryStatic`,
   `_` hozzáadása + 4. és 5. lépés (receiver-tag és objektum-kulcs szabály) az `Analyzer`-ben.
3. **Lexikon-generátor** és első lexikonok (TS lib, @types/jquery|react|lodash|node, Python).
4. **Nyelvfelismerő** modul (`src/shared/code-language.ts`) highlight.js-sel + erős jelek;
   régiónként `language` a `CodeRegion`-on.
5. **Profilaktiválás** és bekötés az `Analyzer`/`isLibraryName` útvonalba.
6. **identifier-classifier tanítóadat** bővítése a lexikonnal (LIB címkék), újratanítás.
7. Licencek: `THIRD_PARTY_NOTICES.md`, `NOTICE` frissítése; `validate:ci`,
   `check:privacy-boundary`, csomagméret ellenőrzése.
8. Opcionális 2. fázis: `@vscode/vscode-languagedetection` vagy web-tree-sitter, ha a
   mérések szerint a highlight.js pontossága kevés.

## Mérés

- Új benchmark-készlet: 50–100 valós snippet nyelvenként, kézi OWN/LIB címkével.
- Metrikák: LIB megőrzési arány (cél ≥ 98% a profilban szereplő neveknél), OWN átnevezési
  arány (nem romolhat a mai ~96%-hoz képest), nyelvfelismerési pontosság.
