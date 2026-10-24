package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.dto.EmbalagemRequest;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.company.Empresa;

/**
 * Regras das embalagens do produto (docs/modules/produtos-embalagens.md, 2 e
 * 3.3): uma asserção por mensagem da spec 2.3, com o campo indexado, e a
 * reconciliacao por {@code id}.
 */
@ExtendWith(MockitoExtension.class)
class EmbalagensDoProdutoTest {

    private static final Long EMPRESA_ID = 1L;
    private static final String EAN13_VALIDO = "7891000315507";
    private static final String EAN8_VALIDO = "96385074";

    @Mock
    private UnidadeMedidaService unidadeService;

    @Mock
    private ProdutoRepository produtoRepository;

    private EmbalagensDoProduto embalagens;

    private Empresa empresa;
    private UnidadeMedida un;
    private UnidadeMedida kg;
    private UnidadeMedida cx;
    private UnidadeMedida fd;
    private UnidadeMedida sc;

    @BeforeEach
    void setUp() {
        embalagens = new EmbalagensDoProduto(unidadeService, new ValidadorDeCodigosDeBarras(produtoRepository));
        empresa = new Empresa("Empresa");
        ReflectionTestUtils.setField(empresa, "id", EMPRESA_ID);
        un = unidade(10L, "UN", false);
        kg = unidade(11L, "KG", true);
        cx = unidade(12L, "CX", false);
        fd = unidade(13L, "FD", false);
        sc = unidade(14L, "SC", false);
    }

    private UnidadeMedida unidade(Long id, String sigla, boolean fracionada) {
        UnidadeMedida unidade = new UnidadeMedida(empresa, sigla, "Unidade " + sigla, fracionada);
        ReflectionTestUtils.setField(unidade, "id", id);
        lenient().when(unidadeService.buscarDaEmpresa(EMPRESA_ID, unidade.getUuid())).thenReturn(unidade);
        return unidade;
    }

    private static EmbalagemRequest embalagem(UnidadeMedida unidade, String quantidade, String preco,
            boolean deCompra, String... codigos) {
        return embalagem(null, unidade, quantidade, preco, deCompra, codigos);
    }

    private static EmbalagemRequest embalagem(UUID id, UnidadeMedida unidade, String quantidade, String preco,
            boolean deCompra, String... codigos) {
        return new EmbalagemRequest(id, unidade.getUuid(), new BigDecimal(quantidade),
                preco == null ? null : new BigDecimal(preco), deCompra, List.of(codigos));
    }

    /** Planeja no cadastro (sem produto atual), com a unidade de venda e o preco minimo informados. */
    private PlanoDeEmbalagens planejar(UnidadeMedida venda, String precoMinimo, EmbalagemRequest... informadas) {
        return embalagens.planejar(EMPRESA_ID, null, venda, precoMinimo == null ? null : new BigDecimal(precoMinimo),
                List.of(informadas), List.of());
    }

