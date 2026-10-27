package com.geitus.app.catalog.balanca.dto;

import java.math.BigDecimal;
import java.util.UUID;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.balanca.LeituraEtiqueta;
import com.geitus.app.catalog.balanca.TipoInformacaoEtiqueta;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Resultado do teste de etiqueta (spec de Produtos): a leitura ({@code null} se o
 * numero nao for uma etiqueta no formato), o produto da empresa com o codigo
 * lido ({@code null} se nao houver) e a mensagem pronta para a tela.
 */
@Schema(description = "Resultado do teste de etiqueta")
public record TesteEtiquetaResponse(
        @Schema(description = "Leitura da etiqueta; null se o numero nao estiver no formato")
        Leitura leitura,
        @Schema(description = "Produto da empresa com o codigo lido; null se nao houver")
        ProdutoDaEtiqueta produto,
        @Schema(example = "Produto 542 · Açúcar a granel · R$ 10,00")
        String mensagem) {

    /** O que a etiqueta traz. */
    public record Leitura(int codigoProduto, TipoInformacaoEtiqueta tipo, BigDecimal valor) {

        public static Leitura de(LeituraEtiqueta leitura) {
            return new Leitura(leitura.codigoProduto(), leitura.tipo(), leitura.valor());
        }
    }

    /** Produto encontrado pelo codigo lido. {@code unidade} e a sigla da unidade de venda. */
    public record ProdutoDaEtiqueta(
            @Schema(description = "Identificador publico (UUID)")
            UUID id,
            Long numero,
            String nome,
            @Schema(example = "KG")
            String unidade) {

        public static ProdutoDaEtiqueta de(Produto produto) {
            return new ProdutoDaEtiqueta(produto.getUuid(), produto.getNumero(), produto.getNome(),
                    produto.getUnidade().getSigla());
        }
    }
}
