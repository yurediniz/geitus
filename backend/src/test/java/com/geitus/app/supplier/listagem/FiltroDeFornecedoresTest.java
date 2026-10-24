package com.geitus.app.supplier.listagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.listagem.StatusFiltro;

/**
 * O termo da busca de fornecedores (docs/modules/fornecedores-e-marcas.md,
 * 4.7): palavras, documento (so com 4 digitos ou mais, com ou sem mascara) e o
 * Nº exato.
 */
class FiltroDeFornecedoresTest {

    private static final Long EMPRESA = 7L;

    @Test
    void numeroCurtoBuscaSoONumero() {
        FiltroDeFornecedores filtro = FiltroDeFornecedores.de(EMPRESA, "3", StatusFiltro.ATIVOS);

        assertThat(filtro.termoNumerico()).isEqualTo(3L);
        assertThat(filtro.digitosDoDocumento()).isNull();
    }

    @Test
    void documentoComMascaraEQuatroDigitosOuMais() {
        assertThat(FiltroDeFornecedores.de(EMPRESA, "11.222.333/0001-81", StatusFiltro.ATIVOS).digitosDoDocumento())
                .isEqualTo("11222333000181");
        assertThat(FiltroDeFornecedores.de(EMPRESA, " 1234 ", StatusFiltro.ATIVOS).digitosDoDocumento())
                .isEqualTo("1234");
        assertThat(FiltroDeFornecedores.de(EMPRESA, "12.3", StatusFiltro.ATIVOS).digitosDoDocumento()).isNull();
        assertThat(FiltroDeFornecedores.de(EMPRESA, "Loja 12345", StatusFiltro.ATIVOS).digitosDoDocumento())
                .isNull();
    }

    @Test
    void termoLongoQuaseDocumentoNaoTravaARegex() {
        String quaseDocumento = "1 ".repeat(99) + "x";

        assertTimeoutPreemptively(Duration.ofMillis(500), () -> assertThat(
                FiltroDeFornecedores.de(EMPRESA, quaseDocumento, StatusFiltro.ATIVOS).digitosDoDocumento()).isNull());
    }
}
