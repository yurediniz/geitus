package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoEmbalagem;
import com.geitus.app.catalog.balanca.LeituraEtiqueta;

/**
 * Uma linha do carrinho ja resolvida na empresa do usuario
 * ({@link MontagemDoCarrinho}): o produto ativo, a embalagem (ou {@code null}
 * na unidade), a leitura da etiqueta relida pelo servidor (ou {@code null}), o
 * texto lido, a quantidade enviada (ignorada na etiqueta) e o desconto do item.
 *
 * @param ordem posicao no carrinho, a partir de 1 (o campo dos erros e
 *        {@code itens[ordem - 1]})
 */
public record LinhaParaCalculo(int ordem, Produto produto, ProdutoEmbalagem embalagem, LeituraEtiqueta etiqueta,
        String codigoLido, BigDecimal quantidade, DescontoInformado desconto) {

    boolean daUnidade() {
        return embalagem == null && etiqueta == null;
    }

    String campo() {
        return "itens[" + (ordem - 1) + "]";
    }
}
