/** Angular core, common/http, router and forms: generated from the packages' own type declarations. */
module.exports = {
  id: 'angular',
  languages: ['typescript', 'javascript'],
  generate: 'angular',
  signals: [
    String.raw`\bfrom\s+['"]@angular/`,
    String.raw`@(?:Component|Injectable|NgModule|Directive|Pipe|HostListener|ViewChild)\s*\(`,
  ],
  // Single-word exports Angular code uses bare.
  keep: ['inject', 'signal', 'computed', 'effect', 'Validators', 'Router', 'Injector'],
  valueTypes: ['EventEmitter', 'FormGroup', 'FormControl', 'FormArray', 'AbstractControl', 'Router', 'ActivatedRoute', 'ChangeDetectorRef', 'ElementRef', 'HttpClient'],
  optionTypes: ['Component', 'Directive', 'NgModule', 'Injectable', 'Pipe'],
};
