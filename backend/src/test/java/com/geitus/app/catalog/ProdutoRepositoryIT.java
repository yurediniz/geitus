package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;

/**
 * Teste de integracao do {@link ProdutoRepository} contra um PostgreSQL real
 * (Testcontainers). Exercita as queries derivadas e JPQL de verdade — algo que
 * o {@code @WebMvcTest} com mock NAO faz e que ja escondeu um bug de query
 * (function lower(bytea) does not exist). Cobre isolamento por empresa
 * (DEC-016), busca case-insensitive, filtro de status e unicidade de
 * SKU/codigo de barras.
 *
 * <p>Usa o banco do container (nao o H2 de teste) via
 * {@code @AutoConfigureTestDatabase(replace = NONE)} e deixa o Flyway aplicar
 * as migrations reais no container, garantindo o mesmo schema de producao.
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Testcontainers
class ProdutoRepositoryIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configurarDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        // Schema definido pelas migrations Flyway (mesmas de producao); o
        // Hibernate apenas valida.
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private ProdutoRepository produtoRepository;

    @Autowired
    private EmpresaRepository empresaRepository;

    private Empresa novaEmpresa(String nome) {
        Empresa empresa = new Empresa(nome);
        // Empresa FISICA (sem CNPJ): satisfaz as colunas NOT NULL e a coerencia
        // PJ/PF da migration V3, e evita colisao de CNPJ ao criar varias empresas.
        empresa.atualizarCadastro(
                nome,
                "1133224455",
                "contato@" + nome.toLowerCase().replaceAll("[^a-z0-9]", "") + ".test",
                TipoPessoa.FISICA,
                null,
                null,
                null,
                new RepresentanteLegal("Representante " + nome, "11144477735", "11987654321",
                        "rep@" + nome.toLowerCase().replaceAll("[^a-z0-9]", "") + ".test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        return empresaRepository.saveAndFlush(empresa);
    }

    private Produto novoProduto(Empresa empresa, String nome, String sku, String codigoBarras, boolean ativo) {
        Produto produto = new Produto(empresa, nome, "Mercearia", "UN", new BigDecimal("10.00"),
                null, null, codigoBarras, sku, null, null, null, null, null);
        if (!ativo) {
            produto.inativar();
        }
        return produtoRepository.saveAndFlush(produto);
    }

    // ---------- Campos cadastrais V4 (marca, descricao, hints de estoque/preco) ----------

    @Test
    void devePersistirERelerOsCamposCadastraisDaV4() {
        Empresa empresa = novaEmpresa("Empresa V4");
        Produto produto = new Produto(empresa, "Arroz 5kg", "Mercearia", "UN", new BigDecimal("25.90"),
                new BigDecimal("18.00"), new BigDecimal("2"), "789100200300", "SKU-V4",
                "Tio João", "Arroz branco tipo 1, pacote de 5kg.", new BigDecimal("50.000"),
                new BigDecimal("10.000"), new BigDecimal("20.00"));
        Long id = produtoRepository.saveAndFlush(produto).getId();

        // Limpa o contexto de persistencia (cache de 1o nivel) para forcar um
        // SELECT real no banco em vez de devolver a instancia ja gerenciada.
        entityManager.clear();
        Produto relido = produtoRepository.findById(id).orElseThrow();

        assertThat(relido.getMarca()).isEqualTo("Tio João");
        assertThat(relido.getDescricao()).isEqualTo("Arroz branco tipo 1, pacote de 5kg.");
        assertThat(relido.getEstoqueMaximo()).isEqualByComparingTo("50.000");
        assertThat(relido.getPontoReposicao()).isEqualByComparingTo("10.000");
        assertThat(relido.getPrecoMinimo()).isEqualByComparingTo("20.00");
    }

    // ---------- Isolamento por empresa (DEC-016) ----------

    @Test
    void findByIdAndEmpresaNaoDeveEncontrarProdutoDeOutraEmpresa() {
        Empresa empresaA = novaEmpresa("Empresa A");
        Empresa empresaB = novaEmpresa("Empresa B");
        Produto produtoDaA = novoProduto(empresaA, "Arroz", "SKU-A", null, true);

        assertThat(produtoRepository.findByIdAndEmpresa_Id(produtoDaA.getId(), empresaA.getId()))
                .isPresent();
        assertThat(produtoRepository.findByIdAndEmpresa_Id(produtoDaA.getId(), empresaB.getId()))
                .isEmpty();
    }

    // ---------- Busca case-insensitive ----------

    @Test
    void buscarPorEmpresaComBuscaDeveEncontrarPorNomeSkuECodigoBarrasSemDiferenciarCaixa() {
        Empresa empresa = novaEmpresa("Empresa Busca");
        novoProduto(empresa, "Arroz Integral", "SKU-ARROZ", "789100200300", true);

        assertThat(produtoRepository.buscarPorEmpresaComBusca(empresa.getId(), "arroz", null))
                .hasSize(1);
        assertThat(produtoRepository.buscarPorEmpresaComBusca(empresa.getId(), "sku-arroz", null))
                .hasSize(1);
        assertThat(produtoRepository.buscarPorEmpresaComBusca(empresa.getId(), "789100", null))
                .hasSize(1);
        assertThat(produtoRepository.buscarPorEmpresaComBusca(empresa.getId(), "inexistente", null))
                .isEmpty();
    }

    @Test
    void buscarPorEmpresaSemTermoDeveRetornarTodosDaEmpresaOrdenadosPorNome() {
        Empresa empresa = novaEmpresa("Empresa Sem Termo");
        novoProduto(empresa, "Banana", null, null, true);
        novoProduto(empresa, "Abacaxi", null, null, true);

        List<Produto> produtos = produtoRepository.buscarPorEmpresa(empresa.getId(), null);

        assertThat(produtos).extracting(Produto::getNome).containsExactly("Abacaxi", "Banana");
    }

    // ---------- Filtro de status ativo ----------

    @Test
    void buscarPorEmpresaDeveAplicarFiltroDeStatusAtivo() {
        Empresa empresa = novaEmpresa("Empresa Status");
        novoProduto(empresa, "Ativo 1", null, null, true);
        novoProduto(empresa, "Ativo 2", null, null, true);
        novoProduto(empresa, "Inativo 1", null, null, false);

        assertThat(produtoRepository.buscarPorEmpresa(empresa.getId(), null)).hasSize(3);
        assertThat(produtoRepository.buscarPorEmpresa(empresa.getId(), true)).hasSize(2);
        assertThat(produtoRepository.buscarPorEmpresa(empresa.getId(), false)).hasSize(1);
    }

    // ---------- Unicidade de SKU / codigo de barras ----------

    @Test
    void doisProdutosSemSkuNemCodigoBarrasDevemCoexistirNaMesmaEmpresa() {
        Empresa empresa = novaEmpresa("Empresa Nulos");
        novoProduto(empresa, "Sem Codigos 1", null, null, true);
        novoProduto(empresa, "Sem Codigos 2", null, null, true);

        // A constraint UNIQUE(empresa_id, sku/codigo_barras) trata multiplos NULL
        // como nao-conflitantes: os dois produtos convivem sem violar integridade.
        assertThat(produtoRepository.buscarPorEmpresa(empresa.getId(), null)).hasSize(2);
    }

    @Test
    void existsBySkuAndEmpresaDeveDetectarDuplicadoNaMesmaEmpresa() {
        Empresa empresa = novaEmpresa("Empresa SKU");
        novoProduto(empresa, "Produto", "SKU-UNICO", null, true);

        assertThat(produtoRepository.existsBySkuAndEmpresa_Id("SKU-UNICO", empresa.getId())).isTrue();
        assertThat(produtoRepository.existsBySkuAndEmpresa_Id("SKU-OUTRO", empresa.getId())).isFalse();
    }

    @Test
    void mesmoSkuEmEmpresasDiferentesNaoDeveConflitar() {
        Empresa empresaA = novaEmpresa("Empresa SKU A");
        Empresa empresaB = novaEmpresa("Empresa SKU B");
        novoProduto(empresaA, "Produto A", "SKU-COMPARTILHADO", null, true);
        novoProduto(empresaB, "Produto B", "SKU-COMPARTILHADO", null, true);

        assertThat(produtoRepository.existsBySkuAndEmpresa_Id("SKU-COMPARTILHADO", empresaA.getId())).isTrue();
        assertThat(produtoRepository.existsBySkuAndEmpresa_Id("SKU-COMPARTILHADO", empresaB.getId())).isTrue();
        // Cada empresa enxerga apenas o proprio produto.
        assertThat(produtoRepository.buscarPorEmpresa(empresaA.getId(), null)).hasSize(1);
        assertThat(produtoRepository.buscarPorEmpresa(empresaB.getId(), null)).hasSize(1);
    }
}
