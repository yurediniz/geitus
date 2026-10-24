package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;

import com.geitus.app.catalog.balanca.LeituraEtiqueta;

/**
 * O que o texto lido no campo "Codigo ou nome" significa
 * ({@link InterpretadorDeCodigo}; docs/modules/pdv.md, 3.1 e 5.2).
 */
public sealed interface CodigoInterpretado {

    /** Etiqueta de balanca reconhecida com a configuracao da empresa: sempre uma linha nova. */
    record Etiqueta(String codigoLido, LeituraEtiqueta leitura) implements CodigoInterpretado {
    }

    /**
     * {@code codigo*quantidade} ou so o codigo (quantidade 1). O codigo e o
     * texto como veio (com zeros a esquerda): pode ser o codigo do produto ou
     * um codigo de barras do produto ou de uma embalagem.
     */
    record CodigoComQuantidade(String codigo, BigDecimal quantidade, String codigoLido)
            implements CodigoInterpretado {
    }

    /** Texto que nao e codigo: vai para a busca por nome. */
    record Busca(String texto) implements CodigoInterpretado {
    }
}
