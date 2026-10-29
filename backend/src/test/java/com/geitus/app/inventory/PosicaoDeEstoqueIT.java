package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.ProdutoService;
import com.geitus.app.catalog.dto.EmbalagemRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;

import jakarta.persistence.EntityManagerFactory;

/**
 * {@code GET /api/estoque/posicao} e {@code /resumo} de ponta a ponta, com o
 * contexto Spring completo e um PostgreSQL real (docs/modules/estoque.md,
 * regras 22 a 25): autenticacao, leitura pelo OPERADOR, isolamento por
 * empresa, campos da linha, parametros invalidos e numero de comandos
 * constante por pagina. Requer Docker.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Import(CenarioDeEstoque.class)
class PosicaoDeEstoqueIT {

    private static final String POSICAO = "/api/estoque/posicao";
    private static final String RESUMO = "/api/estoque/posicao/resumo";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configurarDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.jpa.properties.hibernate.generate_statistics", () -> "true");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CenarioDeEstoque cenario;

    @Autowired
    private ProdutoService produtoService;

    @Autowired
    private PosicaoDeEstoqueService posicaoService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    void semTokenDa401() throws Exception {
        mockMvc.perform(get(POSICAO)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(RESUMO)).andExpect(status().isUnauthorized());
    }

    @Test
    void operadorLeAPosicaoEOResumo() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        Long operador = cenario.novoUsuario(empresa.empresa(), "Operador", "OPERADOR");
        cenario.novoProduto(empresa, "UN", "Arroz");

        mockMvc.perform(get(POSICAO).header("Authorization", cenario.token(operador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.tamanho").value(25));
        mockMvc.perform(get(RESUMO).header("Authorization", cenario.token(operador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.produtos").value(1))
                .andExpect(jsonPath("$.zerados").value(1))
                .andExpect(jsonPath("$.semEstoque").doesNotExist());
    }

    @Test
    void linhaTrazSaldoSituacaoValorEEmbalagemPrincipal() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        EmbalagemRequest caixa = new EmbalagemRequest(null, cenario.unidade(empresa, "CX"), new BigDecimal("12"),
                null, true, List.of());
        ProdutoResponse produto = produtoService.cadastrarParaUsuario(empresa.admin(), CenarioDeEstoque
                .produtoComCusto(cenario.unidade(empresa, "UN"), "Leite", "1.99", true, null, List.of(caixa)));
        saldo(produto.id(), "7");

        mockMvc.perform(get(POSICAO).header("Authorization", cenario.token(empresa.admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].id").value(produto.id().toString()))
                .andExpect(jsonPath("$.itens[0].nome").value("Leite"))
                .andExpect(jsonPath("$.itens[0].unidade.sigla").value("UN"))
                .andExpect(jsonPath("$.itens[0].unidade.fracionada").value(false))
                .andExpect(jsonPath("$.itens[0].ativo").value(true))
                .andExpect(jsonPath("$.itens[0].saldo").value(7.0))
                .andExpect(jsonPath("$.itens[0].situacao").value("REGULAR"))
                .andExpect(jsonPath("$.itens[0].custo").value(1.99))
                .andExpect(jsonPath("$.itens[0].valorEmCusto").value(13.93))
                .andExpect(jsonPath("$.itens[0].embalagemPrincipal.sigla").value("CX"))
                .andExpect(jsonPath("$.itens[0].embalagemPrincipal.quantidade").value(12.0))
                .andExpect(jsonPath("$.itens[0].empresaId").doesNotExist());
    }

    @Test
    void negativoAparecePeloFiltroEComValorNulo() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID negativo = cenario.novoProduto(empresa, "UN", "Vendido sem estoque");
        cenario.novoProduto(empresa, "UN", "Zerado");
        saldo(negativo, "-3");
        String token = cenario.token(empresa.admin());

        mockMvc.perform(get(POSICAO).param("situacao", "negativo").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].nome").value("Vendido sem estoque"))
                .andExpect(jsonPath("$.itens[0].situacao").value("NEGATIVO"))
                .andExpect(jsonPath("$.itens[0].valorEmCusto").doesNotExist());
        // O resumo ignora a situacao (regra 24).
        mockMvc.perform(get(RESUMO).param("situacao", "negativo").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.produtos").value(2))
                .andExpect(jsonPath("$.negativos").value(1))
                .andExpect(jsonPath("$.zerados").value(1));
    }

    @Test
    void variasSituacoesPorParametroRepetidoOuPorVirgula() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID negativo = cenario.novoProduto(empresa, "UN", "Negativo");
        cenario.novoProduto(empresa, "UN", "Zerado");
        UUID comSaldo = cenario.novoProduto(empresa, "UN", "Regular");
        saldo(negativo, "-3");
        saldo(comSaldo, "4");
        String token = cenario.token(empresa.admin());

        mockMvc.perform(get(POSICAO).param("situacao", "zerado", "negativo").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(2))
                .andExpect(jsonPath("$.itens[*].nome").value(org.hamcrest.Matchers.contains("Negativo", "Zerado")));
        mockMvc.perform(get(POSICAO).param("situacao", "zerado,negativo,zerado").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(2));
        mockMvc.perform(get(POSICAO).param("situacao", "negativo,zerado,baixo,reposicao,regular,alto")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(3));
    }

    @Test
    void outraEmpresaNaoAparece() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste minha = cenario.novaEmpresa();
        CenarioDeEstoque.EmpresaDeTeste outra = cenario.novaEmpresa();
        cenario.novoProduto(outra, "UN", "Da outra");

        mockMvc.perform(get(POSICAO).header("Authorization", cenario.token(minha.admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(0));
        mockMvc.perform(get(RESUMO).header("Authorization", cenario.token(minha.admin())))
                .andExpect(jsonPath("$.produtos").value(0))
                .andExpect(jsonPath("$.valorTotalEmCusto").value(0.0));
    }

    @Test
    void parametrosInvalidosDao400ComOCampo() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        String token = cenario.token(empresa.admin());

        mockMvc.perform(get(POSICAO).param("situacao", "sem").header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("situacao"));
        mockMvc.perform(get(POSICAO).param("situacao", "zerado", "repor").header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("situacao"));
        mockMvc.perform(get(POSICAO).param("ordem", "preco").header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("ordem"));
        mockMvc.perform(get(POSICAO).param("status", "x").header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("status"));
        mockMvc.perform(get(POSICAO).param("tamanho", "101").header("Authorization", token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void numeroDeComandosNaoCresceComAPagina() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        cenario.novoProdutoComCaixa(empresa, "Produto 1", "6");
        long comUm = comandosAoListar(empresa, 1);
        for (int i = 2; i <= 5; i++) {
            cenario.novoProdutoComCaixa(empresa, "Produto " + i, "6");
        }

        assertThat(comandosAoListar(empresa, 5)).isEqualTo(comUm);
    }

    private long comandosAoListar(CenarioDeEstoque.EmpresaDeTeste empresa, int esperados) {
        Statistics estatisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estatisticas.clear();
        assertThat(posicaoService.listarParaUsuario(empresa.admin(),
                ParametrosDaPosicao.daRequisicao(null, null, null, null, null, 0, 25)).itens()).hasSize(esperados);
        return estatisticas.getPrepareStatementCount();
    }

    /** Grava o saldo direto (a posicao so le); a linha pode nao existir ainda. */
    private void saldo(UUID produto, String saldo) {
        Long id = cenario.idInterno(produto);
        jdbcTemplate.update("""
                INSERT INTO estoque_saldos (empresa_id, produto_id, saldo)
                SELECT empresa_id, id, ? FROM produtos WHERE id = ?
                ON CONFLICT (empresa_id, produto_id) DO UPDATE SET saldo = EXCLUDED.saldo
                """, new BigDecimal(saldo), id);
    }
}
