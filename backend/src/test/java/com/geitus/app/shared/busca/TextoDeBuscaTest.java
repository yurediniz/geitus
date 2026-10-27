package com.geitus.app.shared.busca;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.CodigoBarras;

/**
 * Normalizacao do texto de busca (docs/modules/produtos.md): sem
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

    /** Fase B5: o texto do fornecedor (razao social, fantasia e representantes) usa a mesma juncao. */
    @Test
    void textoDosCamposJuntaOsInformadosNaOrdem() {
        assertThat(TextoDeBusca.textoDosCampos(Arrays.asList("Distribuidora São João", null, "  ",
                "Ana Lúcia"))).isEqualTo("distribuidora sao joao ana lucia");
        assertThat(TextoDeBusca.textoDosCampos(List.of())).isEmpty();
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

    // ---------- Fase B2: termo numerico (numero e codigo do produto) ----------

    @Test
    void termoNumericoSemEspacosESemZerosAEsquerda() {
        assertThat(TextoDeBusca.termoNumerico("542")).isEqualTo(542L);
        assertThat(TextoDeBusca.termoNumerico("0542")).isEqualTo(542L);
        assertThat(TextoDeBusca.termoNumerico(" 000542 ")).isEqualTo(542L);
        assertThat(TextoDeBusca.termoNumerico("1\u00a05")).isEqualTo(15L);
        assertThat(TextoDeBusca.termoNumerico("7891000315507")).isEqualTo(7_891_000_315_507L);
    }

    @Test
    void termoNumericoSoComDigitosAsciiAte18() {
        assertThat(TextoDeBusca.termoNumerico("123456789012345678")).isEqualTo(123_456_789_012_345_678L);
        assertThat(TextoDeBusca.termoNumerico("0000123456789012345678")).isEqualTo(123_456_789_012_345_678L);
        assertThat(TextoDeBusca.termoNumerico("1234567890123456789")).isNull();
        assertThat(TextoDeBusca.termoNumerico("99999999999999999999999")).isNull();
    }

    @Test
    void termoNaoNumericoOuSemValorEhNulo() {
        assertThat(TextoDeBusca.termoNumerico(null)).isNull();
        assertThat(TextoDeBusca.termoNumerico("   ")).isNull();
        assertThat(TextoDeBusca.termoNumerico("15a")).isNull();
        assertThat(TextoDeBusca.termoNumerico("-15")).isNull();
        assertThat(TextoDeBusca.termoNumerico("1,5")).isNull();
        assertThat(TextoDeBusca.termoNumerico("\uff11\uff15")).isNull();
        assertThat(TextoDeBusca.termoNumerico("000")).isNull();
    }
}
