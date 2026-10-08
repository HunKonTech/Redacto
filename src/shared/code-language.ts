import hljsCore from 'highlight.js/lib/core';
import type { HLJSApi, LanguageFn, Mode } from 'highlight.js';
import ada from 'highlight.js/lib/languages/ada';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import clojure from 'highlight.js/lib/languages/clojure';
import coffeescript from 'highlight.js/lib/languages/coffeescript';
import cpp from 'highlight.js/lib/languages/cpp';
import crystal from 'highlight.js/lib/languages/crystal';
import csharp from 'highlight.js/lib/languages/csharp';
import d from 'highlight.js/lib/languages/d';
import dart from 'highlight.js/lib/languages/dart';
import delphi from 'highlight.js/lib/languages/delphi';
import elixir from 'highlight.js/lib/languages/elixir';
import elm from 'highlight.js/lib/languages/elm';
import erlang from 'highlight.js/lib/languages/erlang';
import fortran from 'highlight.js/lib/languages/fortran';
import fsharp from 'highlight.js/lib/languages/fsharp';
import go from 'highlight.js/lib/languages/go';
import groovy from 'highlight.js/lib/languages/groovy';
import haskell from 'highlight.js/lib/languages/haskell';
import haxe from 'highlight.js/lib/languages/haxe';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import julia from 'highlight.js/lib/languages/julia';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lisp from 'highlight.js/lib/languages/lisp';
import lua from 'highlight.js/lib/languages/lua';
import matlab from 'highlight.js/lib/languages/matlab';
import nim from 'highlight.js/lib/languages/nim';
import objectivec from 'highlight.js/lib/languages/objectivec';
import ocaml from 'highlight.js/lib/languages/ocaml';
import perl from 'highlight.js/lib/languages/perl';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import prolog from 'highlight.js/lib/languages/prolog';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import scheme from 'highlight.js/lib/languages/scheme';
import smalltalk from 'highlight.js/lib/languages/smalltalk';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import tcl from 'highlight.js/lib/languages/tcl';
import typescript from 'highlight.js/lib/languages/typescript';
import vbnet from 'highlight.js/lib/languages/vbnet';
import vbscript from 'highlight.js/lib/languages/vbscript';
import verilog from 'highlight.js/lib/languages/verilog';
import vhdl from 'highlight.js/lib/languages/vhdl';
import x86asm from 'highlight.js/lib/languages/x86asm';

/**
 * Which programming language a pasted code region is written in, so code
 * renaming knows which official names (`code-lexicon`) apply. Fifty popular
 * languages are known.
 *
 * Offline and regex-only: strong signals (a fence label, `using System;`,
 * `def …:`, `package main`, `<?php` …) decide first; otherwise highlight.js's
 * auto-detection (BSD-3-Clause, only the grammars below are bundled) scores
 * the text. Short fragments rarely score clearly, and an unclear result is
 * `unknown` — renaming then behaves as it did before languages were known.
 * The same grammars' keyword and built-in lists are a language lexicon of
 * their own (`grammarNames`).
 */

const GRAMMARS = {
  javascript, typescript, python, java, csharp, cpp, c, go, rust, php, kotlin, swift, ruby, sql, bash, powershell, r, dart,
  scala, lua, perl, haskell, elixir, erlang, julia, objectivec, vbnet, fsharp, groovy, clojure, ocaml, matlab, fortran, delphi,
  x86asm, ada, lisp, scheme, prolog, smalltalk, tcl, vbscript, d, nim, crystal, elm, haxe, coffeescript, vhdl, verilog,
} satisfies Record<string, LanguageFn>;

export type KnownLanguage = keyof typeof GRAMMARS;
export type CodeLanguage = KnownLanguage | 'unknown';

export const KNOWN_LANGUAGES = Object.keys(GRAMMARS) as KnownLanguage[];

