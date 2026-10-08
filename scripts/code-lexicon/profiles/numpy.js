/** NumPy: generated from the type stubs NumPy ships. `np` counts only as a receiver (`np.array`). */
module.exports = {
  id: 'numpy',
  languages: ['python'],
  generate: 'numpy',
  signals: [
    String.raw`^\s*import\s+numpy\b`,
    String.raw`^\s*from\s+numpy\b`,
    String.raw`\bnp\.[a-z_]+\s*[.(\[]`,
  ],
  namespaces: ['np', 'numpy'],
  classesFrom: ['numpy'],
  keep: ['ndarray', 'dtype'],
  valueTypes: ['ndarray'],
  // Keyword arguments of NumPy calls (`axis=0`, `dtype=…`).
  kwargsFrom: ['numpy._core.fromnumeric', 'numpy._core.multiarray', 'numpy._core.numeric', 'numpy._core.function_base', 'numpy._core.shape_base', 'numpy'],
};
