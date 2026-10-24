package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.OrigemDoCusto;
import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoNaoEncontradoException;
import com.geitus.app.catalog.ProdutoService;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.UsoDoProdutoNoEstoque;
import com.geitus.app.catalog.dto.CustoOrigemResponse;
import com.geitus.app.catalog.dto.HistoricoPrecoResponse;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.inventory.EstoqueService.ResultadoAjuste;
import com.geitus.app.inventory.dto.AjusteEstoqueRequest;
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse;

/**
 * Custo na entrada por compra (Fase B4, docs/modules/produtos-custo-entrada.md;
 * DEC-038) com o contexto Spring completo e um PostgreSQL real
 * (Testcontainers, Flyway com as migrations de producao, V13 inclusa).
 *
 * <p>Cobre: o custo no movimento e no produto (com e sem embalagem), as regras
 * e mensagens do ajuste (spec 2.3), a transacao unica (nada gravado na falha,
 * Review Focus 1), a idempotencia com o custo (Review Focus 4), a origem do
 * custo no produto pelo cadastro e pela edicao (Review Focus 2), o historico
 * com a origem e a entrada, e o isolamento por empresa (DEC-016).
 *
 * <p>Sem {@code @Transactional} na classe: cada chamada abre e confirma a
 * propria transacao, como em producao. Cada teste usa empresa nova. Requer
 * Docker.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Import(CenarioDeEstoque.class)
class CustoNaEntradaPorCompraIT {

    private static final String CAMPO_CUSTO = "custo";

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
    private UsoDoProdutoNoEstoque usoNoEstoque;

    @Autowired
    private CenarioDeEstoque cenario;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MockMvc mockMvc;

    // ---------- Fixtures ----------

    private static AjusteEstoqueRequest compra(String quantidade, String custo) {
        return compra(quantidade, custo, null, UUID.randomUUID());
    }

    private static AjusteEstoqueRequest compra(String quantidade, String custo, UUID embalagemId, UUID chave) {
        return ajuste(TipoMovimento.ENTRADA, quantidade, MotivoMovimento.COMPRA, custo, embalagemId, chave);
    }

    private static AjusteEstoqueRequest ajuste(TipoMovimento tipo, String quantidade, MotivoMovimento motivo,
            String custo, UUID embalagemId, UUID chave) {
        return new AjusteEstoqueRequest(tipo, new BigDecimal(quantidade), motivo, null, chave, embalagemId,
                custo == null ? null : new BigDecimal(custo));
    }

    private MovimentoEstoqueResponse ajustar(CenarioDeEstoque.EmpresaDeTeste empresa, UUID produto,
            AjusteEstoqueRequest request) {
        return estoqueService.ajustarParaUsuario(empresa.admin(), produto, request).movimento();
    }

    private ProdutoResponse produto(CenarioDeEstoque.EmpresaDeTeste empresa, UUID produto) {
        return produtoService.buscarPorIdParaUsuario(empresa.admin(), produto);
    }

    private List<HistoricoPrecoResponse> historicoDeCusto(CenarioDeEstoque.EmpresaDeTeste empresa, UUID produto) {
        return produtoService.historicoDePrecosParaUsuario(empresa.admin(), produto, 0, 20).itens().stream()
                .filter(linha -> linha.campo().name().equals("CUSTO"))
                .toList();
    }

    private long linhasDeCusto(UUID produto) {
        return jdbcTemplate.queryForObject("""
                SELECT count(*) FROM produto_historico_precos h JOIN produtos p ON p.id = h.produto_id
                 WHERE p.uuid = ? AND h.campo = 'CUSTO'
                """, Long.class, produto);
    }

    private static UUID caixa(ProdutoResponse produto) {
        return produto.embalagens().get(0).id();
    }

    // ---------- Custo no movimento e no produto ----------

    /** Review Focus 5: produto sem custo recebendo a primeira compra. */
    @Test
    void compraEmUnidadeNumProdutoSemCusto() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");

        MovimentoEstoqueResponse movimento = ajustar(empresa, arroz, compra("5", "10.00"));

        assertThat(movimento.custoInformado()).isEqualByComparingTo("10.00");
        assertThat(movimento.custoUnitario()).isEqualByComparingTo("10.0000");
        ProdutoResponse produto = produto(empresa, arroz);
        assertThat(produto.custo()).isEqualByComparingTo("10.00");
        CustoOrigemResponse origem = produto.custoOrigem();
        assertThat(origem.tipo()).isEqualTo(OrigemDoCusto.ENTRADA_COMPRA);
        assertThat(origem.em()).isNotNull();
        assertThat(origem.quantidade()).isEqualByComparingTo("5");
        assertThat(origem.quantidadeDeEmbalagens()).isNull();
        assertThat(origem.embalagemRotulo()).isNull();

        List<HistoricoPrecoResponse> historico = historicoDeCusto(empresa, arroz);
        assertThat(historico).hasSize(1);
        assertThat(historico.get(0).valorAnterior()).isNull();
        assertThat(historico.get(0).valorNovo()).isEqualByComparingTo("10.00");
        assertThat(historico.get(0).origem()).isEqualTo(OrigemDoCusto.ENTRADA_COMPRA);
        assertThat(historico.get(0).entrada().quantidade()).isEqualByComparingTo("5");
        assertThat(historico.get(0).entrada().quantidadeDeEmbalagens()).isNull();
        assertThat(historico.get(0).entrada().embalagemRotulo()).isNull();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT h.movimento_id = m.id FROM produto_historico_precos h
                  JOIN movimentos_estoque m ON m.produto_id = h.produto_id
                 WHERE m.uuid = ? AND h.campo = 'CUSTO'
                """, Boolean.class, movimento.id())).isTrue();
    }

    @Test
    void duasCaixasDeDezoitoACentoEOitenta() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse sache = cenario.novoProdutoComCaixa(empresa, "Sachê", "18");

        MovimentoEstoqueResponse movimento = ajustar(empresa, sache.id(),
                compra("2", "180.00", caixa(sache), UUID.randomUUID()));

        assertThat(movimento.custoInformado()).isEqualByComparingTo("180.00");
        assertThat(movimento.custoUnitario()).isEqualByComparingTo("10.0000");
        ProdutoResponse produto = produto(empresa, sache.id());
        assertThat(produto.custo()).isEqualByComparingTo("10.00");
        assertThat(produto.custoOrigem().quantidade()).isEqualByComparingTo("36");
        assertThat(produto.custoOrigem().quantidadeDeEmbalagens()).isEqualTo(2);
        assertThat(produto.custoOrigem().embalagemRotulo()).isEqualTo("CX c/ 18 UN");
        HistoricoPrecoResponse linha = historicoDeCusto(empresa, sache.id()).get(0);
        assertThat(linha.entrada().quantidade()).isEqualByComparingTo("36");
        assertThat(linha.entrada().quantidadeDeEmbalagens()).isEqualTo(2);
        assertThat(linha.entrada().embalagemRotulo()).isEqualTo("CX c/ 18 UN");
    }

    /** Review Focus 3: CX c/ 3 a R$ 100,00 -> 33,3333 no movimento e 33,33 no produto. */
    @Test
    void caixaDeTresACem() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse nexgard = cenario.novoProdutoComCaixa(empresa, "Nexgard", "3");

        MovimentoEstoqueResponse movimento = ajustar(empresa, nexgard.id(),
                compra("1", "100.00", caixa(nexgard), UUID.randomUUID()));

        assertThat(movimento.custoUnitario()).isEqualByComparingTo("33.3333");
        assertThat(produto(empresa, nexgard.id()).custo()).isEqualByComparingTo("33.33");
    }

    /** O custo por UN arredonda a meio para cima: CX c/ 8 a R$ 0,20 = 0,025 -> 0,03 no produto. */
    @Test
    void custoDoProdutoArredondaAMeioParaCima() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse bala = cenario.novoProdutoComCaixa(empresa, "Bala", "8");

        MovimentoEstoqueResponse movimento = ajustar(empresa, bala.id(),
                compra("1", "0.20", caixa(bala), UUID.randomUUID()));

        assertThat(movimento.custoUnitario()).isEqualByComparingTo("0.0250");
        assertThat(produto(empresa, bala.id()).custo()).isEqualByComparingTo("0.03");
    }

    /** Custo igual ao atual: nenhuma linha de historico nova, mas a data da origem e atualizada. */
    @Test
    void custoIgualAoAtualSoAtualizaAData() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        ajustar(empresa, arroz, compra("5", "10.00"));
        LocalDateTime antiga = LocalDateTime.of(2020, 1, 1, 10, 0);
        jdbcTemplate.update("UPDATE produtos SET custo_origem_em = ? WHERE uuid = ?", antiga, arroz);

        ajustar(empresa, arroz, compra("3", "10"));

        assertThat(linhasDeCusto(arroz)).isEqualTo(1);
        ProdutoResponse produto = produto(empresa, arroz);
        assertThat(produto.custoOrigem().tipo()).isEqualTo(OrigemDoCusto.ENTRADA_COMPRA);
        assertThat(produto.custoOrigem().em()).isAfter(antiga);
        assertThat(produto.custoOrigem().quantidade()).isEqualByComparingTo("3");
    }

    @Test
    void novaCompraComOutroCustoGravaOutraLinha() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        ajustar(empresa, arroz, compra("5", "9.50"));

        ajustar(empresa, arroz, compra("5", "10.00"));

        List<HistoricoPrecoResponse> historico = historicoDeCusto(empresa, arroz);
        assertThat(historico).hasSize(2);
        assertThat(historico.get(0).valorAnterior()).isEqualByComparingTo("9.50");
        assertThat(historico.get(0).valorNovo()).isEqualByComparingTo("10.00");
    }

    // ---------- Regras e mensagens (spec 2.3) ----------

    @Test
    void compraSemCusto400() {
        assertRecusado(TipoMovimento.ENTRADA, MotivoMovimento.COMPRA, null, "Informe o custo da compra.");
    }

    @Test
    void custoZeroOuNegativo400() {
        assertRecusado(TipoMovimento.ENTRADA, MotivoMovimento.COMPRA, "0", "O custo deve ser maior que zero.");
        assertRecusado(TipoMovimento.ENTRADA, MotivoMovimento.COMPRA, "-1.00", "O custo deve ser maior que zero.");
    }

    @Test
    void custoForaDaEntradaPorCompra400() {
        String mensagem = "O custo só é informado na entrada por compra.";
        assertRecusado(TipoMovimento.SAIDA, MotivoMovimento.PERDA_AVARIA, "10.00", mensagem);
        assertRecusado(TipoMovimento.ENTRADA, MotivoMovimento.DEVOLUCAO_CLIENTE, "10.00", mensagem);
        assertRecusado(TipoMovimento.AJUSTE, MotivoMovimento.CONTAGEM, "10.00", mensagem);
    }

    /** Produto com saldo 5 e custo 9,50: o pedido recusado nao grava movimento, custo nem historico. */
    private void assertRecusado(TipoMovimento tipo, MotivoMovimento motivo, String custo, String mensagem) {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        ajustar(empresa, arroz, compra("5", "9.50"));

        assertThatThrownBy(() -> ajustar(empresa, arroz, ajuste(tipo, "1", motivo, custo, null, UUID.randomUUID())))
                .isInstanceOfSatisfying(RegraDeNegocioException.class,
                        erro -> assertThat(erro.campo()).contains(CAMPO_CUSTO))
                .hasMessage(mensagem);
        assertNadaMudou(empresa, arroz);
    }

    /** Depois da compra de 5 a 9,50: um movimento, saldo 5, custo 9,50 e uma linha de custo. */
    private void assertNadaMudou(CenarioDeEstoque.EmpresaDeTeste empresa, UUID produto) {
        assertThat(cenario.contarMovimentos(produto)).isEqualTo(1);
        assertThat(cenario.saldo(produto)).isEqualByComparingTo("5");
        assertThat(produto(empresa, produto).custo()).isEqualByComparingTo("9.50");
        assertThat(linhasDeCusto(produto)).isEqualTo(1);
    }

    @Test
    void custoComMaisDeDuasCasasPelaApi400() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");

        mockMvc.perform(post("/api/produtos/" + arroz + "/estoque/ajustes")
                        .header("Authorization", cenario.token(empresa.admin()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                { "tipo": "ENTRADA", "quantidade": 2, "motivo": "COMPRA", "chave": "%s",
                                  "custo": 10.005 }
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value(CAMPO_CUSTO));
        assertThat(cenario.contarMovimentos(arroz)).isZero();
    }

    // ---------- Transacao unica (Review Focus 1) ----------

    @Test
    void saidaSemSaldoDepoisDaCompraNaoMexeNoCusto() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        ajustar(empresa, arroz, compra("5", "9.50"));

        assertThatThrownBy(() -> ajustar(empresa, arroz,
                ajuste(TipoMovimento.SAIDA, "6", MotivoMovimento.PERDA_AVARIA, null, null, UUID.randomUUID())))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Saldo insuficiente: há 5 UN.");
        assertNadaMudou(empresa, arroz);
    }

    @Test
    void compraComFracaoInvalidaNaoGravaNada() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        ajustar(empresa, arroz, compra("5", "9.50"));

        assertThatThrownBy(() -> ajustar(empresa, arroz, compra("1.5", "12.00")))
                .isInstanceOfSatisfying(RegraDeNegocioException.class,
                        erro -> assertThat(erro.campo()).contains("quantidade"));
        assertNadaMudou(empresa, arroz);
    }

    /** A recusa do saldo acima do limite vem depois das validacoes: o custo tambem nao muda. */
    @Test
    void compraQuePassaDoLimiteDoSaldoNaoGravaOCusto() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        ajustar(empresa, arroz, compra("5", "9.50"));

        assertThatThrownBy(() -> ajustar(empresa, arroz, compra("999999999", "12.00")))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O saldo não pode passar de 999.999.999,999.");
        assertNadaMudou(empresa, arroz);
    }

    // ---------- Idempotencia (Review Focus 4) ----------

    @Test
    void chaveRepetidaComOMesmoCustoDevolveOOriginalEUmaLinhaSo() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID chave = UUID.randomUUID();
        ResultadoAjuste primeiro = estoqueService.ajustarParaUsuario(empresa.admin(), arroz,
                compra("5", "10.00", null, chave));

        ResultadoAjuste repetido = estoqueService.ajustarParaUsuario(empresa.admin(), arroz,
                compra("5", "10", null, chave));

        assertThat(repetido.criado()).isFalse();
        assertThat(repetido.movimento()).isEqualTo(primeiro.movimento());
        assertThat(cenario.contarMovimentos(arroz)).isEqualTo(1);
        assertThat(linhasDeCusto(arroz)).isEqualTo(1);
    }

    @Test
    void chaveRepetidaComOutroCusto409() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID chave = UUID.randomUUID();
        estoqueService.ajustarParaUsuario(empresa.admin(), arroz, compra("5", "10.00", null, chave));

        assertThatThrownBy(() -> estoqueService.ajustarParaUsuario(empresa.admin(), arroz,
                compra("5", "11.00", null, chave)))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Esta operação já foi registrada com outros dados.");
        assertThat(produto(empresa, arroz).custo()).isEqualByComparingTo("10.00");
        assertThat(linhasDeCusto(arroz)).isEqualTo(1);
    }

    // ---------- Origem do custo pelo cadastro (Review Focus 2) ----------

    @Test
    void cadastroComCustoMarcaEdicao() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();

        ProdutoResponse produto = produtoService.cadastrarParaUsuario(empresa.admin(),
                CenarioDeEstoque.produtoComCusto(cenario.unidade(empresa, "UN"), "Arroz", "9.50", true, null, null));

        assertThat(produto.custoOrigem().tipo()).isEqualTo(OrigemDoCusto.EDICAO);
        assertThat(produto.custoOrigem().em()).isNotNull();
        assertThat(produto.custoOrigem().quantidade()).isNull();
        assertThat(historicoDeCusto(empresa, produto.id())).singleElement()
                .satisfies(linha -> {
                    assertThat(linha.origem()).isEqualTo(OrigemDoCusto.EDICAO);
                    assertThat(linha.entrada()).isNull();
                });
    }

    @Test
    void cadastroSemCustoNaoTemOrigem() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();

        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");

        assertThat(produto(empresa, arroz).custoOrigem()).isNull();
    }

    @Test
    void edicaoQueMudaOCustoMarcaEdicao() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        ajustar(empresa, arroz, compra("5", "10.00"));

        ProdutoResponse editado = cenario.editarProduto(empresa, arroz, "Arroz", "10.50");

        assertThat(editado.custoOrigem().tipo()).isEqualTo(OrigemDoCusto.EDICAO);
        assertThat(editado.custoOrigem().quantidade()).isNull();
        assertThat(editado.custoOrigem().quantidadeDeEmbalagens()).isNull();
        assertThat(editado.custoOrigem().embalagemRotulo()).isNull();
        HistoricoPrecoResponse linha = historicoDeCusto(empresa, arroz).get(0);
        assertThat(linha.origem()).isEqualTo(OrigemDoCusto.EDICAO);
        assertThat(linha.valorAnterior()).isEqualByComparingTo("10.00");
        assertThat(linha.valorNovo()).isEqualByComparingTo("10.50");
        assertThat(linha.entrada()).isNull();
    }

    /** Review Focus 2: salvar o cadastro com o mesmo custo (ou mudar so o nome) mantem a origem da compra. */
    @Test
    void edicaoComOMesmoCustoMantemAEntradaDeCompra() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse sache = cenario.novoProdutoComCaixa(empresa, "Sachê", "18");
        ajustar(empresa, sache.id(), compra("2", "180.00", caixa(sache), UUID.randomUUID()));
        LocalDateTime em = produto(empresa, sache.id()).custoOrigem().em();

        ProdutoResponse editado = cenario.editarProduto(empresa, sache.id(), "Sachê de frango", "10");

        assertThat(editado.custoOrigem().tipo()).isEqualTo(OrigemDoCusto.ENTRADA_COMPRA);
        assertThat(editado.custoOrigem().em()).isEqualTo(em);
        assertThat(editado.custoOrigem().quantidade()).isEqualByComparingTo("36");
        assertThat(editado.custoOrigem().quantidadeDeEmbalagens()).isEqualTo(2);
        assertThat(editado.custoOrigem().embalagemRotulo()).isEqualTo("CX c/ 18 UN");
        assertThat(linhasDeCusto(sache.id())).isEqualTo(1);
    }

    @Test
    void edicaoQueApagaOCustoLimpaAOrigem() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        ajustar(empresa, arroz, compra("5", "10.00"));

        ProdutoResponse editado = cenario.editarProduto(empresa, arroz, "Arroz", null);

        assertThat(editado.custo()).isNull();
        assertThat(editado.custoOrigem()).isNull();
        assertThat(jdbcTemplate.queryForObject("SELECT custo_origem IS NULL AND custo_origem_em IS NULL"
                + " FROM produtos WHERE uuid = ?", Boolean.class, arroz)).isTrue();
        HistoricoPrecoResponse linha = historicoDeCusto(empresa, arroz).get(0);
        assertThat(linha.origem()).isEqualTo(OrigemDoCusto.EDICAO);
        assertThat(linha.valorNovo()).isNull();
    }

    // ---------- Pela API ----------

    @Test
    void apiTrazOCustoNoMovimentoNoProdutoENoHistorico() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse sache = cenario.novoProdutoComCaixa(empresa, "Sachê", "18");
        String token = cenario.token(empresa.admin());

        mockMvc.perform(post("/api/produtos/" + sache.id() + "/estoque/ajustes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                { "tipo": "ENTRADA", "quantidade": 2, "motivo": "COMPRA", "chave": "%s",
                                  "embalagemId": "%s", "custo": 180.00 }
                                """.formatted(UUID.randomUUID(), caixa(sache))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.custoInformado").value(180.0))
                .andExpect(jsonPath("$.custoUnitario").value(10.0));
        cenario.editarProduto(empresa, sache.id(), "Sachê", "10.50");

        mockMvc.perform(get("/api/produtos/" + sache.id() + "/estoque/movimentos").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].custoInformado").value(180.0))
                .andExpect(jsonPath("$.itens[0].custoUnitario").value(10.0));
        mockMvc.perform(get("/api/produtos/" + sache.id()).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.custoOrigem.tipo").value("EDICAO"))
                .andExpect(jsonPath("$.custoOrigem.em").exists())
                .andExpect(jsonPath("$.custoOrigem.quantidade").isEmpty())
                .andExpect(jsonPath("$.custoOrigem.quantidadeDeEmbalagens").isEmpty());
        mockMvc.perform(get("/api/produtos/" + sache.id() + "/historico-precos").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].campo").value("CUSTO"))
                .andExpect(jsonPath("$.itens[0].origem").value("EDICAO"))
                .andExpect(jsonPath("$.itens[0].entrada").isEmpty())
                .andExpect(jsonPath("$.itens[1].origem").value("ENTRADA_COMPRA"))
                .andExpect(jsonPath("$.itens[1].entrada.quantidade").value(36.0))
                .andExpect(jsonPath("$.itens[1].entrada.quantidadeDeEmbalagens").value(2))
                .andExpect(jsonPath("$.itens[1].entrada.embalagemRotulo").value("CX c/ 18 UN"))
                .andExpect(jsonPath("$.itens[1].movimentoId").doesNotExist())
                .andExpect(jsonPath("$.itens[2].campo").value("PRECO_VENDA"))
                .andExpect(jsonPath("$.itens[2].origem").isEmpty());
    }

    @Test
    void openApiDocumentaOsCamposDoCusto() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.schemas.AjusteEstoqueRequest.properties.custo").exists())
                .andExpect(jsonPath("$.components.schemas.MovimentoEstoqueResponse.properties.custoInformado")
                        .exists())
                .andExpect(jsonPath("$.components.schemas.MovimentoEstoqueResponse.properties.custoUnitario")
                        .exists())
                .andExpect(jsonPath("$.components.schemas.ProdutoResponse.properties.custoOrigem").exists())
                .andExpect(jsonPath("$.components.schemas.HistoricoPrecoResponse.properties.origem").exists())
                .andExpect(jsonPath("$.components.schemas.HistoricoPrecoResponse.properties.entrada").exists());
    }

    // ---------- Isolamento por empresa (DEC-016) ----------

    @Test
    void outraEmpresaNaoEnxergaACompraNemAOrigem() {
        CenarioDeEstoque.EmpresaDeTeste empresaA = cenario.novaEmpresa();
        CenarioDeEstoque.EmpresaDeTeste empresaB = cenario.novaEmpresa();
        UUID daA = cenario.novoProduto(empresaA, "UN", "Arroz da A");
        ajustar(empresaA, daA, compra("5", "10.00"));
        Long produtoDaA = cenario.idInterno(daA);
        Long movimentoDaA = jdbcTemplate.queryForObject("SELECT id FROM movimentos_estoque WHERE produto_id = ?",
                Long.class, produtoDaA);
        Long empresaIdA = empresaA.empresa().getId();
        Long empresaIdB = empresaB.empresa().getId();

        assertThat(usoNoEstoque.ultimaEntradaDeCompra(empresaIdA, produtoDaA)).isPresent();
        assertThat(usoNoEstoque.ultimaEntradaDeCompra(empresaIdB, produtoDaA)).isEmpty();
        assertThat(usoNoEstoque.entradasDeCompra(empresaIdA, List.of(movimentoDaA))).containsKey(movimentoDaA);
        assertThat(usoNoEstoque.entradasDeCompra(empresaIdB, List.of(movimentoDaA))).isEmpty();
        assertThatThrownBy(() -> produtoService.historicoDePrecosParaUsuario(empresaB.admin(), daA, 0, 20))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
        assertThatThrownBy(() -> ajustar(empresaB, daA, compra("5", "1.00")))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
        assertThat(produto(empresaA, daA).custo()).isEqualByComparingTo("10.00");
    }

    /** As compras antigas (sem custo) nao contam como a ultima entrada de compra. */
    @Test
    void ultimaEntradaDeCompraIgnoraACompraSemCusto() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz");
        ajustar(empresa, arroz, compra("5", "10.00"));
        Long produtoId = cenario.idInterno(arroz);
        jdbcTemplate.update("""
                INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,
                                                saldo_anterior, saldo_novo, usuario_id, criado_em)
                VALUES (?, ?, 'ENTRADA', 'COMPRA', 'AJUSTE_MANUAL', 7, 5, 12, ?, now() + interval '1 hour')
                """, empresa.empresa().getId(), produtoId, empresa.admin());

        assertThat(usoNoEstoque.ultimaEntradaDeCompra(empresa.empresa().getId(), produtoId))
                .hasValueSatisfying(entrada -> assertThat(entrada.quantidade()).isEqualByComparingTo("5"));
    }
}
