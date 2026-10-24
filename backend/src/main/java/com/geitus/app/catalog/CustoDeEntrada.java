package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aplica no produto o custo de uma entrada por compra (Fase B4,
 * docs/modules/produtos-custo-entrada.md, 2.2; DEC-038). Fica no catalogo e e
 * chamado pelo estoque depois de gravar o movimento, na mesma transacao: o
 * catalogo nao depende do estoque, e uma falha desfaz o movimento, o saldo e o
 * custo juntos.
 */
@Component
public class CustoDeEntrada {

    /** O custo do produto tem centavos ({@code NUMERIC(12,2)}). */
    static final int CASAS_DO_CUSTO_DO_PRODUTO = 2;

    private final HistoricoDePrecos historicoDePrecos;
    private final Clock relogio;

    public CustoDeEntrada(HistoricoDePrecos historicoDePrecos, Clock relogio) {
        this.historicoDePrecos = historicoDePrecos;
        this.relogio = relogio;
    }

    /**
     * O custo do produto passa a ser {@code custoUnitario} arredondado a
     * centavos (meio para cima), com a origem {@code ENTRADA_COMPRA} e a data
     * de agora, mesmo sem mudar o valor; o historico ganha a linha do custo
     * ligada ao movimento so se o valor mudou. Exige o produto travado e o
     * movimento ja gravado por quem chama.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void registrar(Produto produto, BigDecimal custoUnitario, Long movimentoId, Long usuarioId) {
        BigDecimal custoAnterior = produto.getCusto();
        produto.registrarCustoDeEntrada(custoUnitario.setScale(CASAS_DO_CUSTO_DO_PRODUTO, RoundingMode.HALF_UP),
                agora());
        historicoDePrecos.registrarCustoDeEntradaSeMudou(produto, usuarioId, custoAnterior, movimentoId);
    }

    /** Na precisao do TIMESTAMP do PostgreSQL: a resposta e a releitura trazem o mesmo instante. */
    private LocalDateTime agora() {
        return LocalDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
    }
}
