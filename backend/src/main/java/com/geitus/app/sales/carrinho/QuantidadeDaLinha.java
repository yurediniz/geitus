package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Regras da quantidade de uma linha (docs/modules/pdv.md): maior que
 * zero, ate 99.999, ate 3 casas e decimal so em unidade fracionada (a
 * embalagem e sempre inteira). Devolve a mensagem da recusa, se houver.
 */
public final class QuantidadeDaLinha {

    public static final BigDecimal MAXIMA = new BigDecimal("99999");
    public static final int CASAS = 3;

    static final String MENSAGEM_NAO_POSITIVA = "A quantidade deve ser maior que zero.";
    static final String MENSAGEM_ACIMA_DO_PERMITIDO = "Quantidade acima do permitido.";
    static final String MENSAGEM_CASAS = "Informe a quantidade com até 3 casas decimais.";
    static final String MENSAGEM_SEM_FRACAO = "%s não aceita quantidade fracionada. Informe um número inteiro.";

    private QuantidadeDaLinha() {
        // Apenas metodos estaticos.
    }

    /** Positiva, ate o maximo e com ate 3 casas, sem olhar a unidade. */
    public static Optional<String> recusaGeral(BigDecimal quantidade) {
        if (quantidade == null || quantidade.signum() <= 0) {
            return Optional.of(MENSAGEM_NAO_POSITIVA);
        }
        if (quantidade.compareTo(MAXIMA) > 0) {
            return Optional.of(MENSAGEM_ACIMA_DO_PERMITIDO);
        }
        if (quantidade.stripTrailingZeros().scale() > CASAS) {
            return Optional.of(MENSAGEM_CASAS);
        }
        return Optional.empty();
    }

    /** A recusa geral e, sem fracao permitida, a da quantidade decimal com a sigla da linha. */
    public static Optional<String> recusa(BigDecimal quantidade, boolean aceitaFracao, String sigla) {
        Optional<String> geral = recusaGeral(quantidade);
        if (geral.isPresent()) {
            return geral;
        }
        if (!aceitaFracao && quantidade.stripTrailingZeros().scale() > 0) {
            return Optional.of(MENSAGEM_SEM_FRACAO.formatted(sigla));
        }
        return Optional.empty();
    }
}
