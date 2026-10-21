package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.dto.AtacadoResponse;
import com.geitus.app.catalog.dto.CodigoBarrasResponse;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.dto.PromocaoResponse;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/**
 * Testa o mapeamento de {@link ProdutoResponse#de}: derivados margem/markup,
 * resumos de unidade/categoria e o texto da conversao de compra.
 *
 * <p>markup = (preco - custo) / custo * 100; margem = (preco - custo) / preco * 100.
 * Ambos com 2 casas (HALF_UP) e {@code null} quando o denominador nao permite o
 * calculo (sem custo, custo/preco = 0).
 */
class ProdutoResponseTest {

    private static final CategoriaArvore SEM_CATEGORIAS = CategoriaArvore.de(List.of());
    private static final LocalDate HOJE = LocalDate.of(2026, 11, 8);

    private final Empresa empresa = new Empresa("Empresa");
    private final UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);
    private final UnidadeMedida kg = new UnidadeMedida(empresa, "KG", "Quilograma", true);
    private final UnidadeMedida cx = new UnidadeMedida(empresa, "CX", "Caixa", false);
    private final UnidadeMedida fd = new UnidadeMedida(empresa, "FD", "Fardo", false);

    private Produto produto(BigDecimal precoVenda, BigDecimal custo) {
        return ProdutoTesteBuilder.produto(empresa, un).precoVenda(precoVenda.toPlainString())
                .custo(custo == null ? null : custo.toPlainString()).build();
    }

    private Produto produtoComCompra(UnidadeMedida venda, UnidadeMedida compra, String fator) {
        return ProdutoTesteBuilder.produto(empresa, venda).compra(compra, fator).build();
    }

    private static ProdutoResponse responder(Produto produto) {
        return ProdutoResponse.de(produto, SEM_CATEGORIAS, true, HOJE, ResumoDeEstoque.VAZIO);
    }

    private static Categoria categoria(Long id, Empresa empresa, Categoria pai, String nome) {
        Categoria categoria = new Categoria(empresa, pai, nome);
        ReflectionTestUtils.setField(categoria, "id", id);
        return categoria;
    }

    @Test
    void comCustoInformadoDeveCalcularMargemEMarkup() {
        ProdutoResponse response = responder(produto(new BigDecimal("10.00"), new BigDecimal("8.00")));

        assertThat(response.markup()).isEqualByComparingTo("25.00");
        assertThat(response.margem()).isEqualByComparingTo("20.00");
    }

    @Test
    void semCustoDeveDeixarMargemEMarkupNulos() {
        ProdutoResponse response = responder(produto(new BigDecimal("10.00"), null));

        assertThat(response.markup()).isNull();
        assertThat(response.margem()).isNull();
    }

    @Test
    void comCustoZeroDeveDeixarMarkupNuloEMargem100() {
        // Custo 0 evita a divisao por zero do markup; a margem sobre a venda
        // (preco > 0) e 100%.
        ProdutoResponse response = responder(produto(new BigDecimal("10.00"), new BigDecimal("0.00")));

        assertThat(response.markup()).isNull();
        assertThat(response.margem()).isEqualByComparingTo("100.00");
    }

    @Test
    void deveMapearOsCamposBrutosDoProduto() {
        // Protege contra regressao silenciosa no mapeamento entidade -> response
        // dos campos da V4 (hoje so os derivados margem/markup eram assertados).
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).nome("Arroz 5kg").precoVenda("25.90")
                .custo("18.00").estoqueMinimo("2").sku("SKU-V4").marca("Tio João").descricao("Arroz branco tipo 1")
                .estoqueMaximo("50.000").pontoReposicao("10.000").precoMinimo("20.00").build();

        ProdutoResponse response = responder(produto);

        assertThat(response.marca()).isEqualTo("Tio João");
        assertThat(response.descricao()).isEqualTo("Arroz branco tipo 1");
        assertThat(response.estoqueMaximo()).isEqualByComparingTo("50.000");
        assertThat(response.pontoReposicao()).isEqualByComparingTo("10.000");
        assertThat(response.precoMinimo()).isEqualByComparingTo("20.00");
    }

    @Test
    void deveArredondarParaDuasCasasComHalfUp() {
        // markup = 1/6 * 100 = 16.6666... -> 16.67; margem = 1/7 * 100 = 14.2857... -> 14.29.
        ProdutoResponse response = responder(produto(new BigDecimal("7.00"), new BigDecimal("6.00")));

        assertThat(response.markup()).isEqualByComparingTo("16.67");
        assertThat(response.margem()).isEqualByComparingTo("14.29");
    }

    // ---------- Unidade, categoria e conversao ----------

    @Test
    void unidadeDeVendaSaiComoResumoComUuidPublico() {
        ProdutoResponse response = responder(produto(new BigDecimal("10.00"), null));

        assertThat(response.unidade().id()).isEqualTo(un.getUuid());
        assertThat(response.unidade().sigla()).isEqualTo("UN");
        assertThat(response.unidade().descricao()).isEqualTo("Unidade");
        assertThat(response.unidade().fracionada()).isFalse();
        assertThat(response.categoria()).isNull();
    }

    @Test
    void conversaoTexto() {
        ProdutoResponse caixa = responder(produtoComCompra(un, cx, "12"));
        ProdutoResponse fardo = responder(produtoComCompra(kg, fd, "1.5000"));
        ProdutoResponse semCompra = responder(produto(new BigDecimal("10.00"), null));

        assertThat(caixa.conversaoTexto()).isEqualTo("1 CX = 12 UN");
        assertThat(caixa.unidadeCompra().sigla()).isEqualTo("CX");
        assertThat(caixa.fatorConversao()).isEqualByComparingTo("12");
        assertThat(fardo.conversaoTexto()).isEqualTo("1 FD = 1,5 KG");
        assertThat(semCompra.conversaoTexto()).isNull();
        assertThat(semCompra.unidadeCompra()).isNull();
        assertThat(semCompra.fatorConversao()).isNull();
    }

    @Test
    void conversaoTextoComFatorInteiroDeEscalaQuatroNaoUsaNotacaoCientifica() {
        // 100.0000.stripTrailingZeros() vira 1E+2: o texto deve ser "100".
        ProdutoResponse response = responder(produtoComCompra(un, cx, "100.0000"));

        assertThat(response.conversaoTexto()).isEqualTo("1 CX = 100 UN");
    }

    @Test
    void conversaoTextoComFatorDeMilOuMaisNaoUsaSeparadorDeMilhar() {
        ProdutoResponse fracionado = responder(produtoComCompra(un, cx, "1500.5000"));
        ProdutoResponse mil = responder(produtoComCompra(un, cx, "1000.0000"));

        assertThat(fracionado.conversaoTexto()).isEqualTo("1 CX = 1500,5 UN");
        assertThat(mil.conversaoTexto()).isEqualTo("1 CX = 1000 UN");
    }

    @Test
    void categoriaCaminhoVemDaArvore() {
        Categoria racao = categoria(1L, empresa, null, "Ração");
        Categoria umida = categoria(2L, empresa, racao, "Úmida");
        Categoria sache = categoria(3L, empresa, umida, "Sachê");
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).nome("Sachê de frango").categoria(sache)
                .precoVenda("3.50").build();

        ProdutoResponse response = ProdutoResponse.de(produto, CategoriaArvore.de(List.of(racao, umida, sache)), true,
                HOJE, ResumoDeEstoque.VAZIO);

        assertThat(response.categoria().id()).isEqualTo(sache.getUuid());
        assertThat(response.categoria().nome()).isEqualTo("Sachê");
        assertThat(response.categoria().caminho()).isEqualTo("Ração › Úmida › Sachê");
    }

    // ---------- Fase B: identificacao ----------

    @Test
    void idEUuidPublicoECodigosSaemNaOrdemComFormato() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).id(42L).codigo("96385074")
                .codigo("7891000315508", FormatoCodigoBarras.OUTRO).build();

        ProdutoResponse response = responder(produto);

        assertThat(response.id()).isEqualTo(produto.getUuid());
        assertThat(response.codigosBarras()).containsExactly(
                new CodigoBarrasResponse("96385074", FormatoCodigoBarras.EAN8),
                new CodigoBarrasResponse("7891000315508", FormatoCodigoBarras.OUTRO));
    }

    @Test
    void nomeCurtoFornecedorEPodeExcluirSaoMapeados() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).nome("Ração Golden Adulto Frango e Arroz 15kg")
                .fornecedor("Distribuidora X").build();

        ProdutoResponse podeExcluir = responder(produto);
        ProdutoResponse bloqueado = ProdutoResponse.de(produto, SEM_CATEGORIAS, false, HOJE, ResumoDeEstoque.VAZIO);

        assertThat(podeExcluir.nomeCurto()).isNull();
        assertThat(podeExcluir.nomeCurtoEfetivo()).isEqualTo("Ração Golden Adulto Frango e A");
        assertThat(podeExcluir.fornecedor()).isEqualTo("Distribuidora X");
        assertThat(podeExcluir.podeExcluir()).isTrue();
        assertThat(bloqueado.podeExcluir()).isFalse();
    }

    // ---------- Fase C: promocao e atacado ----------

    @Test
    void situacaoEEmPromocaoComClockFixo() {
        LocalDate inicio = LocalDate.of(2026, 11, 1);
        LocalDate fim = LocalDate.of(2026, 11, 15);
        Produto comPromocao = ProdutoTesteBuilder.produto(empresa, un).promocao("8.90", inicio, fim).build();
        Clock relogioVigente = Clock.fixed(Instant.parse("2026-11-16T01:30:00Z"), ZoneId.of("America/Sao_Paulo"));

        ProdutoResponse vigente = ProdutoResponse.de(comPromocao, SEM_CATEGORIAS, true,
                SituacaoPromocao.hoje(relogioVigente), ResumoDeEstoque.VAZIO);
        ProdutoResponse agendada = ProdutoResponse.de(comPromocao, SEM_CATEGORIAS, true, inicio.minusDays(1),
                ResumoDeEstoque.VAZIO);
        ProdutoResponse encerrada = ProdutoResponse.de(comPromocao, SEM_CATEGORIAS, true, fim.plusDays(1),
                ResumoDeEstoque.VAZIO);

        assertThat(vigente.promocao())
                .isEqualTo(new PromocaoResponse(new BigDecimal("8.90"), inicio, fim, SituacaoPromocao.VIGENTE));
        assertThat(vigente.emPromocao()).isTrue();
        assertThat(agendada.promocao().situacao()).isEqualTo(SituacaoPromocao.AGENDADA);
        assertThat(agendada.emPromocao()).isFalse();
        assertThat(encerrada.promocao().situacao()).isEqualTo(SituacaoPromocao.ENCERRADA);
        assertThat(encerrada.emPromocao()).isFalse();
    }

    @Test
    void semPromocaoNemAtacadoSaemNulos() {
        ProdutoResponse response = responder(ProdutoTesteBuilder.produto(empresa, un).build());

        assertThat(response.promocao()).isNull();
        assertThat(response.emPromocao()).isFalse();
        assertThat(response.atacado()).isNull();
    }

    @Test
    void atacadoEMapeado() {
        ProdutoResponse response = responder(ProdutoTesteBuilder.produto(empresa, kg).atacado("4.20", "12.000").build());

        assertThat(response.atacado()).isEqualTo(new AtacadoResponse(new BigDecimal("4.20"), new BigDecimal("12.000")));
    }

    // ---------- Fase D: estoque ----------

    @Test
    void estoqueAtualESituacaoVemDoResumo() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).pontoReposicao("5").build();

        ProdutoResponse response = ProdutoResponse.de(produto, SEM_CATEGORIAS, true, HOJE,
                new ResumoDeEstoque(new BigDecimal("4.000"), 2, 1));

        assertThat(response.controlaEstoque()).isTrue();
        assertThat(response.estoqueAtual()).isEqualByComparingTo("4");
        assertThat(response.situacaoEstoque()).isEqualTo(SituacaoEstoque.BAIXO);
    }

    /** O saldo sai sempre com 3 casas, como a coluna NUMERIC(12,3). */
    @Test
    void saldoDoResumoSempreComTresCasas() {
        assertThat(new ResumoDeEstoque(new BigDecimal("5"), 1, 0).saldo()).isEqualTo(new BigDecimal("5.000"));
        assertThat(new ResumoDeEstoque(new BigDecimal("2.5"), 1, 0).saldo()).isEqualTo(new BigDecimal("2.500"));
        assertThat(ResumoDeEstoque.VAZIO.saldo()).isEqualTo(new BigDecimal("0.000"));
    }

    @Test
    void semControleMantemOSaldoESituacaoNula() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).semControleDeEstoque().build();

        ProdutoResponse response = ProdutoResponse.de(produto, SEM_CATEGORIAS, true, HOJE,
                new ResumoDeEstoque(new BigDecimal("12"), 1, 0));

        assertThat(response.controlaEstoque()).isFalse();
        assertThat(response.estoqueAtual()).isEqualByComparingTo("12");
        assertThat(response.situacaoEstoque()).isNull();
    }

    @Test
    void resumoVazioTemSaldoZeroESemEstoque() {
        ProdutoResponse response = responder(ProdutoTesteBuilder.produto(empresa, un).build());

        assertThat(response.estoqueAtual()).isEqualTo(new BigDecimal("0.000"));
        assertThat(response.situacaoEstoque()).isEqualTo(SituacaoEstoque.SEM_ESTOQUE);
        assertThat(ResumoDeEstoque.VAZIO.temMovimentos()).isFalse();
        assertThat(ResumoDeEstoque.VAZIO.permiteExcluir()).isTrue();
    }
}