export interface LanguageGuess {
  language: CodeLanguage;
  /** 0…1; 0 for `unknown`. */
  confidence: number;
  /** What decided it. */
  source: 'fence' | 'signal' | 'highlight' | 'none';
  /**
   * Languages the text cannot be, even when the language itself is unclear
   * (`;` at line ends, `&&`, `===` rule out Python). Lets an `unknown`
   * region drop another language's built-in names.
   */
  ruledOut: CodeLanguage[];
}

const hljs: HLJSApi = hljsCore.newInstance();
let registered = false;

/** Grammars are compiled on first use, not when the module loads. */
function ensureRegistered(): void {
  if (registered) return;
  for (const [name, grammar] of Object.entries(GRAMMARS)) hljs.registerLanguage(name, grammar);
  registered = true;
}

/** Fence labels (```ts) and their languages. */
const FENCE_LABELS: Record<string, KnownLanguage> = {
  js: 'javascript', javascript: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript', mts: 'typescript',
  py: 'python', python: 'python', python3: 'python', py3: 'python', ipython: 'python',
  cs: 'csharp', csharp: 'csharp', 'c#': 'csharp', dotnet: 'csharp',
  java: 'java',
  kt: 'kotlin', kotlin: 'kotlin', kts: 'kotlin',
  go: 'go', golang: 'go',
  rs: 'rust', rust: 'rust',
  php: 'php',
  cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  c: 'c', h: 'c',
  rb: 'ruby', ruby: 'ruby', rake: 'ruby', gemspec: 'ruby',
  swift: 'swift',
  sql: 'sql', mysql: 'sql', postgresql: 'sql', postgres: 'sql', psql: 'sql', plsql: 'sql', tsql: 'sql', sqlite: 'sql',
  sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', shellscript: 'bash',
  ps: 'powershell', ps1: 'powershell', powershell: 'powershell', pwsh: 'powershell',
  r: 'r', rscript: 'r',
  dart: 'dart', flutter: 'dart',
  scala: 'scala', sc: 'scala',
  lua: 'lua',
  pl: 'perl', perl: 'perl', pm: 'perl',
  hs: 'haskell', haskell: 'haskell',
  ex: 'elixir', exs: 'elixir', elixir: 'elixir',
  erl: 'erlang', erlang: 'erlang',
  jl: 'julia', julia: 'julia',
  objc: 'objectivec', objectivec: 'objectivec', 'objective-c': 'objectivec', mm: 'objectivec',
  vb: 'vbnet', vbnet: 'vbnet', 'vb.net': 'vbnet', visualbasic: 'vbnet',
  fs: 'fsharp', fsharp: 'fsharp', 'f#': 'fsharp', fsx: 'fsharp',
  groovy: 'groovy', gradle: 'groovy',
  clj: 'clojure', cljs: 'clojure', clojure: 'clojure', edn: 'clojure',
  ml: 'ocaml', ocaml: 'ocaml',
  matlab: 'matlab', octave: 'matlab',
  f90: 'fortran', f95: 'fortran', f03: 'fortran', fortran: 'fortran',
  pas: 'delphi', pascal: 'delphi', delphi: 'delphi', dpr: 'delphi', lazarus: 'delphi',
  asm: 'x86asm', nasm: 'x86asm', x86asm: 'x86asm', assembly: 'x86asm', masm: 'x86asm',
  ada: 'ada', adb: 'ada', ads: 'ada',
  lisp: 'lisp', elisp: 'lisp', 'emacs-lisp': 'lisp', commonlisp: 'lisp', cl: 'lisp',
  scm: 'scheme', scheme: 'scheme', racket: 'scheme', rkt: 'scheme',
  prolog: 'prolog',
  st: 'smalltalk', smalltalk: 'smalltalk',
  tcl: 'tcl', tk: 'tcl',
  vbs: 'vbscript', vbscript: 'vbscript',
  d: 'd', dlang: 'd',
  nim: 'nim',
  cr: 'crystal', crystal: 'crystal',
  elm: 'elm',
  hx: 'haxe', haxe: 'haxe',
  coffee: 'coffeescript', coffeescript: 'coffeescript',
  vhdl: 'vhdl', vhd: 'vhdl',
  v: 'verilog', verilog: 'verilog', sv: 'verilog', systemverilog: 'verilog',
};

