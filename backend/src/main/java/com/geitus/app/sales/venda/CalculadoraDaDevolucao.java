package com.geitus.app.sales.venda;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.shared.formato.FormatoBrasileiro;

/**
 * As contas de uma linha da devolucao (docs/modules/estoque.md, secao 6.2,
 * regras 2 e 3), sem Spring e sem banco:
 *
 * <ul>
 *   <li>a quantidade, na unidade da linha, e &gt; 0 e vai ate o vendido menos
 *       o ja devolvido; inteira na unidade que nao e fracionada e na linha de
 *       embalagem (numero de embalagens); ate 3 casas na fracionada; a linha
 *       de etiqueta de balanca so volta inteira;</li>
 *   <li>o valor e a parte proporcional do liquido, a centavos e meio para
 *       cima, sem passar do que resta; a devolucao que zera a linha leva o
 *       resto (a soma das devolucoes da linha e sempre o liquido);</li>
 *   <li>o que volta ao estoque e a quantidade vezes a embalagem.</li>
 * </ul>
 */
final class CalculadoraDaDevolucao {

    static final String MENSAGEM_INFORME_A_QUANTIDADE = "Informe a quantidade a devolver.";
    static final String MENSAGEM_LINHA_JA_DEVOLVIDA = "Esta linha já foi devolvida.";
    static final String MENSAGEM_SO_RESTAM = "Só restam %s para devolver nesta linha.";
    static final String MENSAGEM_EMBALAGENS_INTEIRAS = "Devolva um número inteiro de embalagens.";
    static final String MENSAGEM_UNIDADE_INTEIRA = "Esta unidade não é fracionada: devolva uma quantidade inteira.";
    static final String MENSAGEM_TRES_CASAS = "Use no máximo 3 casas decimais.";
    static final String MENSAGEM_ETIQUETA_INTEIRA = "Item de balança só volta inteiro (%s).";

    private static final int CASAS_DA_QUANTIDADE = 3;
    private static final int CASAS_DO_DINHEIRO = 2;

    private CalculadoraDaDevolucao() {
        // Apenas metodos estaticos.
    }

    /**
     * Uma linha da venda com o que ja foi devolvido dela.
     *
     * @param unidade            o que a quantidade conta: o rotulo da embalagem ou a sigla
     * @param embalagemQuantidade unidades de venda por embalagem; {@code null} sem embalagem
     * @param fracionada         se a unidade de venda do produto aceita fracao
     */
    record LinhaVendida(String unidade, BigDecimal embalagemQuantidade, boolean etiqueta, boolean fracionada,
            BigDecimal quantidade, BigDecimal valorLiquido, BigDecimal devolvida, BigDecimal valorDevolvido) {

        BigDecimal disponivel() {
            return quantidade.subtract(devolvida);
        }

        BigDecimal valorDisponivel() {
            return valorLiquido.subtract(valorDevolvido);
        }
    }

    /** O que a linha devolve: a quantidade (na unidade da linha), o que volta ao estoque e o valor. */
    record LinhaDevolvida(BigDecimal quantidade, BigDecimal quantidadeEstoque, BigDecimal valor) {
    }

    /**
     * Confere a quantidade pedida e calcula a linha.
     *
     * @param campo o campo do erro ({@code itens[0].quantidade})
     * @throws DadosDaVendaInvalidosException 400 com o campo
     */
    static LinhaDevolvida calcular(LinhaVendida linha, BigDecimal pedida, String campo) {
        if (pedida == null || pedida.signum() <= 0) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_INFORME_A_QUANTIDADE, campo);
        }
        BigDecimal disponivel = linha.disponivel();
        if (disponivel.signum() <= 0) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_LINHA_JA_DEVOLVIDA, campo);
        }
        if (linha.etiqueta() && pedida.compareTo(linha.quantidade()) != 0) {
            throw new DadosDaVendaInvalidosException(
                    MENSAGEM_ETIQUETA_INTEIRA.formatted(comUnidade(linha.quantidade(), linha.unidade())), campo);
        }
        if (linha.embalagemQuantidade() != null && !inteira(pedida)) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_EMBALAGENS_INTEIRAS, campo);
        }
        if (linha.embalagemQuantidade() == null && !linha.fracionada() && !linha.etiqueta() && !inteira(pedida)) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_UNIDADE_INTEIRA, campo);
        }
        if (pedida.stripTrailingZeros().scale() > CASAS_DA_QUANTIDADE) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_TRES_CASAS, campo);
        }
        if (pedida.compareTo(disponivel) > 0) {
            throw new DadosDaVendaInvalidosException(
                    MENSAGEM_SO_RESTAM.formatted(comUnidade(disponivel, linha.unidade())), campo);
        }
        BigDecimal quantidade = pedida.setScale(CASAS_DA_QUANTIDADE, RoundingMode.UNNECESSARY);
        BigDecimal porEmbalagem = linha.embalagemQuantidade() == null ? BigDecimal.ONE : linha.embalagemQuantidade();
        BigDecimal quantidadeEstoque = quantidade.multiply(porEmbalagem)
                .setScale(CASAS_DA_QUANTIDADE, RoundingMode.HALF_UP);
        return new LinhaDevolvida(quantidade, quantidadeEstoque, valor(linha, quantidade));
    }

    /** Proporcional ao liquido, sem passar do que resta; a ultima devolucao da linha leva o resto. */
    static BigDecimal valor(LinhaVendida linha, BigDecimal quantidade) {
        BigDecimal resta = linha.valorDisponivel().setScale(CASAS_DO_DINHEIRO, RoundingMode.HALF_UP);
        if (quantidade.compareTo(linha.disponivel()) == 0) {
            return resta;
        }
        BigDecimal proporcional = linha.valorLiquido().multiply(quantidade)
                .divide(linha.quantidade(), CASAS_DO_DINHEIRO, RoundingMode.HALF_UP);
        return proporcional.min(resta);
    }

    private static boolean inteira(BigDecimal valor) {
        return valor.stripTrailingZeros().scale() <= 0;
    }

    /** "2 UN", "1,25 KG", "3 CX c/ 12 UN". */
    static String comUnidade(BigDecimal quantidade, String unidade) {
        return FormatoBrasileiro.numero(quantidade) + " " + unidade;
    }
}
