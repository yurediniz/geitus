package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Resultado da validacao da lista de embalagens de um salvamento
 * ({@link EmbalagensDoProduto#planejar}): o que fica (na ordem enviada, com os
 * dados e os codigos ja validados) e o que sai. Nada foi aplicado ao produto
 * ainda; a aplicacao e em duas fases ({@link EmbalagensDoProduto#aplicarRemocoes}
 * e {@link EmbalagensDoProduto#aplicarInclusoes}).
 *
 * @param alteraEmbalagens se o salvamento muda alguma embalagem (removida,
 *        nova, ou mantida com outra unidade, quantidade, preco, "de compra",
 *        ordem ou codigos); calculado antes da aplicacao, decide se o
 *        {@code atualizadoEm} do produto e carimbado
 */
public record PlanoDeEmbalagens(List<EmbalagemPlanejada> embalagens, List<EmbalagemRemovida> removidas,
        boolean alteraEmbalagens) {

    static final PlanoDeEmbalagens VAZIO = new PlanoDeEmbalagens(List.of(), List.of(), false);

    /**
     * Uma embalagem da lista final.
     *
     * @param existente a embalagem que continua (reconciliada pelo {@code id}), ou {@code null} se for nova
     * @param rotulo o rotulo depois do salvamento (com a unidade de venda nova)
     * @param precoAnterior o preco proprio antes do salvamento ({@code null} na nova)
     */
    public record EmbalagemPlanejada(ProdutoEmbalagem existente, DadosEmbalagem dados,
            List<CodigoBarrasValidado> codigos, String rotulo, BigDecimal precoAnterior) {
    }

    /** Embalagem que sai da lista, com o rotulo e o preco do momento (para o historico). */
    public record EmbalagemRemovida(ProdutoEmbalagem embalagem, String rotulo, BigDecimal preco) {
    }

    /** Uma mudanca candidata do preco proprio; o historico so grava se o valor mudou. */
    public record AlteracaoDePreco(String rotulo, BigDecimal anterior, BigDecimal novo) {
    }

    /**
     * Precos proprios antes e depois (spec 3.4): embalagem criada (vazio →
     * preco), preco alterado ou apagado, e embalagem com preco removida
     * (preco → vazio). Mudar so a unidade ou a quantidade nao muda o preco.
     */
    public List<AlteracaoDePreco> alteracoesDePreco() {
        List<AlteracaoDePreco> alteracoes = new ArrayList<>();
        for (EmbalagemPlanejada planejada : embalagens) {
            alteracoes.add(new AlteracaoDePreco(planejada.rotulo(), planejada.precoAnterior(),
                    planejada.dados().preco()));
        }
        for (EmbalagemRemovida removida : removidas) {
            alteracoes.add(new AlteracaoDePreco(removida.rotulo(), removida.preco(), null));
        }
        return alteracoes;
    }
}