/**
 * Patterns only one language writes. Each pattern counts once; the language
 * with the most matches wins, a tie is left to highlight.js.
 */
const SIGNALS: Partial<Record<KnownLanguage, RegExp[]>> = {
  python: [
    /^\s*def \w+\s*\(.*\)\s*(?:->\s*[^:]+)?:\s*(?:#.*)?$/m,
    /^\s*from [\w.]+ import [\w*(]/m,
    /^\s*class \w+(?:\([^)]*\))?:\s*$/m,
    /^\s*(?:el)?if .+:\s*$/m,
    /\bif __name__ == ['"]__main__['"]/,
  ],
  javascript: [
    /\brequire\(\s*['"][^'"]+['"]\s*\)/,
    /^\s*(?:export\s+)?(?:const|let|var) [\w$]+\s*=/m,
    /\bfunction\s*[\w$]*\s*\([^)]*\)\s*\{/,
    /\bconsole\.(?:log|error|warn)\(/,
    /^\s*import\s+(?:[\w$]+|\{[^}]*\}|\*\s+as\s+[\w$]+)\s+from\s+['"]/m,
    /===|!==/,
    /\bdocument\.(?:getElementById|querySelector)/,
  ],
  typescript: [
    /^\s*(?:export\s+)?interface [\w$]+(?:<[^>]*>)?\s*(?:extends [^{]+)?\{/m,
    /^\s*(?:export\s+)?type [\w$]+(?:<[^>]*>)?\s*=/m,
    /[\w$)]\??\s*:\s*(?:string|number|boolean|void|unknown|any|never)\b(?:\[\])?\s*[,)=;{]/,
    /\b(?:public|private|protected|readonly)\s+[\w$]+\s*[?!]?:\s*[\w$<[]/,
    /\bas\s+(?:const|string|number|unknown)\b/,
  ],
  csharp: [
    /^\s*using\s+System(?:\.[\w.]+)?\s*;/m,
    /\{\s*get;\s*(?:(?:private\s+|init\s*;\s*)?set;\s*)?\}/,
    /\bConsole\.Write(?:Line)?\s*\(/,
    /^\s*namespace\s+[\w.]+\s*;\s*$/m,
    /\basync\s+Task\b[\w<>?,.[\] ]*\s\w+\s*\(/,
    /\bprivate\s+readonly\s+[A-Z][\w<>?,.[\] ]*\s_?\w+\s*[;=]/,
    /\[(?:HttpGet|HttpPost|ApiController|Fact|Theory|TestMethod)\b/,
    /\b(?:string|int|bool|var)\s+\w+\s*=[^=].*;\s*$/m,
  ],
  java: [
    /^\s*package\s+[\w.]+\s*;/m,
    /^\s*import\s+(?:static\s+)?[\w.]+(?:\.\*)?\s*;/m,
    /\bSystem\.out\.print(?:ln|f)?\s*\(/,
    /\bpublic\s+static\s+void\s+main\s*\(\s*String/,
    /@Override\b/,
    /\bprivate\s+final\s+\w/,
    /^\s*public\s+(?:final\s+|abstract\s+)?class\s+\w+[^{\n]*\{\s*$/m,
    /\b(?:String|Long|Integer)\s+\w+\s*[,)=;]/,
  ],
  kotlin: [
    /\bfun\s+(?:<[^>]*>\s*)?[\w.]+\s*\(/,
    /\bval\s+\w+\s*(?::\s*\w[\w<>?, ]*)?\s*=/,
    /\bdata\s+class\s+\w+/,
    /^\s*package\s+[\w.]+\s*$/m,
    /\bprintln\s*\(\s*"[^"]*\$\{?/,
  ],
  go: [
    /^\s*package\s+\w+\s*$/m,
    /\bfunc\s+(?:\(\s*\w+\s+\*?\w+\s*\)\s*)?\w+\s*\([^)]*\)\s*(?:\(?[\w*[\], ]*\)?\s*)?\{/,
    /^\s*type\s+\w+\s+(?:struct|interface)\s*\{/m,
    /\bfmt\.\w+\s*\(/,
    /\b\w+\s*:=\s*/,
    /\bif\s+err\s*!=\s*nil\b/,
  ],
  rust: [
    /\bfn\s+\w+\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:->\s*[^{]+)?\{/,
    /\blet\s+mut\s+\w+/,
    /^\s*impl(?:<[^>]*>)?\s+[\w:<>]+(?:\s+for\s+[\w:<>]+)?\s*\{/m,
    /^\s*(?:pub\s+)?(?:struct|enum)\s+\w+[^;=]*\{/m,
    /\b(?:println|vec|format|panic)!\s*[([]/,
    /^\s*use\s+(?:std|crate|super)::/m,
  ],
  php: [
    /<\?php/,
    /\$this->/,
    /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:\??\w+\s+)?\$\w+/m,
    /\bfunction\s+\w+\s*\([^)]*\$\w+/,
    /\becho\s+['"$]/,
  ],
  cpp: [
    /^\s*#include\s*<(?:iostream|vector|string|map|unordered_map|memory|algorithm|set|thread|mutex|sstream|fstream|array|optional|functional|chrono)>/m,
    /\bstd::\w+/,
    /\btemplate\s*<\s*(?:typename|class)\b/,
    /\b(?:cout|cin|cerr)\s*<</,
    /^\s*namespace\s+\w+\s*\{/m,
  ],
  c: [
    /^\s*#include\s*<(?:stdio|stdlib|string|stdint|stdbool|math|unistd|errno|assert|ctype|time|signal|fcntl)\.h>/m,
    /\bprintf\s*\(\s*"[^"]*%[dsfculx]/,
    /\b(?:malloc|calloc|realloc|free)\s*\(/,
    /\btypedef\s+struct\b/,
  ],
  objectivec: [/^\s*#import\s*[<"]/m, /^\s*@(?:interface|implementation|protocol|end)\b/m, /@property\s*\(/, /\bNS(?:String|Array|Dictionary|Object|Log)\b/, /\[\w+\s+\w+:[^\]]*\]/],
  ruby: [
    /^\s*def\s+\w+[!?]?(?:\([^)]*\))?\s*$/m,
    /^\s*end\s*$/m,
    /\bputs\s+/,
    /^\s*require\s+['"][\w/]+['"]\s*$/m,
    /\bdo\s*\|\w+(?:,\s*\w+)*\|/,
  ],
  swift: [
    /^\s*import\s+(?:UIKit|SwiftUI|Foundation|Combine)\s*$/m,
    /\bfunc\s+\w+\s*\([^)]*\)\s*(?:async\s+)?(?:throws\s+)?->\s*\w+/,
    /\bguard\s+let\b/,
    /\bvar\s+\w+\s*:\s*some\s+View\b/,
  ],
  sql: [
    /^\s*(?:SELECT\s+[\w*]|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(?:TABLE|INDEX|VIEW|PROCEDURE)|ALTER\s+TABLE|DROP\s+TABLE)\b/im,
    /\bFROM\s+[\w.]+(?:\s+(?:AS\s+)?\w+)?\s+(?:WHERE|JOIN|INNER|LEFT|GROUP\s+BY|ORDER\s+BY)\b/i,
  ],
  bash: [
    /^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:ba|z)?sh\b/m,
    /^\s*(?:if|while)\s+\[\[?\s/m,
    /\$\{\w+[:#%/][^}]*\}/,
    /^\s*(?:export|local)\s+\w+=/m,
    /^\s*(?:fi|done|esac)\s*$/m,
  ],
  powershell: [
    /\b(?:Get|Set|New|Remove|Write|Invoke|Import|Start|Test|Out)-[A-Z]\w+/,
    /^\s*param\s*\(/im,
    /\$(?:PSScriptRoot|PSVersionTable|_\.)/,
    /\s-(?:eq|ne|lt|gt|like|match)\s/,
  ],
  r: [/<-\s*(?:function\s*\(|c\(|data\.frame\(|read\.csv\(|list\()/, /^\s*library\(\w+\)\s*$/m, /%>%/, /\$\w+\s*<-/],
  dart: [/^\s*import\s+'package:/m, /\bvoid\s+main\s*\(\s*\)\s*(?:async\s*)?\{/, /\b(?:StatelessWidget|StatefulWidget|BuildContext)\b/, /\bWidget\s+build\s*\(/, /\blate\s+(?:final\s+)?\w+/],
  scala: [/\bobject\s+\w+\s+extends\s+App\b/, /\bdef\s+\w+\s*(?:\[[^\]]*\])?\s*\([^)]*\)\s*:\s*[\w[\]]+\s*=/, /\bcase\s+class\b/, /^\s*import\s+scala\./m, /\bimplicit\s+(?:val|def)\b/],
  lua: [/\blocal\s+function\b/, /\blocal\s+\w+\s*=\s*/, /\bfunction\s+\w+[.:]\w+\s*\(/, /\b(?:i?pairs)\s*\(/, /~=/],
  perl: [/\bmy\s+[$@%]\w+/, /^\s*use\s+(?:strict|warnings)\s*;/m, /^#!.*\bperl\b/m, /\bsub\s+\w+\s*\{/, /=~\s*[ms]?\//],
  haskell: [/^\s*module\s+[A-Z][\w.]*\s+(?:\([^)]*\)\s+)?where\b/m, /^\w+\s*::\s*[A-Z[(]/m, /^import\s+(?:qualified\s+)?[A-Z][\w.]*/m, /\bwhere\s*$/m],
  elixir: [/\bdefmodule\s+[A-Z]/, /\bdefp?\s+\w+[?!]?(?:\([^)]*\))?\s+do\b/, /\|>\s*\w+\./, /\bIO\.puts\b/],
  erlang: [/^-module\(/m, /^-export\(/m, /\bio:format\(/],
  julia: [/\bfunction\s+\w+\(.*::\w+/, /^using\s+[A-Z]\w*(?:\s*,\s*\w+)*\s*$/m, /::(?:Int|Float64|String|Vector|Bool)\b/],
  vbnet: [/^\s*(?:Public|Private|Friend)?\s*(?:Sub|Function)\s+\w+\(/m, /\bDim\s+\w+\s+As\b/, /\bEnd\s+(?:Sub|Function|Class|If|Module)\b/, /^\s*Imports\s+System/m],
  vbscript: [/\bWScript\.\w+/, /\bCreateObject\s*\(\s*"/, /\bMsgBox\b/],
  fsharp: [/\bprintfn\b/, /^open\s+System/m, /^module\s+\w+\s*=?\s*$/m, /\blet\s+(?:mutable\s+)?\w+\s*=\s*\[\s*for\b/],
  ocaml: [/\blet\s+rec\b/, /;;\s*$/m, /\bPrintf\.printf\b/, /\bmodule\s+\w+\s*=\s*struct\b/],
  groovy: [/\bdef\s+\w+\s*=/, /\bprintln\s+["']/, /^\s*apply\s+plugin:/m, /\bimplementation\s+['"][\w.-]+:/],
  clojure: [/^\s*\(ns\s+[\w.-]+/m, /\(defn-?\s+[\w-]+/, /\(let\s+\[/],
  lisp: [/\(defun\s+/, /\(defvar\s+/, /\(defparameter\s+/, /\(setf\s+/, /\(format\s+t\b/],
  scheme: [/\(define\s+\(/, /^#lang\s+racket/m, /\(display\s+/],
  matlab: [/^\s*function\s+(?:\[[^\]]*\]|\w+)\s*=\s*\w+\s*\(/m, /\bzeros\(\d+\s*,\s*\d+\)/, /\bdisp\(/, /\.\*|\.\^/],
  fortran: [/^\s*program\s+\w+\s*$/im, /^\s*end\s+(?:program|subroutine|module)\b/im, /\bimplicit\s+none\b/i, /\b(?:integer|real|character)\s*(?:\([^)]*\))?\s*::/i],
  delphi: [/^\s*unit\s+\w+\s*;/im, /^\s*program\s+\w+\s*;/im, /^\s*end\.\s*$/m, /\bwriteln\s*\(/i, /^\s*(?:procedure|function)\s+\w+(?:\.\w+)?\s*(?:\([^)]*\))?\s*(?::\s*\w+)?\s*;/im],
  x86asm: [
    /^\s*(?:mov|push|pop|call|ret|jmp|jne|je|cmp|lea|xor|add|sub|inc|dec)\s+(?:[re]?[abcd]x|[re]?[sb]p|[re]?[sd]i|byte|word|dword|qword|\[)/im,
    /^\s*section\s+\.(?:text|data|bss)/im,
    /^\s*global\s+_?start/im,
    /\bint\s+0x80\b|\bsyscall\s*$/m,
  ],
  ada: [/^\s*with\s+Ada\.[\w.]+\s*;/m, /\bprocedure\s+\w+\s+is\b/, /\bPut_Line\s*\(/],
  prolog: [/^\w+\([^)]*\)\s*:-/m, /^:-\s*\w+/m, /\bnl\./],
  smalltalk: [/^\s*\|\s*\w+(?:\s+\w+)*\s*\|\s*$/m, /\bTranscript\s+show:/, /\bif(?:True|False):/, /\^\s*self\b/],
  tcl: [/^\s*proc\s+\w+\s*\{/m, /^\s*set\s+\w+\s+[[$"\d{]/m, /\[expr\s/],
  d: [/^\s*import\s+std\.\w+/m, /\bwriteln\s*\(/, /\bimmutable\s+\w+\s*=/],
  nim: [/^\s*proc\s+\w+\*?\s*\(.*\)\s*(?::\s*\w+)?\s*=\s*$/m, /\becho\s+["\w]/],
  crystal: [/\bdef\s+\w+\s*\([^)]*:\s*[A-Z]\w*[^)]*\)\s*:\s*[A-Z]/, /\b(?:Int32|Int64|Float64)\b/, /\w \: [A-Z]\w*\b/],
  elm: [/^module\s+[\w.]+\s+exposing\s*\(/m, /^import\s+[A-Z][\w.]*\s+exposing/m, /^\w+\s*:\s*[\w ]+->/m],
  haxe: [/\btrace\s*\(/, /\bfunction\s+\w+\s*\([^)]*\)\s*:\s*\w+\s*\{/, /^\s*package\s*[\w.]*\s*;\s*$/m],
  coffeescript: [/^\s*\w+\s*=\s*\([^)]*\)\s*[-=]>/m, /[-=]>\s*$/m, /#\{[^}]+\}/, /\bunless\b/],
  vhdl: [/\bentity\s+\w+\s+is\b/i, /\barchitecture\s+\w+\s+of\b/i, /\bstd_logic\b/i, /^\s*library\s+ieee\s*;/im],
  verilog: [/^\s*module\s+\w+\s*(?:#\s*\(|\()/m, /\balways\s*@/, /\bendmodule\b/, /\b(?:reg|wire)\s+(?:\[\d+:\d+\]\s*)?\w+/],
};

/** Evidence that rules a language out even when the language itself is unclear. */
const RULE_OUT: Partial<Record<KnownLanguage, RegExp>> = {
  python: /;\s*$|&&|\|\||===|!==|^\s*(?:const|let|var)\s|\+\+|\bfunction\b|\bnew\s+[A-Z]/m,
};

/** Language families: a split inside one is not a disagreement. */
const FAMILY: Partial<Record<KnownLanguage, string>> = {
  javascript: 'js', typescript: 'js', coffeescript: 'js',
  java: 'jvm', kotlin: 'jvm', groovy: 'jvm', scala: 'jvm',
  c: 'c', cpp: 'c', objectivec: 'c', d: 'c',
  ocaml: 'ml', fsharp: 'ml',
  lisp: 'lisp', scheme: 'lisp', clojure: 'lisp',
  vbnet: 'vb', vbscript: 'vb',
  ruby: 'ruby', crystal: 'ruby',
};

/**
 * The languages highlight.js may pick on its own. The others need a fence
 * label or a strong signal, or a much clearer score: with fifty grammars a
 * short snippet resembles many of them.
 */
const CORE_LANGUAGES = new Set<KnownLanguage>(['javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c', 'go', 'rust', 'php', 'kotlin', 'swift', 'ruby']);

/**
 * Whether the generic declaration analysis (`code-rename.ts`, built for
 * C-family, Python and JavaScript shapes) can be trusted for a language. In
 * the others it misreads keywords and built-ins as declarations
 * (`let rec f`, `mov eax, 1`), so their official names are never renamed.
 */
export function hasReliableDeclarations(language: CodeLanguage): boolean {
  return language === 'unknown' || CORE_LANGUAGES.has(language);
}

/** Detection reads at most this much of a region. */
const MAX_DETECT_CHARS = 4000;
/** highlight.js relevance below this is not trusted, nor a lead over the runner-up below the margin. */
const MIN_RELEVANCE = 5;
const MIN_MARGIN = 2;
const MIN_RELEVANCE_OTHER = 10;
const MIN_MARGIN_OTHER = 5;

export function languageFromFenceLabel(label: string | undefined): KnownLanguage | undefined {
  if (!label) return undefined;
  return FENCE_LABELS[label.trim().toLowerCase().split(/[\s{,]/)[0]];
}

/** The label after a region's opening fence (```ts → `ts`), if it is fenced. */
export function fenceLabelOf(text: string, start: number): string | undefined {
  if (!text.startsWith('```', start)) return undefined;
  const lineEnd = text.indexOf('\n', start);
  const label = text.slice(start, lineEnd === -1 ? text.length : lineEnd).replace(/^`+/, '').trim();
  return label || undefined;
}

function ruledOutBy(code: string, except?: CodeLanguage): CodeLanguage[] {
  return (Object.entries(RULE_OUT) as [KnownLanguage, RegExp][])
    .filter(([language, pattern]) => language !== except && pattern.test(code))
    .map(([language]) => language);
}

function signalScores(code: string): Map<KnownLanguage, number> {
  const scores = new Map<KnownLanguage, number>();
  for (const [language, patterns] of Object.entries(SIGNALS) as [KnownLanguage, RegExp[]][]) {
    const score = patterns.filter((pattern) => pattern.test(code)).length;
    if (score > 0) scores.set(language, score);
  }
  // TypeScript is JavaScript with types: a TypeScript signal settles the pair.
  if (scores.has('typescript')) {
    scores.set('typescript', (scores.get('typescript') ?? 0) + (scores.get('javascript') ?? 0));
    scores.delete('javascript');
  }
  return scores;
}

function highlightScores(code: string, candidates: readonly KnownLanguage[]): Map<KnownLanguage, number> {
  ensureRegistered();
  const scores = new Map<KnownLanguage, number>();
  for (const language of candidates) {
    const result = hljs.highlight(code, { language, ignoreIllegals: false });
    scores.set(language, result.illegal ? 0 : result.relevance);
  }
  return scores;
}

/** The best language when it leads every other family clearly; otherwise null. */
function clearWinner(
  scores: Map<KnownLanguage, number>,
  threshold: (language: KnownLanguage) => { score: number; margin: number },
): { language: KnownLanguage; lead: number } | null {
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0] ?? [];
  if (!best || bestScore === undefined) return null;
  const { score, margin } = threshold(best);
  if (bestScore < score) return null;
  const family = FAMILY[best] ?? best;
  const rival = ranked.find(([language]) => (FAMILY[language] ?? language) !== family);
  const lead = bestScore - (rival?.[1] ?? 0);
  return lead >= margin ? { language: best, lead } : null;
}

export function detectCodeLanguage(code: string, options: { fenceLabel?: string } = {}): LanguageGuess {
  const sample = code.length > MAX_DETECT_CHARS ? code.slice(0, MAX_DETECT_CHARS) : code;

  const fenced = languageFromFenceLabel(options.fenceLabel);
  if (fenced) return { language: fenced, confidence: 1, source: 'fence', ruledOut: ruledOutBy(sample, fenced) };
  if (sample.trim() === '') return { language: 'unknown', confidence: 0, source: 'none', ruledOut: [] };

  const signals = signalScores(sample);
  const bySignal = clearWinner(signals, () => ({ score: 1, margin: 1 }));
  if (bySignal) {
    return { language: bySignal.language, confidence: Math.min(1, 0.7 + 0.1 * bySignal.lead), source: 'signal', ruledOut: ruledOutBy(sample, bySignal.language) };
  }

  // Tied signals narrow the field; without any, every bundled language competes.
  const tied = [...signals.keys()];
  const candidates = tied.length > 0 ? tied : KNOWN_LANGUAGES;
  const byHighlight = clearWinner(highlightScores(sample, candidates), (language) => {
    if (tied.length > 0) return { score: 1, margin: 1 };
    return CORE_LANGUAGES.has(language) ? { score: MIN_RELEVANCE, margin: MIN_MARGIN } : { score: MIN_RELEVANCE_OTHER, margin: MIN_MARGIN_OTHER };
  });
  if (byHighlight) {
    return {
      language: byHighlight.language,
      confidence: Math.min(0.9, 0.5 + 0.05 * byHighlight.lead),
      source: 'highlight',
      ruledOut: ruledOutBy(sample, byHighlight.language),
    };
  }
  return { language: 'unknown', confidence: 0, source: 'none', ruledOut: ruledOutBy(sample) };
}

export interface GrammarNames {
  /** Reserved words and other keywords (`local`, `elseif`, `defmodule`). */
  keywords: string[];
  /** Built-in functions, types and literals (`print`, `pairs`, `nil`). */
  builtIns: string[];
}

const grammarNamesCache = new Map<KnownLanguage, GrammarNames>();

/**
 * The keyword and built-in names of a language's highlight.js grammar,
 * read from its definition (top-level keywords and those of nested modes).
 */
export function grammarNames(language: CodeLanguage): GrammarNames | undefined {
  if (language === 'unknown') return undefined;
  const cached = grammarNamesCache.get(language);
  if (cached) return cached;
  const keywords = new Set<string>();
  const builtIns = new Set<string>();
  const definition = GRAMMARS[language](hljs);
  // `SELECT`, `Dim`, `BEGIN`: case-insensitive languages are written in any case.
  const anyCase = definition.case_insensitive === true;
  const add = (target: Set<string>, value: unknown) => {
    const words = typeof value === 'string' ? value.split(/\s+/) : Array.isArray(value) ? value : [];
    for (const word of words) {
      if (typeof word !== 'string') continue;
      const name = word.replace(/\|\d+$/, '');
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      target.add(name);
      if (anyCase) {
        target.add(name.toLowerCase());
        target.add(name.toUpperCase());
        target.add(name[0].toUpperCase() + name.slice(1).toLowerCase());
      }
    }
  };
  const seen = new Set<object>();
  const visit = (mode: unknown, depth: number) => {
    if (!mode || typeof mode !== 'object' || depth > 4) return;
    if (Array.isArray(mode)) {
      for (const child of mode) visit(child, depth);
      return;
    }
    if (seen.has(mode)) return;
    seen.add(mode);
    const { keywords: words, beginKeywords, contains, variants, starts } = mode as Mode;
    if (typeof words === 'string' || Array.isArray(words)) add(keywords, words);
    else if (words && typeof words === 'object') {
      for (const [scope, value] of Object.entries(words as Record<string, unknown>)) {
        if (scope.startsWith('$')) continue;
        add(scope === 'keyword' ? keywords : builtIns, value);
      }
    }
    // `defmodule`, `def`: words that open a mode.
    if (typeof beginKeywords === 'string') add(keywords, beginKeywords);
    visit(contains, depth + 1);
    visit(variants, depth + 1);
    visit(starts, depth + 1);
  };
  visit(definition, 0);
  const names = { keywords: [...keywords], builtIns: [...builtIns] };
  grammarNamesCache.set(language, names);
  return names;
}
