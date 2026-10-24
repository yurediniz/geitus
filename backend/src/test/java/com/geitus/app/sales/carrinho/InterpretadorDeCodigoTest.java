package com.geitus.app.sales.carrinho;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.geitus.app.catalog.balanca.ConfiguracaoEtiqueta;
import com.geitus.app.catalog.balanca.TipoInformacaoEtiqueta;
import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.carrinho.CodigoInterpretado.Busca;
import com.geitus.app.sales.carrinho.CodigoInterpretado.CodigoComQuantidade;
import com.geitus.app.sales.carrinho.CodigoInterpretado.Etiqueta;

/** Interpretacao do texto lido no PDV (docs/modules/pdv.md, 3.1 e 8, "Interpretador"). */
class InterpretadorDeCodigoTest {

    private static final ConfiguracaoEtiqueta PADRAO = ConfiguracaoEtiqueta.padrao();

    @Test
    void codigoComQuantidade() {
        CodigoComQuantidade lido = comQuantidade("542*3");

        assertThat(lido.codigo()).isEqualTo("542");
        assertThat(lido.quantidade()).isEqualByComparingTo("3");
        assertThat(lido.codigoLido()).isEqualTo("542*3");
    }

    @Test
    void codigoComZerosAEsquerdaMantemOTextoParaAResolucao() {
        CodigoComQuantidade lido = comQuantidade("0542*3");

        assertThat(lido.codigo()).isEqualTo("0542");
        assertThat(Integer.parseInt(lido.codigo())).isEqualTo(542);
        assertThat(lido.quantidade()).isEqualByComparingTo("3");
    }

    @ParameterizedTest
    @ValueSource(strings = {"542*0,750", "542*0.750"})
    void quantidadeDecimalComVirgulaOuPonto(String texto) {
        assertThat(comQuantidade(texto).quantidade()).isEqualByComparingTo("0.750");
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "*3|Use código*quantidade, por exemplo 542*3.",
            "542*|Use código*quantidade, por exemplo 542*3.",
            "542*abc|Use código*quantidade, por exemplo 542*3.",
            "542*-1|A quantidade deve ser maior que zero.",
            "542*0|A quantidade deve ser maior que zero.",
            "542*100000|Quantidade acima do permitido.",
            "542*1,2345|Informe a quantidade com até 3 casas decimais."})
    void quantidadeInvalidaRecusada(String texto, String mensagem) {
        assertThatThrownBy(() -> InterpretadorDeCodigo.interpretar(texto, PADRAO))
                .isInstanceOf(DadosDaVendaInvalidosException.class)
                .hasMessage(mensagem)
                .satisfies(erro -> assertThat(((DadosDaVendaInvalidosException) erro).erros().get(0).campo())
                        .isEqualTo("codigo"));
    }

    @Test
    void etiquetaComAConfiguracaoPadrao() {
        CodigoInterpretado lido = InterpretadorDeCodigo.interpretar("2000542010000", PADRAO);

        assertThat(lido).isInstanceOf(Etiqueta.class);
        Etiqueta etiqueta = (Etiqueta) lido;
        assertThat(etiqueta.codigoLido()).isEqualTo("2000542010000");
        assertThat(etiqueta.leitura().codigoProduto()).isEqualTo(542);
        assertThat(etiqueta.leitura().tipo()).isEqualTo(TipoInformacaoEtiqueta.VALOR);
        assertThat(etiqueta.leitura().valor()).isEqualByComparingTo("10.000");
    }

    @Test
    void codigoZeroNaoEEtiquetaEViraCodigoDeBarras() {
        CodigoInterpretado lido = InterpretadorDeCodigo.interpretar("2000000010000", PADRAO);

        assertThat(lido).isInstanceOf(CodigoComQuantidade.class);
        assertThat(((CodigoComQuantidade) lido).codigo()).isEqualTo("2000000010000");
    }

    @Test
    void textoComEspacoViraBusca() {
        assertThat(InterpretadorDeCodigo.interpretar("  ração x ", PADRAO)).isEqualTo(new Busca("ração x"));
    }

    @Test
    void codigoDeBarrasComQuantidadeUm() {
        CodigoComQuantidade lido = comQuantidade("7891234567895");

        assertThat(lido.codigo()).isEqualTo("7891234567895");
        assertThat(lido.quantidade()).isEqualByComparingTo(BigDecimal.ONE);
    }

    private static CodigoComQuantidade comQuantidade(String texto) {
        CodigoInterpretado lido = InterpretadorDeCodigo.interpretar(texto, PADRAO);
        assertThat(lido).isInstanceOf(CodigoComQuantidade.class);
        return (CodigoComQuantidade) lido;
    }
}