    private static void erro400(ThrowingCallable chamada, String mensagem, String campo) {
        assertThatThrownBy(chamada)
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(mensagem)
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains(campo));
    }

    // ---------- Limite e unidade ----------

    @Test
    void maisDeDezEmbalagens() {
        EmbalagemRequest[] onze = IntStream.rangeClosed(2, 12)
                .mapToObj(quantidade -> embalagem(cx, String.valueOf(quantidade), null, false))
                .toArray(EmbalagemRequest[]::new);

        erro400(() -> planejar(un, null, onze), "Informe no máximo 10 embalagens.", "embalagens");
    }

    @Test
    void unidadeIgualADeVenda() {
        erro400(() -> planejar(un, null, embalagem(cx, "3", null, false), embalagem(un, "3", null, false)),
                "A embalagem precisa de uma unidade diferente da unidade de venda (UN).",
                "embalagens[1].unidadeId");
    }

    /** A primeira regra que falha responde: a unidade vem antes da quantidade. */
    @Test
    void unidadeIgualComQuantidadeInvalidaApontaAUnidade() {
        erro400(() -> planejar(un, null, embalagem(un, "1", null, false)),
                "A embalagem precisa de uma unidade diferente da unidade de venda (UN).",
                "embalagens[0].unidadeId");
    }

    @Test
    void unidadeInativaSoSeJaForADaEmbalagem() {
        cx.inativar();
        erro400(() -> planejar(un, null, embalagem(cx, "3", null, false)),
                "Esta unidade está inativa. Escolha uma unidade ativa.", "embalagens[0].unidadeId");

        Produto produto = ProdutoTesteBuilder.produto(empresa, un).id(5L).embalagem(cx, "3", null, false).build();
        UUID caixa = produto.getEmbalagens().get(0).getUuid();
        assertThatCode(() -> embalagens.planejar(EMPRESA_ID, produto, un, null,
                List.of(embalagem(caixa, cx, "6", null, false)), List.of())).doesNotThrowAnyException();
    }

    // ---------- Quantidade ----------

    @Test
    void quantidadeAteUm() {
        erro400(() -> planejar(un, null, embalagem(cx, "1", null, false)),
                "A embalagem precisa conter mais de 1 UN.", "embalagens[0].quantidade");
        erro400(() -> planejar(kg, null, embalagem(sc, "0.5", null, false)),
                "A embalagem precisa conter mais de 1 KG.", "embalagens[0].quantidade");
    }

    @Test
    void quantidadeFracionadaEmUnidadeNaoFracionada() {
        erro400(() -> planejar(un, null, embalagem(cx, "2.5", null, false)),
                "UN não aceita quantidade fracionada. Informe um número inteiro.", "embalagens[0].quantidade");
    }

    @Test
    void quantidadeFracionadaEmUnidadeFracionadaPassa() {
        PlanoDeEmbalagens plano = planejar(kg, null, embalagem(sc, "25.5", null, false));

        assertThat(plano.embalagens()).singleElement().satisfies(planejada -> {
            assertThat(planejada.rotulo()).isEqualTo("SC c/ 25,5 KG");
            assertThat(planejada.dados().quantidade()).isEqualByComparingTo("25.5");
        });
    }

    // ---------- Repeticao e compra ----------

    @Test
    void embalagemRepetida() {
        erro400(() -> planejar(un, null, embalagem(cx, "3", null, false), embalagem(fd, "3", null, false),
                embalagem(cx, "3.000", null, false)),
                "Já existe a embalagem CX c/ 3 UN neste produto.", "embalagens[2].unidadeId");
    }

    @Test
    void mesmaUnidadeComQuantidadesDiferentesPassa() {
        assertThat(planejar(un, null, embalagem(cx, "12", null, false), embalagem(cx, "24", null, false))
                .embalagens()).hasSize(2);
    }

    @Test
    void duasDeCompra() {
        erro400(() -> planejar(un, null, embalagem(cx, "3", null, true), embalagem(fd, "12", null, true)),
                "Só uma embalagem pode ser a de compra.", "embalagens[1].deCompra");
    }

    // ---------- Preco ----------

    @Test
    void precoNaoPositivo() {
        erro400(() -> planejar(un, null, embalagem(cx, "3", "0", false)),
                "O preço da embalagem deve ser maior que zero.", "embalagens[0].preco");
    }

    /** Spec 3.3: preco &lt; minimo x quantidade, sem divisao; o valor por unidade e truncado. */
    @Test
    void precoAbaixoDoMinimoPorUnidade() {
        assertThatCode(() -> planejar(un, "70.00", embalagem(cx, "3", "210.00", false))).doesNotThrowAnyException();
        erro400(() -> planejar(un, "70.00", embalagem(cx, "3", "209.99", false)),
                "O preço da embalagem dá R$ 69,99 por UN, abaixo do preço mínimo (R$ 70,00).",
                "embalagens[0].preco");
        erro400(() -> planejar(un, "70.00", embalagem(cx, "3", "209.90", false)),
                "O preço da embalagem dá R$ 69,96 por UN, abaixo do preço mínimo (R$ 70,00).",
                "embalagens[0].preco");
    }

    @Test
    void precoMinimoComSeparadorDeMilhar() {
        erro400(() -> planejar(un, "1500.00", embalagem(cx, "2", "2999.98", false)),
                "O preço da embalagem dá R$ 1.499,99 por UN, abaixo do preço mínimo (R$ 1.500,00).",
                "embalagens[0].preco");
    }

    /** Sem preco proprio (calculado) ou sem preco minimo: nada a conferir. */
    @Test
    void semPrecoProprioOuSemMinimoNaoConfere() {
        assertThatCode(() -> planejar(un, "70.00", embalagem(cx, "3", null, false))).doesNotThrowAnyException();
        assertThatCode(() -> planejar(un, null, embalagem(cx, "3", "0.01", false))).doesNotThrowAnyException();
    }

    // ---------- Codigos de barras ----------

    @Test
    void maisDeCincoCodigos() {
        erro400(() -> planejar(un, null, embalagem(cx, "3", null, false, "A1", "A2", "A3", "A4", "A5", "A6")),
                "Informe no máximo 5 códigos de barras por embalagem.", "embalagens[0].codigosBarras");
    }

    @Test
    void codigoRepetidoEntreAUnidadeEAEmbalagem() {
        erro400(() -> embalagens.planejar(EMPRESA_ID, null, un, null,
                List.of(embalagem(cx, "3", null, false, EAN8_VALIDO), embalagem(fd, "12", null, false, EAN13_VALIDO)),
                List.of(EAN13_VALIDO)),
                "Código de barras repetido na lista.", "embalagens[1].codigosBarras");
    }

    @Test
    void codigoComDigitoInvalidoNaEmbalagem() {
        erro400(() -> planejar(un, null, embalagem(cx, "3", null, false, "7891000315508")),
                "Código de barras 7891000315508 com dígito verificador inválido. Confira a leitura.",
                "embalagens[0].codigosBarras");
    }

    // ---------- Reconciliacao por id ----------

    @Test
    void idDeOutroProdutoOuInexistenteDa404() {
        assertThatThrownBy(() -> planejar(un, null, embalagem(UUID.randomUUID(), cx, "3", null, false)))
                .isInstanceOf(CatalogoNaoEncontradoException.class)
                .hasMessage("Embalagem não encontrada.");
    }

    @Test
    void planoSeparaMantidasNovasERemovidas() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).id(5L)
                .embalagem(cx, "3", "209.90", false, EAN13_VALIDO)
                .embalagem(fd, "12", "800.00", true)
                .build();
        ProdutoEmbalagem caixa = produto.getEmbalagens().get(0);

        PlanoDeEmbalagens plano = embalagens.planejar(EMPRESA_ID, produto, un, null,
                List.of(embalagem(sc, "6", null, false), embalagem(caixa.getUuid(), cx, "3", "199.90", true,
                        EAN13_VALIDO)), List.of());

        assertThat(plano.embalagens()).extracting(PlanoDeEmbalagens.EmbalagemPlanejada::existente)
                .containsExactly(null, caixa);
        assertThat(plano.embalagens().get(1).precoAnterior()).isEqualByComparingTo("209.90");
        assertThat(plano.embalagens().get(1).dados().ordem()).isEqualTo(1);
        assertThat(plano.embalagens().get(1).codigos())
                .containsExactly(new CodigoBarrasValidado(EAN13_VALIDO, FormatoCodigoBarras.EAN13));
        assertThat(plano.removidas()).singleElement().satisfies(removida -> {
            assertThat(removida.rotulo()).isEqualTo("FD c/ 12 UN");
            assertThat(removida.embalagem().getPreco()).isEqualByComparingTo("800.00");
        });
    }

    /** Lista ausente no PATCH: as atuais continuam e sao conferidas de novo (Review Focus 3). */
    @Test
    void listaAusenteMantemAsAtuaisEConfereAUnidadeDeVendaNova() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, kg).id(5L).embalagem(sc, "25.5", null, false).build();

        PlanoDeEmbalagens mantidas = embalagens.planejar(EMPRESA_ID, produto, kg, null, null, List.of());

        assertThat(mantidas.embalagens()).singleElement()
                .satisfies(planejada -> assertThat(planejada.existente()).isSameAs(produto.getEmbalagens().get(0)));
        assertThat(mantidas.removidas()).isEmpty();
        erro400(() -> embalagens.planejar(EMPRESA_ID, produto, un, null, null, List.of()),
                "UN não aceita quantidade fracionada. Informe um número inteiro.", "embalagens[0].quantidade");
    }

    /** Lista ausente: o codigo da unidade repetido numa embalagem mantida aponta a lista da unidade. */
    @Test
    void listaAusenteComCodigoDaUnidadeRepetidoApontaOsCodigosDaUnidade() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).id(5L).embalagem(cx, "3", null, false,
                EAN13_VALIDO).build();

        erro400(() -> embalagens.planejar(EMPRESA_ID, produto, un, null, null, List.of(EAN13_VALIDO)),
                "Código de barras repetido na lista.", "codigosBarras");
    }

    // ---------- Aplicacao em duas fases (Review Focus 1 e 2) ----------

    /** O codigo mantido continua sendo a mesma linha; o removido sai na fase 1 e a de compra e liberada. */
    @Test
    void aplicacaoPreservaALinhaDoCodigoMantido() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).id(5L)
                .embalagem(cx, "3", "209.90", true, EAN13_VALIDO, EAN8_VALIDO)
                .embalagem(fd, "12", null, false)
                .build();
        ProdutoEmbalagem caixa = produto.getEmbalagens().get(0);
        ProdutoCodigoBarras linhaMantida = caixa.getCodigosBarras().get(0);
        PlanoDeEmbalagens plano = embalagens.planejar(EMPRESA_ID, produto, un, null,
                List.of(embalagem(caixa.getUuid(), cx, "3", "199.90", false, EAN13_VALIDO),
                        embalagem(sc, "6", null, true, EAN8_VALIDO)), List.of());

        embalagens.aplicarRemocoes(produto, plano);

        assertThat(produto.getEmbalagens()).containsExactly(caixa);
        assertThat(caixa.getCodigosBarras()).containsExactly(linhaMantida);
        assertThat(caixa.isDeCompra()).isFalse();

        embalagens.aplicarInclusoes(produto, plano);

        assertThat(produto.getEmbalagens()).extracting(ProdutoEmbalagem::rotulo)
                .containsExactly("CX c/ 3 UN", "SC c/ 6 UN");
        assertThat(caixa.getPreco()).isEqualByComparingTo("199.90");
        assertThat(caixa.getCodigosBarras()).containsExactly(linhaMantida);
        assertThat(produto.getEmbalagens().get(1).isDeCompra()).isTrue();
        assertThat(produto.getEmbalagens().get(1).getCodigosBarras()).extracting(ProdutoCodigoBarras::getCodigo)
                .containsExactly(EAN8_VALIDO);
    }

    @Test
    void cadastroSemEmbalagensTemPlanoVazio() {
        PlanoDeEmbalagens plano = embalagens.planejar(EMPRESA_ID, null, un, null, null, new ArrayList<>());

        assertThat(plano.embalagens()).isEmpty();
        assertThat(plano.removidas()).isEmpty();
    }
}
