package com.geitus.app.shared.busca;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.CodigoBarras;

/**
 * Normalizacao do texto de busca (docs/modules/produtos-listagem.md, 4.1): sem
 * acento, minusculas, espacos Unicode colapsados e pontas aparadas.
 */
class TextoDeBuscaTest {

    @Test
    void removeAcentosEColapsaEspacos() {
        assertThat(TextoDeBusca.normalizar("Açúcar  Cristal")).isEqualTo("acucar cristal");
    }

    @Test
    void cedilhaETilViramLetraBase() {
        assertThat(TextoDeBusca.normalizar("ÇÃO")).isEqualTo("cao");
    }

    @Test
    void aparaAsPontas() {
        assertThat(TextoDeBusca.normalizar(" a b ")).isEqualTo("a b");
    }

    @Test
    void espacosUnicodeViramUmEspacoSo() {
        assertThat(TextoDeBusca.normalizar("\u00a0Arroz\u2007\u202f\tTipo\u3000 1\u00a0"))
                .isEqualTo("arroz tipo 1");
    }

    @Test
    void nuloOuVazioViraTextoVazio() {
        assertThat(TextoDeBusca.normalizar(null)).isEmpty();
        assertThat(TextoDeBusca.normalizar("")).isEmpty();
        assertThat(TextoDeBusca.normalizar("\u00a0 \u2007")).isEmpty();
    }

    @Test
    void marcaCombinanteSoltaESumida() {
        // "e" seguido do acento agudo combinante (texto ja decomposto).
        assertThat(TextoDeBusca.normalizar("Cafe\u0301")).isEqualTo("cafe");
    }

    /** Controles e formatacao invisiveis (NUL, zero-width, BOM, hifen opcional) somem sem virar espaco. */
    @Test
    void removeCaracteresDeControleEDeFormatacao() {
        assertThat(TextoDeBusca.normalizar("arroz\u200b")).isEqualTo("arroz");
        assertThat(TextoDeBusca.normalizar("\ufeffAr\u00adroz\u0001 Tipo\u2060 1\u007f")).isEqualTo("arroz tipo 1");
        assertThat(TextoDeBusca.normalizar("\0")).isEmpty();
        assertThat(TextoDeBusca.normalizar("a \u200b b")).isEqualTo("a b");
    }

    /** Os controles que sao espaco (tab, quebra de linha, U+0085) viram espaco, como no codigo de barras. */
    @Test
    void controlesQueSaoEspacoViramEspaco() {
        assertThat(TextoDeBusca.normalizar("Leite\u0085Integral\u000b1L\r\n")).isEqualTo("leite integral 1l");
    }

    @Test
    void termoDeCodigoTiraEspacosEControlesEPreservaAsLetras() {
        assertThat(TextoDeBusca.termoDeCodigo(" 7891\u00a0000\u200b 315 ")).isEqualTo("7891000315");
        assertThat(TextoDeBusca.termoDeCodigo("Abc-1")).isEqualTo("Abc-1");
        assertThat(TextoDeBusca.termoDeCodigo("\u0301")).isEqualTo("\u0301");
    }

    @Test
    void termoDeCodigoSoComEspacosOuControlesEhNulo() {
        assertThat(TextoDeBusca.termoDeCodigo(null)).isNull();
        assertThat(TextoDeBusca.termoDeCodigo("\0")).isNull();
        assertThat(TextoDeBusca.termoDeCodigo("\u00a0\u2007\u202f\u0085\ufeff \t")).isNull();
    }

    /** Mesma classe de espacos da busca e do codigo de barras (White_Space do Unicode). */
    @Test
    void espacosSaoOsMesmosDoCodigoDeBarras() {
        String comEspacos = "\u0085a\u00a0b\u1680c\u2000d\u2028e\u202ff\u205fg\u3000h\u000bi";
        assertThat(TextoDeBusca.termoDeCodigo(comEspacos)).isEqualTo(CodigoBarras.normalizar(comEspacos))
                .isEqualTo("abcdefghi");
    }

    @Test
    void textoDoProdutoJuntaOsCamposInformados() {
        assertThat(TextoDeBusca.textoDoProduto("Ração Golden", null, "P000001", "Premier"))
                .isEqualTo("racao golden p000001 premier");
        assertThat(TextoDeBusca.textoDoProduto("Sachê", "SACHE GT", null, "  ")).isEqualTo("sache sache gt");
    }

    @Test
    void palavrasDescartaVaziasENormaliza() {
        assertThat(TextoDeBusca.palavras("  uniao   acucar  ")).containsExactly("uniao", "acucar");
        assertThat(TextoDeBusca.palavras("União AÇÚCAR")).containsExactly("uniao", "acucar");
    }

    @Test
    void palavrasLimitaACincoPrimeiras() {
        assertThat(TextoDeBusca.palavras("um dois tres quatro cinco seis sete"))
                .containsExactly("um", "dois", "tres", "quatro", "cinco");
    }

    @Test
    void palavrasDeTextoSoComEspacosOuNuloEVazia() {
        assertThat(TextoDeBusca.palavras(null)).isEmpty();
        assertThat(TextoDeBusca.palavras("\u00a0\u2007 \u202f")).isEmpty();
    }
}
