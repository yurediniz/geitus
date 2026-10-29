package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.shared.paginacao.PaginacaoInvalidaException;

class ParametrosDasMovimentacoesTest {

    private static final LocalDate HOJE = LocalDate.of(2026, 10, 28);

    @Test
    void ausentesValemOsUltimos30DiasPagina0E25Itens() {
        ParametrosDasMovimentacoes parametros = ParametrosDasMovimentacoes.daRequisicao(null, null, null, null,
                null, null, null, null, HOJE);

        assertThat(parametros.de()).isEqualTo(LocalDate.of(2026, 9, 29));
        assertThat(parametros.ate()).isEqualTo(HOJE);
        assertThat(parametros.tipo()).isNull();
        assertThat(parametros.motivo()).isNull();
        assertThat(parametros.pagina()).isZero();
        assertThat(parametros.tamanho()).isEqualTo(25);
    }

    @Test
    void semDeContaOs30DiasAteADataFinal() {
        ParametrosDasMovimentacoes parametros = ParametrosDasMovimentacoes.daRequisicao(" ", "2026-01-31", null,
                null, null, null, null, null, HOJE);

        assertThat(parametros.de()).isEqualTo(LocalDate.of(2026, 1, 2));
        assertThat(parametros.ate()).isEqualTo(LocalDate.of(2026, 1, 31));
    }

    @Test
    void leTipoEMotivoPeloNomeDaConstante() {
        ParametrosDasMovimentacoes parametros = ParametrosDasMovimentacoes.daRequisicao("2026-10-01", "2026-10-28",
                null, "SAIDA", "PERDA_AVARIA", 7L, 2, 50, HOJE);

        assertThat(parametros.tipo()).isEqualTo(TipoMovimento.SAIDA);
        assertThat(parametros.motivo()).isEqualTo(MotivoMovimento.PERDA_AVARIA);
        assertThat(parametros.usuario()).isEqualTo(7L);
        assertThat(parametros.pagina()).isEqualTo(2);
        assertThat(parametros.tamanho()).isEqualTo(50);
    }

    @Test
    void umDiaSoEUmAnoInteiroValem() {
        assertThat(ParametrosDasMovimentacoes.daRequisicao("2026-10-28", "2026-10-28", null, null, null, null, null,
                null, HOJE).de()).isEqualTo(HOJE);
        assertThat(ParametrosDasMovimentacoes.daRequisicao("2025-10-28", "2026-10-28", null, null, null, null, null,
                null, HOJE).de()).isEqualTo(LocalDate.of(2025, 10, 28));
    }

    @Test
    void periodoInvertidoOuMaiorQueUmAnoDa400ComOCampo() {
        assertCampo(() -> ParametrosDasMovimentacoes.daRequisicao("2026-10-28", "2026-10-27", null, null, null, null,
                null, null, HOJE), "de", ParametrosDasMovimentacoes.MENSAGEM_PERIODO_INVERTIDO);
        assertCampo(() -> ParametrosDasMovimentacoes.daRequisicao("2025-10-27", "2026-10-28", null, null, null, null,
                null, null, HOJE), "ate", ParametrosDasMovimentacoes.MENSAGEM_PERIODO_LONGO);
    }

    @Test
    void dataTipoOuMotivoInvalidoDa400ComOCampo() {
        assertCampo(() -> ParametrosDasMovimentacoes.daRequisicao("28/10/2026", null, null, null, null, null, null,
                null, HOJE), "de", ParametrosDasMovimentacoes.MENSAGEM_DATA_INVALIDA);
        assertCampo(() -> ParametrosDasMovimentacoes.daRequisicao(null, "2026-02-30", null, null, null, null, null,
                null, HOJE), "ate", ParametrosDasMovimentacoes.MENSAGEM_DATA_INVALIDA);
        assertCampo(() -> ParametrosDasMovimentacoes.daRequisicao(null, "+999999999-12-31", null, null, null, null,
                null, null, HOJE), "ate", ParametrosDasMovimentacoes.MENSAGEM_DATA_INVALIDA);
        assertCampo(() -> ParametrosDasMovimentacoes.daRequisicao(null, null, null, "entrada", null, null, null, null,
                HOJE), "tipo", ParametrosDasMovimentacoes.MENSAGEM_TIPO_INVALIDO);
        assertCampo(() -> ParametrosDasMovimentacoes.daRequisicao(null, null, null, null, "QUEBRA", null, null, null,
                HOJE), "motivo", ParametrosDasMovimentacoes.MENSAGEM_MOTIVO_INVALIDO);
    }

    @Test
    void tamanhoForaDosLimitesDa400() {
        assertThatThrownBy(() -> ParametrosDasMovimentacoes.daRequisicao(null, null, null, null, null, null, 0, 101,
                HOJE)).isInstanceOf(PaginacaoInvalidaException.class);
    }

    private static void assertCampo(Runnable acao, String campo, String mensagem) {
        assertThatThrownBy(acao::run)
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(mensagem)
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains(campo));
    }
}
