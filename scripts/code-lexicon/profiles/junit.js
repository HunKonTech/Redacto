/** JUnit 5/6 with Mockito and AssertJ: generated from the jars' class files. */
module.exports = {
  id: 'junit',
  languages: ['java', 'kotlin'],
  generate: 'junit',
  signals: [
    String.raw`\borg\.junit\b`,
    String.raw`@(?:Test|BeforeEach|AfterEach|BeforeAll|AfterAll|ParameterizedTest|DisplayName|Nested|Disabled|ValueSource|CsvSource|MethodSource|ExtendWith)\b`,
    String.raw`\bassert(?:Equals|NotEquals|True|False|Null|NotNull|Throws|DoesNotThrow|Same|ArrayEquals|All)\s*\(`,
  ],
  packages: ['org.junit.jupiter.api', 'org.junit.jupiter.params', 'org.junit.jupiter.params.provider', 'org.mockito', 'org.assertj.core.api'],
  // AssertJ's per-type assertion classes come back from `assertThat`, never written by name.
  excludeTypes: 'Assert$',
  keep: ['Assertions', 'Assumptions', 'Mockito'],
  // Statically imported in tests (`assertEquals(…)`, `mock(…)`, `assertThat(…)`).
  staticImportTypes: [
    'org/junit/jupiter/api/Assertions', 'org/junit/jupiter/api/Assumptions', 'org/mockito/Mockito', 'org/mockito/ArgumentMatchers',
    'org/mockito/BDDMockito', 'org/assertj/core/api/Assertions',
  ],
};
