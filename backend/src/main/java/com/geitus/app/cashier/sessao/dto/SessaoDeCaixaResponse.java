package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.cashier.sessao.StatusDaSessao;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Sessao de caixa na API, resposta de todas as rotas de sessao
 * (docs/modules/caixa.md). Horarios em ISO-8601 no fuso
 * {@code America/Sao_Paulo}.
 *
 * <ul>
 *   <li>{@code dinheiroNaGaveta}: o esperado atual em dinheiro; {@code null}
 *       para o OPERADOR no modo cego enquanto a sessao esta {@code ABERTA}
 *       (spec do Caixa);</li>
 *   <li>{@code valorEsperado}, {@code valorContado} e {@code diferenca}: os do
 *       dinheiro (as outras formas estao em {@code porForma});</li>
 *   <li>{@code formasDaContagem}: o que a contagem pede (DINHEIRO e as formas
 *       com movimento, na ordem); {@code porForma}: os valores de cada uma
 *       (docs/modules/pdv.md);</li>
 *   <li>{@code fechamentoCego}: com a sessao {@code ABERTA}, o modo atual da
 *       empresa; depois da contagem, o modo gravado;</li>
 *   <li>{@code movimentos}: do mais recente para o mais antigo; ausente nos
 *       itens do historico;</li>
 *   <li>{@code podeOperar}: se quem consulta pode lancar, contar ou fechar
 *       (sessao nao fechada, e dono ou ADMIN).</li>
 * </ul>
 */
@Schema(description = "Sessao de caixa")
public record SessaoDeCaixaResponse(
        UUID id,
        PontoDaSessao ponto,
        StatusDaSessao status,
        String abertaPorNome,
        OffsetDateTime abertaEm,
        BigDecimal fundoTroco,
        @Schema(description = "Esperado na gaveta; null para o OPERADOR no modo cego com a sessao ABERTA")
        BigDecimal dinheiroNaGaveta,
        boolean fechamentoCego,
        BigDecimal valorEsperado,
        BigDecimal valorContado,
        @Schema(description = "Contado - esperado: positiva e sobra, negativa e falta") BigDecimal diferenca,
        String contadaPorNome,
        OffsetDateTime contadaEm,
        String justificativa,
        String fechadaPorNome,
        OffsetDateTime fechadaEm,
        @Schema(description = "Formas que a contagem pede: DINHEIRO e as que tiveram movimento")
        List<FormaDePagamento> formasDaContagem,
        @Schema(description = "Esperado, contado e diferenca de cada forma da contagem")
        List<ValoresPorForma> porForma,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(description = "Movimentos, do mais recente; ausente no historico")
        List<MovimentoDeCaixaResponse> movimentos,
        boolean podeOperar) {

    /** Ponto da sessao: UUID publico e nome. */
    public record PontoDaSessao(UUID id, String nome) {
    }
}
