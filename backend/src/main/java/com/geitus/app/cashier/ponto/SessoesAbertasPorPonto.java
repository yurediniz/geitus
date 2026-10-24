package com.geitus.app.cashier.ponto;

import java.math.BigDecimal;
import java.util.Map;

/**
 * O que o pacote de ponto precisa saber das sessoes, sem depender do pacote
 * de sessao: a situacao de cada ponto, o ultimo fundo de troco (a sugestao da
 * proxima abertura) e se ha caixa aberto no ponto. As chaves dos mapas sao os
 * ids internos dos pontos; ponto sem sessao nao aparece.
 */
public interface SessoesAbertasPorPonto {

    /** Sessoes {@code ABERTA} ou {@code EM_CONFERENCIA} da empresa, por ponto. */
    Map<Long, SituacaoDoPonto> situacoes(Long empresaId);

    /** Fundo de troco da abertura mais recente de cada ponto da empresa. */
    Map<Long, BigDecimal> ultimosFundos(Long empresaId);

    /** Se o ponto tem sessao {@code ABERTA} ou {@code EM_CONFERENCIA}. */
    boolean temSessaoAberta(Long empresaId, Long pontoId);
}
