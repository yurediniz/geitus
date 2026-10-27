package com.geitus.app.cashier.ponto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Sessao aberta ou em conferencia num ponto: situacao, sessao, quem abriu e
 * quando. Nunca traz valores de dinheiro, entao serve a qualquer perfil no
 * modo cego (docs/modules/caixa.md).
 */
public record SituacaoDoPonto(String status, UUID sessaoId, String abertaPorNome, OffsetDateTime abertaEm) {
}
