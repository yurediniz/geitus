package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Regras de uma lista de codigos de barras (Fase B, 4.3), extraidas do
 * {@code ProdutoService} para valer tambem nas embalagens (Fase B3, 2.1):
 * limite e mensagem do chamador, repetidos, digito GS1, codigo gravado
 * mantido e unicidade na empresa.
 */
@ExtendWith(MockitoExtension.class)
class ValidadorDeCodigosDeBarrasTest {

    private static final Long EMPRESA_ID = 1L;
    private static final Long PRODUTO_ID = 7L;
    private static final String EAN13_VALIDO = "7891000315507";
    private static final String EAN13_DIGITO_INVALIDO = "7891000315508";
    private static final String EAN8_VALIDO = "96385074";
    private static final String CAMPO_DA_EMBALAGEM = "embalagens[0].codigosBarras";
    private static final String LIMITE_DA_EMBALAGEM = "Informe no máximo 5 códigos de barras por embalagem.";
    private static final String LIMITE_DA_UNIDADE = "Informe no máximo 20 códigos de barras.";

    @Mock
    private ProdutoRepository produtoRepository;

    private ValidadorDeCodigosDeBarras validador;

    @BeforeEach
    void setUp() {
        validador = new ValidadorDeCodigosDeBarras(produtoRepository);
    }

