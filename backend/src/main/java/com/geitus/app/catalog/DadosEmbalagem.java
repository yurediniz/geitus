package com.geitus.app.catalog;

import java.math.BigDecimal;

import com.geitus.app.catalog.unidade.UnidadeMedida;

/**
 * Dados editaveis de uma {@link ProdutoEmbalagem}, ja validados (unidade
 * resolvida dentro da empresa, quantidade &gt; 1 e com a fracao permitida,
 * preco &gt; 0 ou {@code null}).
 */
public record DadosEmbalagem(UnidadeMedida unidade, BigDecimal quantidade, BigDecimal preco, boolean deCompra,
        int ordem) {
}
