/** Vue 3 and Vue Router: generated from the packages' own type declarations. */
module.exports = {
  id: 'vue',
  languages: ['javascript', 'typescript'],
  generate: 'vue',
  signals: [
    String.raw`\bfrom\s+['"]vue(?:-router)?['"]`,
    String.raw`\b(?:defineComponent|defineProps|defineEmits|defineExpose|defineModel|createApp|onMounted|onUnmounted|onBeforeMount|watchEffect)\s*[<(]`,
    String.raw`<script\s+setup\b`,
  ],
  keep: ['ref', 'reactive', 'computed', 'watch', 'provide', 'inject'],
  valueTypes: ['Ref', 'App', 'Router', 'RouteLocationNormalizedLoaded'],
  optionTypes: ['ComponentOptionsBase', 'LegacyOptions', 'RouterOptions', '_RouteRecordBase'],
};
