package com.geitus.app.cashier;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.PostgreSQLContainer;

import com.jayway.jsonpath.JsonPath;

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
 *
 * <p>Os atalhos {@code abrir}, {@code lancar}, {@code contar} e {@code fechar}
 * chamam a API como a tela, com o token do usuario.
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

    // ---------- Atalhos da API de sessao ----------

    protected ResultActions abrir(Long usuario, UUID ponto, String fundo, UUID chave) throws Exception {
        return enviar(usuario, "/api/caixa/sessoes", "{\"pontoId\":\"" + ponto + "\",\"fundoTroco\":" + fundo
                + ",\"chave\":\"" + chave + "\"}");
    }

    /** Abre o caixa (201) e devolve o id da sessao. */
    protected UUID abrirCaixa(Long usuario, UUID ponto, String fundo) throws Exception {
        String corpo = abrir(usuario, ponto, fundo, UUID.randomUUID()).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(corpo, "$.id"));
    }

    protected ResultActions lancar(Long usuario, UUID sessao, String tipo, String valor, String motivo, UUID chave)
            throws Exception {
        String motivoJson = motivo == null ? "null" : "\"" + motivo + "\"";
        return enviar(usuario, "/api/caixa/sessoes/" + sessao + "/movimentos", "{\"tipo\":\"" + tipo
                + "\",\"valor\":" + valor + ",\"motivo\":" + motivoJson + ",\"chave\":\"" + chave + "\"}");
    }

    protected ResultActions lancar(Long usuario, UUID sessao, String tipo, String valor) throws Exception {
        return lancar(usuario, sessao, tipo, valor, "Motivo do teste", UUID.randomUUID());
    }

    /** Contagem so do dinheiro (sessao sem movimento em outra forma), no contrato por forma. */
    protected ResultActions contar(Long usuario, UUID sessao, String dinheiroContado, String justificativa)
            throws Exception {
        return contarPorForma(usuario, sessao, "{\"DINHEIRO\":" + dinheiroContado + "}", justificativa);
    }

    /** Contagem por forma: {@code contagensJson} e o objeto {@code {"DINHEIRO": 100, "DEBITO": 20}}. */
    protected ResultActions contarPorForma(Long usuario, UUID sessao, String contagensJson, String justificativa)
            throws Exception {
        String justificativaJson = justificativa == null ? "null" : "\"" + justificativa + "\"";
        return enviar(usuario, "/api/caixa/sessoes/" + sessao + "/contagem", "{\"contagens\":" + contagensJson
                + ",\"justificativa\":" + justificativaJson + "}");
    }

    protected ResultActions fechar(Long usuario, UUID sessao, String justificativa) throws Exception {
        String justificativaJson = justificativa == null ? "null" : "\"" + justificativa + "\"";
        return enviar(usuario, "/api/caixa/sessoes/" + sessao + "/fechamento",
                "{\"justificativa\":" + justificativaJson + "}");
    }

    protected ResultActions atual(Long usuario) throws Exception {
        return mockMvc.perform(get("/api/caixa/sessoes/atual").header("Authorization", cenario.token(usuario)));
    }

    protected ResultActions detalhe(Long usuario, UUID sessao) throws Exception {
        return mockMvc.perform(get("/api/caixa/sessoes/" + sessao).header("Authorization", cenario.token(usuario)));
    }

    protected ResultActions historico(Long usuario, String consulta) throws Exception {
        return mockMvc.perform(get("/api/caixa/sessoes" + consulta).header("Authorization", cenario.token(usuario)));
    }

    protected ResultActions pontos(Long usuario) throws Exception {
        return mockMvc.perform(get("/api/caixa/pontos").header("Authorization", cenario.token(usuario)));
    }

    /** Liga ou desliga o fechamento cego da empresa pela API (ADMIN). */
    protected void fechamentoCego(CenarioDeCaixa.EmpresaDeCaixa empresa, boolean cego) throws Exception {
        mockMvc.perform(put("/api/configuracoes/caixa").header("Authorization", cenario.token(empresa.admin()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"fechamentoCego\":" + cego + "}"))
                .andExpect(status().isOk());
    }

    private ResultActions enviar(Long usuario, String caminho, String corpo) throws Exception {
        return mockMvc.perform(post(caminho).header("Authorization", cenario.token(usuario))
                .contentType(MediaType.APPLICATION_JSON).content(corpo));
    }
}
