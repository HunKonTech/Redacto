/** Django: generated from django-stubs. */
module.exports = {
  id: 'django',
  languages: ['python'],
  generate: 'django',
  signals: [
    String.raw`^\s*from\s+django\b`,
    String.raw`^\s*import\s+django\b`,
    String.raw`\bmodels\.(?:Model|CharField|ForeignKey|IntegerField|DateTimeField|TextField)\b`,
    String.raw`\.objects\.(?:filter|get|all|create|exclude|order_by|values|annotate|aggregate|first|count|get_or_create|select_related|prefetch_related)\s*\(`,
  ],
  namespaces: ['models', 'forms', 'admin', 'timezone', 'transaction'],
  // Shortcuts and URL helpers are called bare in views and urls.py.
  functionsFrom: ['django.shortcuts', 'django.urls.base', 'django.urls.conf'],
  classesFrom: ['django.http.*', 'django.views.generic.*', 'django.core.exceptions', 'django.db.models.query_utils', 'django.db.models.expressions'],
  membersFrom: ['django.db.models.*'],
  keep: ['Q', 'F'],
  // `ModelBase` is the model classes' metaclass: `Customer.objects`.
  valueTypes: ['QuerySet', '_QuerySet', 'BaseManager', 'Manager', 'Model', 'ModelBase'],
  // Field options (`max_length=…`, `on_delete=…`).
  kwargsFrom: ['django.db.models.fields.*'],
};
