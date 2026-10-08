/** RxJS: generated from the package's own type declarations. */
module.exports = {
  id: 'rxjs',
  languages: ['javascript', 'typescript'],
  generate: 'rxjs',
  signals: [
    String.raw`\bfrom\s+['"]rxjs(?:/operators)?['"]`,
    String.raw`\.pipe\(\s*(?:map|filter|switchMap|mergeMap|concatMap|tap|takeUntil|catchError|debounceTime|distinctUntilChanged|startWith|shareReplay)\s*\(`,
    String.raw`\bnew\s+(?:BehaviorSubject|ReplaySubject|AsyncSubject|Subject|Observable)\s*[<(]`,
  ],
  // Operators are single words by design (`map`, `filter`, `take`).
  functions: 'all',
  exclude: ['config', 'noop', 'identity', 'pipe', 'from'],
  valueTypes: ['Observable', 'Subject', 'BehaviorSubject', 'ReplaySubject', 'Subscription'],
};
