package com.geitus.app.shared.busca;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

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
