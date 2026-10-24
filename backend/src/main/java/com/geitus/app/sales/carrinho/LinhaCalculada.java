package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoEmbalagem;

/**
 * Linha com o preco, a origem, os valores e as quantidades calculados
 * (docs/modules/pdv.md, 3.2 e 3.3). Valores em reais com 2 casas; quantidades
 * com 3. {@code valorLiquido = valorBruto - descontoItem - descontoRateado}.
 *
 * @param quantidade na unidade da linha (3 CX, 1,250 KG)
 * @param quantidadeEstoque o que a linha baixa, na unidade de venda do produto
 */
public record LinhaCalculada(int ordem, Produto produto, ProdutoEmbalagem embalagem, boolean etiqueta,
        String codigoLido, BigDecimal quantidade, BigDecimal quantidadeEstoque, BigDecimal precoUnitario,
        OrigemPrecoDaVenda origem, BigDecimal valorBruto, BigDecimal descontoItem, BigDecimal descontoRateado,
        BigDecimal valorLiquido) {

    /** Sigla da linha: a da embalagem ou a da unidade de venda. */
    public String sigla() {
        return embalagem == null ? produto.getUnidade().getSigla() : embalagem.getUnidade().getSigla();
    }

    String campo() {
        return "itens[" + (ordem - 1) + "]";
    }
}
