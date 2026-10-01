/**
 * Node's `fs` when the detection code runs under Node (tests, benchmarks),
 * `null` in the browser. Uses `process.getBuiltinModule` (Node 20.16+)
 * rather than `eval('require')`, so the extension bundles carry no eval.
 */
export function nodeFs(): typeof import('fs') | null {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  return (proc?.getBuiltinModule?.('fs') as typeof import('fs') | undefined) ?? null;
}
