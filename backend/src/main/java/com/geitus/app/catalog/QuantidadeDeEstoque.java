package com.geitus.app.catalog;

import java.math.BigDecimal;

import com.geitus.app.catalog.unidade.UnidadeMedida;

/**
 * Regras de uma quantidade de estoque informada pelo usuario
 * (docs/modules/produtos-estoque.md, 4.2 e 4.4), comuns ao estoque inicial do
 * cadastro e ao ajuste manual: nao negativa, maior que zero quando o zero nao
 * vale, ate 3 casas ({@code NUMERIC(12,3)}, V9) e fracao so em unidade
 * fracionada. O erro aponta o campo do request ({@code campos}).
 */
public final class QuantidadeDeEstoque {

    /** Casas decimais das quantidades de estoque. */
    public static final int CASAS_DECIMAIS = 3;

    static final String MENSAGEM_NEGATIVA = "A quantidade não pode ser negativa.";
    static final String MENSAGEM_NAO_POSITIVA = "Informe uma quantidade maior que zero.";
    static final String MENSAGEM_CASAS_DECIMAIS = "A quantidade deve ter no máximo 3 casas decimais.";

    private QuantidadeDeEstoque() {
        // Apenas metodos estaticos.
    }

    /** Quantidade maior que zero (entrada, saida e estoque inicial). */
    public static void validarPositiva(BigDecimal quantidade, UnidadeMedida unidade, String campo) {
        validar(quantidade, false, unidade, campo);
    }

    /** Quantidade maior ou igual a zero (saldo contado do ajuste, que pode zerar o estoque). */
    public static void validarNaoNegativa(BigDecimal quantidade, UnidadeMedida unidade, String campo) {
        validar(quantidade, true, unidade, campo);
    }

    private static void validar(BigDecimal quantidade, boolean zeroValido, UnidadeMedida unidade, String campo) {
        if (quantidade.signum() < 0) {
            throw new RegraDeNegocioException(MENSAGEM_NEGATIVA, campo);
        }
        if (quantidade.signum() == 0 && !zeroValido) {
            throw new RegraDeNegocioException(MENSAGEM_NAO_POSITIVA, campo);
        }
        if (quantidade.stripTrailingZeros().scale() > CASAS_DECIMAIS) {
            throw new RegraDeNegocioException(MENSAGEM_CASAS_DECIMAIS, campo);
        }
        if (quantidade.signum() > 0 && !UnidadeMedida.quantidadeValida(unidade.isFracionada(), quantidade)) {
            throw new RegraDeNegocioException(UnidadeMedida.mensagemSemFracao(unidade.getSigla()), campo);
        }
    }
}
