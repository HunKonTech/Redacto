/** pandas: generated from pandas-stubs. `pd` / `df` shapes activate it. */
module.exports = {
  id: 'pandas',
  languages: ['python'],
  generate: 'pandas',
  signals: [
    String.raw`^\s*import\s+pandas\b`,
    String.raw`^\s*from\s+pandas\b`,
    String.raw`\bpd\.[A-Za-z_]+\s*[.(\[]`,
    String.raw`\.(?:groupby|iloc|read_csv|to_csv|pivot_table|value_counts|dropna|fillna|reset_index|sort_values)\b`,
  ],
  namespaces: ['pd', 'pandas'],
  classesFrom: ['pandas.core.frame', 'pandas.core.series', 'pandas.core.indexes.base', 'pandas._libs.tslibs.timestamps'],
  membersFrom: ['pandas.core.*'],
  keep: ['Series', 'Index', 'Timestamp'],
  valueTypes: ['DataFrame', 'Series', 'DataFrameGroupBy', 'SeriesGroupBy', 'Index'],
  kwargsFrom: ['pandas.core.frame', 'pandas.core.series', 'pandas.core.generic', 'pandas.core.groupby.*', 'pandas.io.parsers.*', 'pandas.core.reshape.*'],
};