    @Test
    void limiteDaEmbalagemUsaAMensagemDoChamador() {
        List<String> seis = List.of("A1", "A2", "A3", "A4", "A5", "A6");

        assertThatThrownBy(() -> validador.validar(EMPRESA_ID, seis, 5, LIMITE_DA_EMBALAGEM, CAMPO_DA_EMBALAGEM,
                Map.of(), null))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(LIMITE_DA_EMBALAGEM)
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains(CAMPO_DA_EMBALAGEM));
    }

    @Test
    void limiteDaUnidadeMantemAMensagemAtual() {
        List<String> vinteEUm = java.util.stream.IntStream.rangeClosed(1, 21).mapToObj(i -> "C" + i).toList();

        assertThatThrownBy(() -> validador.validar(EMPRESA_ID, vinteEUm, 20, LIMITE_DA_UNIDADE, "codigosBarras",
                Map.of(), null))
                .hasMessage(LIMITE_DA_UNIDADE);
    }

    @Test
    void cincoCodigosNaEmbalagemPassam() {
        List<String> cinco = List.of("A1", "A2", "A3", "A4", "A5");

        assertThat(validador.validar(EMPRESA_ID, cinco, 5, LIMITE_DA_EMBALAGEM, CAMPO_DA_EMBALAGEM, Map.of(), null))
                .extracting(CodigoBarrasValidado::codigo)
                .containsExactlyElementsOf(cinco);
    }

    @Test
    void recusaRepetidoNaLista() {
        assertThatThrownBy(() -> validador.validar(EMPRESA_ID, List.of(EAN13_VALIDO, " 7891000315507 "), 5,
                LIMITE_DA_EMBALAGEM, CAMPO_DA_EMBALAGEM, Map.of(), null))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Código de barras repetido na lista.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains(CAMPO_DA_EMBALAGEM));
    }

    @Test
    void recusaDigitoVerificadorInvalido() {
        assertThatThrownBy(() -> validador.validar(EMPRESA_ID, List.of(EAN13_DIGITO_INVALIDO), 5,
                LIMITE_DA_EMBALAGEM, CAMPO_DA_EMBALAGEM, Map.of(), null))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Código de barras 7891000315508 com dígito verificador inválido. Confira a leitura.");
    }

    /** Um codigo que o produto ja tem mantem o formato gravado (OUTRO da migracao) e nao consulta o banco. */
    @Test
    void codigoGravadoMantemOFormato() {
        List<CodigoBarrasValidado> validados = validador.validar(EMPRESA_ID, List.of(EAN13_DIGITO_INVALIDO), 5,
                LIMITE_DA_EMBALAGEM, CAMPO_DA_EMBALAGEM, Map.of(EAN13_DIGITO_INVALIDO, FormatoCodigoBarras.OUTRO),
                PRODUTO_ID);

        assertThat(validados).containsExactly(new CodigoBarrasValidado(EAN13_DIGITO_INVALIDO,
                FormatoCodigoBarras.OUTRO));
        verify(produtoRepository, never()).produtoComCodigo(any(), any(), any());
    }

    @Test
    void codigoNovoTemOFormatoDetectadoEConfereAUnicidadeForaDoProduto() {
        when(produtoRepository.produtoComCodigo(EMPRESA_ID, EAN8_VALIDO, PRODUTO_ID)).thenReturn(Optional.empty());

        assertThat(validador.validar(EMPRESA_ID, List.of(EAN8_VALIDO), 5, LIMITE_DA_EMBALAGEM, CAMPO_DA_EMBALAGEM,
                Map.of(), PRODUTO_ID))
                .containsExactly(new CodigoBarrasValidado(EAN8_VALIDO, FormatoCodigoBarras.EAN8));
    }

    @Test
    void codigoDeOutroProdutoDa409NoCampoDoChamador() {
        when(produtoRepository.produtoComCodigo(eq(EMPRESA_ID), eq(EAN13_VALIDO), any()))
                .thenReturn(Optional.of("Arroz 5kg"));

        assertThatThrownBy(() -> validador.validar(EMPRESA_ID, List.of(EAN13_VALIDO), 5, LIMITE_DA_EMBALAGEM,
                CAMPO_DA_EMBALAGEM, Map.of(), null))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("O código de barras 7891000315507 já está cadastrado no produto \"Arroz 5kg\".")
                .satisfies(erro -> assertThat(((ProdutoConflitoException) erro).campo()).contains(CAMPO_DA_EMBALAGEM));
    }

    /** Fase B3 (2.3): com o codigo numa embalagem de outro produto, a mensagem traz o rotulo. */
    @Test
    void codigoNaEmbalagemDeOutroProdutoDa409ComORotulo() {
        when(produtoRepository.produtoComCodigo(EMPRESA_ID, EAN13_VALIDO, PRODUTO_ID))
                .thenReturn(Optional.of("Nexgard Combo"));
        when(produtoRepository.codigosEmUso(EMPRESA_ID, List.of(EAN13_VALIDO), PRODUTO_ID))
                .thenReturn(List.of(new CodigoDeBarrasEmUso(EAN13_VALIDO, "Nexgard Combo", "CX",
                        new java.math.BigDecimal("3.000"), "UN")));

        assertThatThrownBy(() -> validador.validar(EMPRESA_ID, List.of(EAN13_VALIDO), 5, LIMITE_DA_EMBALAGEM,
                CAMPO_DA_EMBALAGEM, Map.of(), PRODUTO_ID))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código já está em uso na embalagem CX c/ 3 UN do produto Nexgard Combo.")
                .satisfies(erro -> assertThat(((ProdutoConflitoException) erro).campo()).contains(CAMPO_DA_EMBALAGEM));
    }

    @Test
    void listaNulaOuComVaziosViraListaNormalizada() {
        assertThat(validador.validar(EMPRESA_ID, null, 5, LIMITE_DA_EMBALAGEM, CAMPO_DA_EMBALAGEM, Map.of(), null))
                .isEmpty();
        assertThat(validador.validar(EMPRESA_ID, Arrays.asList("  ", null), 5, LIMITE_DA_EMBALAGEM,
                CAMPO_DA_EMBALAGEM, Map.of(), null))
                .isEmpty();
        verify(produtoRepository, never()).produtoComCodigo(anyLong(), any(), any());
    }

    // ---------- Entre listas (unidade e embalagens) ----------

    @Test
    void repetidoEntreListasApontaASegundaOcorrencia() {
        List<List<String>> listas = List.of(List.of(EAN13_VALIDO), List.of(EAN8_VALIDO), List.of(" 7891000315507"));

        assertThatThrownBy(() -> validador.exigirSemRepetidosEntreListas(listas,
                indice -> indice == 0 ? "codigosBarras" : "embalagens[" + (indice - 1) + "].codigosBarras"))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Código de barras repetido na lista.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo())
                        .contains("embalagens[1].codigosBarras"));
    }

    @Test
    void listasSemRepeticaoPassam() {
        validador.exigirSemRepetidosEntreListas(List.of(List.of(EAN13_VALIDO), Arrays.asList(EAN8_VALIDO, null)),
                indice -> "lista" + indice);
    }
}
