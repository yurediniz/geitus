package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;

import java.math.BigDecimal;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.HistoricoDePrecos;
import com.geitus.app.catalog.ProdutoService;
import com.geitus.app.catalog.dto.CustoOrigemResponse;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.inventory.dto.AjusteEstoqueRequest;

/**
 * Transacao unica da entrada por compra (Fase B4, docs/modules/produtos-custo-entrada.md,
 * 2.2): uma falha depois do INSERT do movimento e da troca do custo no produto
 * (aqui, ao gravar a linha do historico) desfaz tudo. Classe propria porque o
 * {@code @MockitoSpyBean} muda o contexto Spring.
 *
 * <p>Requer Docker.
 */
@SpringBootTest
@Testcontainers
@Import(CenarioDeEstoque.class)
class CustoNaEntradaReversaoIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configurarDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @MockitoSpyBean
    private HistoricoDePrecos historicoDePrecos;

    @Autowired
    private EstoqueService estoqueService;

    @Autowired
    private ProdutoService produtoService;

    @Autowired
    private CenarioDeEstoque cenario;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void restaurarHistorico() {
        reset(historicoDePrecos);
    }

    private static AjusteEstoqueRequest compra(String quantidade, String custo) {
        return new AjusteEstoqueRequest(TipoMovimento.ENTRADA, new BigDecimal(quantidade), MotivoMovimento.COMPRA,
                null, UUID.randomUUID(), null, new BigDecimal(custo));
    }

    private long linhasDeCusto(UUID produto) {
        return jdbcTemplate.queryForObject("""
                SELECT count(*) FROM produto_historico_precos h JOIN produtos p ON p.id = h.produto_id
                 WHERE p.uuid = ? AND h.campo = 'CUSTO'
                """, Long.class, produto);
    }

    @Test
    void falhaAoGravarOHistoricoDesfazOMovimentoOSaldoEOCusto() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        estoqueService.ajustarParaUsuario(empresa.admin(), arroz, compra("5", "9.50"));
        CustoOrigemResponse origemAntes = produtoService.buscarPorIdParaUsuario(empresa.admin(), arroz).custoOrigem();
        doThrow(new RuntimeException("Falha simulada no historico."))
                .when(historicoDePrecos).registrarCustoDeEntradaSeMudou(any(), any(), any(), any());

        assertThatThrownBy(() -> estoqueService.ajustarParaUsuario(empresa.admin(), arroz, compra("5", "12.00")))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("Falha simulada no historico.");

        assertThat(cenario.contarMovimentos(arroz)).isEqualTo(1);
        assertThat(cenario.saldo(arroz)).isEqualByComparingTo("5");
        ProdutoResponse produto = produtoService.buscarPorIdParaUsuario(empresa.admin(), arroz);
        assertThat(produto.custo()).isEqualByComparingTo("9.50");
        assertThat(produto.custoOrigem()).isEqualTo(origemAntes);
        assertThat(linhasDeCusto(arroz)).isEqualTo(1);
    }
}
