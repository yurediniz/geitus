package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Regra do preco aplicado na venda (docs/modules/produtos.md;
 * DEC-033), pronta para o PDV consumir.
 *
 * <p>Candidatos: o preco de venda, sempre; o promocional, se a promocao estiver
 * vigente na data; o de atacado, se a quantidade atingir o minimo. Vence o
 * menor; em empate entre promocional e atacado, a origem e
 * {@code PROMOCIONAL}. As comparacoes sao numericas ({@code compareTo}) e o
 * valor devolvido e o gravado, sem reescalar. O fracionamento da quantidade
 * nao e validado aqui (papel do PDV).
 */
public final class PrecoDeVenda {

    private PrecoDeVenda() {
    }

    public static PrecoAplicado resolver(Produto produto, BigDecimal quantidade, LocalDate data) {
        if (quantidade == null || quantidade.signum() <= 0) {
            throw new IllegalArgumentException("A quantidade deve ser maior que zero.");
        }
        PrecoAplicado aplicado = new PrecoAplicado(produto.getPrecoVenda(), OrigemPreco.NORMAL);
        if (promocaoVigente(produto, data)) {
            aplicado = menor(aplicado, new PrecoAplicado(produto.getPrecoPromocional(), OrigemPreco.PROMOCIONAL));
        }
        if (atacadoAtingido(produto, quantidade)) {
            aplicado = menor(aplicado, new PrecoAplicado(produto.getPrecoAtacado(), OrigemPreco.ATACADO));
        }
        return aplicado;
    }

    /**
     * Preco vigente da unidade sem o atacado: o promocional, se a promocao
     * estiver vigente na data; senao o de venda. Base do preco calculado das
     * embalagens (docs/modules/produtos.md).
     */
    public static PrecoAplicado vigenteSemAtacado(Produto produto, LocalDate data) {
        PrecoAplicado normal = new PrecoAplicado(produto.getPrecoVenda(), OrigemPreco.NORMAL);
        if (!promocaoVigente(produto, data)) {
            return normal;
        }
        return menor(normal, new PrecoAplicado(produto.getPrecoPromocional(), OrigemPreco.PROMOCIONAL));
    }

    private static boolean promocaoVigente(Produto produto, LocalDate data) {
        return produto.getPrecoPromocional() != null
                && SituacaoPromocao.de(produto.getPromocaoInicio(), produto.getPromocaoFim(), data)
                        == SituacaoPromocao.VIGENTE;
    }

    private static boolean atacadoAtingido(Produto produto, BigDecimal quantidade) {
        return produto.getPrecoAtacado() != null
                && quantidade.compareTo(produto.getQuantidadeMinimaAtacado()) >= 0;
    }

    /** O candidato so substitui o atual se for estritamente menor: o empate mantem o anterior. */
    private static PrecoAplicado menor(PrecoAplicado atual, PrecoAplicado candidato) {
        return candidato.precoUnitario().compareTo(atual.precoUnitario()) < 0 ? candidato : atual;
    }
}
