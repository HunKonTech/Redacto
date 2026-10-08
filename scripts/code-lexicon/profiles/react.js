/** React: names from @types/react (single-word exports only through `React.`). */
module.exports = {
  id: 'react',
  languages: ['javascript', 'typescript'],
  generate: 'react',
  signals: [
    String.raw`\buse(?:State|Effect|Context|Reducer|Callback|Memo|Ref|LayoutEffect|ImperativeHandle|Transition|DeferredValue|Id|SyncExternalStore|InsertionEffect|Optimistic|ActionState)\s*[<(]`,
    String.raw`\bReact\.\w+`,
    String.raw`\bfrom\s+['"]react(?:-dom)?(?:/[\w-]+)?['"]`,
    String.raw`\brequire\(\s*['"]react['"]`,
  ],
};
