package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

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

import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoService;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.inventory.EstoqueService.ResultadoAjuste;
import com.geitus.app.inventory.dto.AjusteEstoqueRequest;
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse;
import com.geitus.app.supplier.FornecedorService;
import com.geitus.app.supplier.dto.FornecedorRequest;

/**
 * Fornecedor na entrada por compra (Fase B5, docs/modules/fornecedores-e-marcas.md,
 * 6; amplia a B4) com o contexto Spring completo e um PostgreSQL real
 * (Testcontainers, V14): o fornecedor no movimento, a ligacao ao produto e o
 * da ultima compra na mesma transacao, as regras e mensagens novas, a
 * idempotencia com o fornecedor (Review Focus 5), o fornecedor no historico e
 * na nota do custo, e o isolamento por empresa (DEC-016).
 *
 * <p>Sem {@code @Transactional} na classe: cada chamada confirma a propria
 * transacao, como em producao. Cada teste usa empresa nova. Requer Docker.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Import(CenarioDeEstoque.class)
class FornecedorNaEntradaPorCompraIT {

    private static final String CAMPO_FORNECEDOR = "fornecedorId";

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

    @Autowired
    private EstoqueService estoqueService;

    @Autowired
    private ProdutoService produtoService;

    @Autowired
    private FornecedorService fornecedorService;

    @Autowired
    private CenarioDeEstoque cenario;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MockMvc mockMvc;

    // ---------- Entrada com fornecedor ----------

    @Test
    void compraComFornecedorNovoLigaAoProdutoEDefineOUltimo() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID central = fornecedor(empresa, "Distribuidora Central");

        MovimentoEstoqueResponse movimento = ajustar(empresa, arroz, compra("5", "10.00", central, UUID.randomUUID()))
                .movimento();

        assertThat(movimento.fornecedor().id()).isEqualTo(central);
        assertThat(movimento.fornecedor().nome()).isEqualTo("Distribuidora Central");
        ProdutoResponse produto = produtoService.buscarPorIdParaUsuario(empresa.admin(), arroz);
        assertThat(produto.fornecedores()).extracting(fornecedor -> fornecedor.id()).containsExactly(central);
        assertThat(produto.fornecedorUltimaCompra().id()).isEqualTo(central);
        assertThat(produto.custoOrigem().fornecedorNome()).isEqualTo("Distribuidora Central");
        assertThat(fornecedorDoMovimento(movimento.id())).isEqualTo(idInterno(central));
    }

    @Test
    void compraComOutroFornecedorJaNaListaSoTrocaOUltimo() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID central = fornecedor(empresa, "Distribuidora Central");
        UUID sul = fornecedor(empresa, "Atacado Sul");
        ajustar(empresa, arroz, compra("5", "10.00", central, UUID.randomUUID()));
        ajustar(empresa, arroz, compra("5", "11.00", sul, UUID.randomUUID()));

        ajustar(empresa, arroz, compra("2", "12.00", central, UUID.randomUUID()));

        ProdutoResponse produto = produtoService.buscarPorIdParaUsuario(empresa.admin(), arroz);
        assertThat(produto.fornecedores()).extracting(fornecedor -> fornecedor.nome())
                .containsExactly("Atacado Sul", "Distribuidora Central");
        assertThat(produto.fornecedorUltimaCompra().id()).isEqualTo(central);
        assertThat(ligacoes(arroz)).isEqualTo(2);
    }

    @Test
    void compraSemFornecedorNaoMexeNosFornecedoresDoProduto() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID central = fornecedor(empresa, "Distribuidora Central");
        ajustar(empresa, arroz, compra("5", "10.00", central, UUID.randomUUID()));

        MovimentoEstoqueResponse semFornecedor = ajustar(empresa, arroz, compra("1", "10.50", null,
                UUID.randomUUID())).movimento();

        assertThat(semFornecedor.fornecedor()).isNull();
        ProdutoResponse produto = produtoService.buscarPorIdParaUsuario(empresa.admin(), arroz);
        assertThat(produto.fornecedorUltimaCompra().id()).isEqualTo(central);
        assertThat(produto.custoOrigem().fornecedorNome()).isNull();
    }

    // ---------- Regras e mensagens ----------

    @Test
    void fornecedorForaDaEntradaPorCompraE400() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID central = fornecedor(empresa, "Distribuidora Central");
        ajustar(empresa, arroz, compra("5", "10.00", null, UUID.randomUUID()));

        assertRegra(() -> ajustar(empresa, arroz, ajuste(TipoMovimento.SAIDA, "1", MotivoMovimento.PERDA_AVARIA,
                null, central)), "O fornecedor só é informado na entrada por compra.");
        assertRegra(() -> ajustar(empresa, arroz, ajuste(TipoMovimento.ENTRADA, "1",
                MotivoMovimento.DEVOLUCAO_CLIENTE, null, central)),
                "O fornecedor só é informado na entrada por compra.");
        assertThat(ligacoes(arroz)).isZero();
    }

    @Test
    void fornecedorInativoE400EDeOutraEmpresaE404() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID inativo = fornecedor(empresa, "Inativo");
        fornecedorService.inativarParaUsuario(empresa.admin(), inativo);
        UUID daOutra = fornecedor(cenario.novaEmpresa(), "Da outra");

        assertRegra(() -> ajustar(empresa, arroz, compra("5", "10.00", inativo, UUID.randomUUID())),
                "Este fornecedor está inativo.");
        assertThatThrownBy(() -> ajustar(empresa, arroz, compra("5", "10.00", daOutra, UUID.randomUUID())))
                .isInstanceOf(CatalogoNaoEncontradoException.class)
                .hasMessage("Fornecedor não encontrado.");
        assertThat(movimentos(arroz)).isZero();
    }

    /** Decisao do CTO: a compra com fornecedor novo nao passa do limite de 20 fornecedores do produto. */
    @Test
    void compraComFornecedorNovoNumProdutoComVinteE400EOJaLigadoContinua() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        List<UUID> vinte = IntStream.rangeClosed(1, 20).mapToObj(numero -> fornecedor(empresa, "F" + numero))
                .toList();
        UUID vigesimoPrimeiro = fornecedor(empresa, "F21");
        ajustar(empresa, arroz, compra("1", "10.00", vinte.get(0), UUID.randomUUID()));
        for (UUID fornecedor : vinte.subList(1, 20)) {
            ajustar(empresa, arroz, compra("1", "10.00", fornecedor, UUID.randomUUID()));
        }

        assertThatThrownBy(() -> ajustar(empresa, arroz, compra("1", "10.00", vigesimoPrimeiro, UUID.randomUUID())))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Este produto já tem 20 fornecedores. Tire um da lista do produto para ligar outro.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains(CAMPO_FORNECEDOR));
        assertThat(movimentos(arroz)).isEqualTo(20);
        ajustar(empresa, arroz, compra("1", "10.00", vinte.get(3), UUID.randomUUID()));
        assertThat(produtoService.buscarPorIdParaUsuario(empresa.admin(), arroz).fornecedorUltimaCompra().id())
                .isEqualTo(vinte.get(3));
        assertThat(ligacoes(arroz)).isEqualTo(20);
    }

    // ---------- Idempotencia (Review Focus 5) ----------

    @Test
    void chaveRepetidaIgualGravaUmMovimentoEUmaLigacao() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID central = fornecedor(empresa, "Distribuidora Central");
        UUID chave = UUID.randomUUID();

        ResultadoAjuste primeiro = ajustar(empresa, arroz, compra("5", "10.00", central, chave));
        ResultadoAjuste repetido = ajustar(empresa, arroz, compra("5", "10.00", central, chave));

        assertThat(primeiro.criado()).isTrue();
        assertThat(repetido.criado()).isFalse();
        assertThat(repetido.movimento().id()).isEqualTo(primeiro.movimento().id());
        assertThat(repetido.movimento().fornecedor().nome()).isEqualTo("Distribuidora Central");
        assertThat(movimentos(arroz)).isEqualTo(1);
        assertThat(ligacoes(arroz)).isEqualTo(1);
        assertThat(produtoService.buscarPorIdParaUsuario(empresa.admin(), arroz).fornecedorUltimaCompra().id())
                .isEqualTo(central);
    }

    @Test
    void chaveRepetidaComOutroFornecedorOuSemEle409() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID central = fornecedor(empresa, "Distribuidora Central");
        UUID sul = fornecedor(empresa, "Atacado Sul");
        UUID chave = UUID.randomUUID();
        ajustar(empresa, arroz, compra("5", "10.00", central, chave));

        assertThatThrownBy(() -> ajustar(empresa, arroz, compra("5", "10.00", sul, chave)))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Esta operação já foi registrada com outros dados.");
        assertThatThrownBy(() -> ajustar(empresa, arroz, compra("5", "10.00", null, chave)))
                .isInstanceOf(ProdutoConflitoException.class);
        UUID outraChave = UUID.randomUUID();
        ajustar(empresa, arroz, compra("1", "10.00", null, outraChave));
        assertThatThrownBy(() -> ajustar(empresa, arroz, compra("1", "10.00", central, outraChave)))
                .isInstanceOf(ProdutoConflitoException.class);
        assertThat(movimentos(arroz)).isEqualTo(2);
        assertThat(ligacoes(arroz)).isEqualTo(1);
    }

    // ---------- Depois da compra ----------

    /** Review Focus 1 depois da compra: o fornecedor tira o produto e o campo do produto e limpo. */
    @Test
    void fornecedorDaCompraTiradoPelaTelaDoFornecedorLimpaOUltimo() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID central = fornecedor(empresa, "Distribuidora Central");
        ajustar(empresa, arroz, compra("5", "10.00", central, UUID.randomUUID()));

        fornecedorService.desligarProdutoParaUsuario(empresa.admin(), central, arroz);

        ProdutoResponse produto = produtoService.buscarPorIdParaUsuario(empresa.admin(), arroz);
        assertThat(produto.fornecedores()).isEmpty();
        assertThat(produto.fornecedorUltimaCompra()).isNull();
        assertThatThrownBy(() -> fornecedorService.excluirParaUsuario(empresa.admin(), central))
                .hasMessage("Não é possível excluir: o fornecedor tem 0 produto(s) ligados e 1 entrada(s) "
                        + "registradas. Inative-o.");
    }

    @Test
    void historicoENotaDoCustoTrazemOFornecedorNoJson() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID central = fornecedor(empresa, "Distribuidora Central");
        ajustar(empresa, arroz, compra("5", "10.00", central, UUID.randomUUID()));
        ajustar(empresa, arroz, ajuste(TipoMovimento.SAIDA, "1", MotivoMovimento.PERDA_AVARIA, null, null));
        String token = cenario.token(empresa.admin());

        mockMvc.perform(get("/api/produtos/" + arroz + "/estoque/movimentos").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].fornecedor").doesNotExist())
                .andExpect(jsonPath("$.itens[1].fornecedor.id").value(central.toString()))
                .andExpect(jsonPath("$.itens[1].fornecedor.nome").value("Distribuidora Central"));
        mockMvc.perform(get("/api/produtos/" + arroz).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.custoOrigem.fornecedorNome").value("Distribuidora Central"))
                .andExpect(jsonPath("$.fornecedorUltimaCompra.id").value(central.toString()))
                .andExpect(jsonPath("$.fornecedores[0].numero").value(1));
    }

    // ---------- Apoio ----------

    private static AjusteEstoqueRequest compra(String quantidade, String custo, UUID fornecedor, UUID chave) {
        return new AjusteEstoqueRequest(TipoMovimento.ENTRADA, new BigDecimal(quantidade), MotivoMovimento.COMPRA,
                null, chave, null, new BigDecimal(custo), fornecedor);
    }

    private static AjusteEstoqueRequest ajuste(TipoMovimento tipo, String quantidade, MotivoMovimento motivo,
            String custo, UUID fornecedor) {
        return new AjusteEstoqueRequest(tipo, new BigDecimal(quantidade), motivo, null, UUID.randomUUID(), null,
                custo == null ? null : new BigDecimal(custo), fornecedor);
    }

    private ResultadoAjuste ajustar(CenarioDeEstoque.EmpresaDeTeste empresa, UUID produto,
            AjusteEstoqueRequest request) {
        return estoqueService.ajustarParaUsuario(empresa.admin(), produto, request);
    }

    private static void assertRegra(Runnable acao, String mensagem) {
        assertThatThrownBy(acao::run)
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(mensagem)
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains(CAMPO_FORNECEDOR));
    }

    private UUID fornecedor(CenarioDeEstoque.EmpresaDeTeste empresa, String nome) {
        return fornecedorService.cadastrarParaUsuario(empresa.admin(), new FornecedorRequest(null, null, nome, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null)).id();
    }

    private Long idInterno(UUID fornecedor) {
        return jdbcTemplate.queryForObject("SELECT id FROM fornecedores WHERE uuid = ?", Long.class, fornecedor);
    }

    private Long fornecedorDoMovimento(UUID movimento) {
        return jdbcTemplate.queryForObject("SELECT fornecedor_id FROM movimentos_estoque WHERE uuid = ?", Long.class,
                movimento);
    }

    private long ligacoes(UUID produto) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM produto_fornecedores pf JOIN produtos p"
                + " ON p.id = pf.produto_id WHERE p.uuid = ?", Long.class, produto);
    }

    private long movimentos(UUID produto) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM movimentos_estoque m JOIN produtos p"
                + " ON p.id = m.produto_id WHERE p.uuid = ?", Long.class, produto);
    }
}
