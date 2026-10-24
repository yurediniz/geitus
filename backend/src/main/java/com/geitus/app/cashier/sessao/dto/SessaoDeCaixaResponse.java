package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.geitus.app.cashier.sessao.StatusDaSessao;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Sessao de caixa na API, resposta de todas as rotas de sessao
 * (docs/modules/caixa.md, 5.3). Horarios em ISO-8601 no fuso
 * {@code America/Sao_Paulo}.
 *
 * <ul>
 *   <li>{@code dinheiroNaGaveta}: o esperado atual; {@code null} para o
 *       OPERADOR no modo cego enquanto a sessao esta {@code ABERTA} (3.6);</li>
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
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(description = "Movimentos, do mais recente; ausente no historico")
        List<MovimentoDeCaixaResponse> movimentos,
        boolean podeOperar) {

    /** Ponto da sessao: UUID publico e nome. */
    public record PontoDaSessao(UUID id, String nome) {
    }
}
