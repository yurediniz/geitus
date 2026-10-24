package com.geitus.app.cashier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Base dos testes de integracao do caixa: contexto Spring completo, MockMvc e
 * um PostgreSQL real (Testcontainers, Flyway com as migrations de producao).
 *
 * <p>O container e unico para todas as classes que estendem esta base
 * (iniciado uma vez; o Testcontainers o encerra no fim da JVM), e a
 * configuracao igual permite ao Spring reaproveitar o contexto entre elas.
 * Sem {@code @Transactional}: cada chamada confirma a propria transacao, como
 * em producao. Cada teste usa empresa nova ({@link CenarioDeCaixa}), entao o
 * banco nao precisa ser limpo. Requer Docker.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(CenarioDeCaixa.class)
public abstract class IntegracaoDoCaixa {

    protected static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void configurarDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected CenarioDeCaixa cenario;

    @Autowired
    protected JdbcTemplate jdbcTemplate;
}
