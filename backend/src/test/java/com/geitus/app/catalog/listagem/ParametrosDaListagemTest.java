package com.geitus.app.catalog.listagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.shared.paginacao.PaginacaoInvalidaException;

/**
 * Padroes e limites dos parametros da listagem num lugar so (spec de Produtos):
 * ausente vale o padrao, a busca tem teto e a promocao tem allow-list propria.
 */
class ParametrosDaListagemTest {

    private static final ParametrosDaListagem PADRAO =
            new ParametrosDaListagem(null, StatusFiltro.ATIVOS, null, null, false, OrdemDeProdutos.NOME, 0, 25);

    @Test
    void tudoAusenteUsaOsPadroes() {
        assertThat(ParametrosDaListagem.daRequisicao(null, null, null, null, null, null, null, null))
                .isEqualTo(PADRAO);
    }

    @Test
    void statusEOrdemNulosNoConstrutorUsamOPadrao() {
        assertThat(new ParametrosDaListagem(null, null, null, null, false, null, 0, 25)).isEqualTo(PADRAO);
    }

    @Test
    void promocaoAceitaSoTrueEFalse() {
        assertThat(ParametrosDaListagem.daRequisicao(null, null, null, null, "true", null, null, null).emPromocao())
                .isTrue();
        assertThat(ParametrosDaListagem.daRequisicao(null, null, null, null, "false", null, null, null)
                .emPromocao()).isFalse();
        assertThat(ParametrosDaListagem.daRequisicao(null, null, null, null, " ", null, null, null).emPromocao())
                .isFalse();
        assertThatThrownBy(() -> ParametrosDaListagem.daRequisicao(null, null, null, null, "1", null, null, null))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Filtro de promoção inválido.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("promocao"));
    }

    @Test
    void buscaTemTetoDeDuzentosCaracteres() {
        assertThat(ParametrosDaListagem.daRequisicao("a".repeat(200), null, null, null, null, null, null, null)
                .busca()).hasSize(200);
        assertThatThrownBy(() -> ParametrosDaListagem.daRequisicao("a".repeat(201), null, null, null, null, null,
                null, null))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A busca deve ter no máximo 200 caracteres.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("busca"));
    }

    @Test
    void paginaETamanhoForaDosLimites400() {
        assertThatThrownBy(() -> ParametrosDaListagem.daRequisicao(null, null, null, null, null, null, -1, null))
                .isInstanceOf(PaginacaoInvalidaException.class);
        assertThatThrownBy(() -> ParametrosDaListagem.daRequisicao(null, null, null, null, null, null, null, 101))
                .isInstanceOf(PaginacaoInvalidaException.class);
    }
}
