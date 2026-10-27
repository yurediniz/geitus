package com.geitus.app.catalog;

import java.math.BigDecimal;

/**
 * Dono de um codigo de barras na empresa: o produto e, se o codigo for de uma
 * embalagem, a embalagem (docs/modules/produtos.md).
 * Montado direto pela consulta do {@link ProdutoRepository}; serve a mensagem
 * do 409 de codigo em uso, sempre com dados da mesma empresa (DEC-016).
 *
 * @param siglaDaEmbalagem {@code null} quando o codigo e da unidade de venda
 */
public record CodigoDeBarrasEmUso(String codigo, String nomeDoProduto, String siglaDaEmbalagem,
        BigDecimal quantidadeDaEmbalagem, String siglaDeVenda) {

    static final String MENSAGEM_NO_PRODUTO = "O código de barras %s já está cadastrado no produto \"%s\".";
    static final String MENSAGEM_NA_EMBALAGEM = "Este código já está em uso na embalagem %s do produto %s.";

    /**
     * Mensagem do conflito: a da embalagem ("Este codigo ja esta em uso na
     * embalagem CX c/ 3 UN do produto Nexgard.") ou a da unidade, a mesma de
     * antes da Fase B3.
     */
    public String mensagem() {
        if (siglaDaEmbalagem == null) {
            return mensagemNoProduto(codigo, nomeDoProduto);
        }
        return MENSAGEM_NA_EMBALAGEM.formatted(
                RotuloDaEmbalagem.de(siglaDaEmbalagem, quantidadeDaEmbalagem, siglaDeVenda), nomeDoProduto);
    }

    static String mensagemNoProduto(String codigo, String nomeDoProduto) {
        return MENSAGEM_NO_PRODUTO.formatted(codigo, nomeDoProduto);
    }
}
