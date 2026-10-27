package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.regex.Pattern;

import com.geitus.app.catalog.balanca.ConfiguracaoEtiqueta;
import com.geitus.app.catalog.balanca.LeitorEtiquetaBalanca;
import com.geitus.app.catalog.balanca.LeituraEtiqueta;
import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.carrinho.CodigoInterpretado.Busca;
import com.geitus.app.sales.carrinho.CodigoInterpretado.CodigoComQuantidade;
import com.geitus.app.sales.carrinho.CodigoInterpretado.Etiqueta;

/**
 * Interpreta o texto lido no campo "Codigo ou nome" (docs/modules/pdv.md),
 * nesta ordem:
 * <ol>
 *   <li>etiqueta de balanca: 13 digitos que o {@link LeitorEtiquetaBalanca}
 *       reconhece com a configuracao da empresa;</li>
 *   <li>{@code codigo*quantidade} (quantidade com virgula ou ponto) ou so o
 *       codigo, com quantidade 1: um texto sem espacos;</li>
 *   <li>qualquer outro texto: busca por nome.</li>
 * </ol>
 * Regra pura, sem banco. A quantidade invalida e um 400 no campo {@code codigo}.
 */
public final class InterpretadorDeCodigo {

    public static final String CAMPO = "codigo";
    static final String MENSAGEM_FORMATO = "Use código*quantidade, por exemplo 542*3.";

    private static final String SEPARADOR_DA_QUANTIDADE = "*";
    private static final Pattern SEM_ESPACOS = Pattern.compile("\\S+");
    private static final Pattern QUANTIDADE = Pattern.compile("[+-]?[0-9]+([.,][0-9]+)?");

    private InterpretadorDeCodigo() {
        // Apenas metodos estaticos.
    }

    public static CodigoInterpretado interpretar(String texto, ConfiguracaoEtiqueta configuracao) {
        String lido = texto == null ? "" : texto.strip();
        Optional<LeituraEtiqueta> etiqueta = LeitorEtiquetaBalanca.ler(lido, configuracao);
        if (etiqueta.isPresent()) {
            return new Etiqueta(lido, etiqueta.get());
        }
        if (!SEM_ESPACOS.matcher(lido).matches()) {
            return new Busca(lido);
        }
        int separador = lido.indexOf(SEPARADOR_DA_QUANTIDADE);
        if (separador < 0) {
            return new CodigoComQuantidade(lido, BigDecimal.ONE, lido);
        }
        return comQuantidade(lido, separador);
    }

    private static CodigoInterpretado comQuantidade(String lido, int separador) {
        String codigo = lido.substring(0, separador);
        String quantidade = lido.substring(separador + 1);
        if (codigo.isEmpty() || !QUANTIDADE.matcher(quantidade).matches()) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_FORMATO, CAMPO);
        }
        BigDecimal valor = new BigDecimal(quantidade.replace(',', '.'));
        QuantidadeDaLinha.recusaGeral(valor).ifPresent(mensagem -> {
            throw new DadosDaVendaInvalidosException(mensagem, CAMPO);
        });
        return new CodigoComQuantidade(codigo, valor, lido);
    }
}
