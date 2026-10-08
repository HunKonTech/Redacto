/** Spring Framework, Spring Data and Spring Boot: generated from the jars' class files. */
module.exports = {
  id: 'spring',
  languages: ['java', 'kotlin'],
  generate: 'spring',
  signals: [
    String.raw`\borg\.springframework\b`,
    String.raw`@(?:SpringBootApplication|RestController|Controller|Service|Repository|Autowired|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping|RequestBody|PathVariable|RequestParam|Transactional)\b`,
  ],
  packages: [
    'org.springframework.http', 'org.springframework.web.bind.annotation', 'org.springframework.web.client', 'org.springframework.web.reactive.function.client',
    'org.springframework.web.server', 'org.springframework.stereotype', 'org.springframework.beans.factory.annotation', 'org.springframework.context',
    'org.springframework.context.annotation', 'org.springframework.transaction.annotation', 'org.springframework.jdbc.core', 'org.springframework.data.domain',
    'org.springframework.data.repository', 'org.springframework.data.jpa.repository', 'org.springframework.boot', 'org.springframework.test.web.servlet',
    'org.springframework.test.web.servlet.request', 'org.springframework.test.web.servlet.result', 'org.springframework.ui',
  ],
  keep: ['Pageable', 'Sort'],
  valueTypes: [
    'org/springframework/data/jpa/repository/JpaRepository', 'org/springframework/http/ResponseEntity$BodyBuilder',
    'org/springframework/http/ResponseEntity$HeadersBuilder', 'org/springframework/web/client/RestTemplate', 'org/springframework/web/client/RestClient',
    'org/springframework/web/reactive/function/client/WebClient', 'org/springframework/jdbc/core/JdbcTemplate',
    'org/springframework/test/web/servlet/MockMvc', 'org/springframework/test/web/servlet/ResultActions',
  ],
};
