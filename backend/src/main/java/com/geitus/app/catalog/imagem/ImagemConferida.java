package com.geitus.app.catalog.imagem;

/**
 * Imagem que passou pelas conferencias do servidor (docs/modules/produtos.md):
 * o tipo real, comum as duas versoes, e cada versao com os bytes e as
 * dimensoes lidas do cabecalho. So ela entra na {@link ImagemDoProduto}.
 */
public record ImagemConferida(TipoDeImagem tipo, Versao grande, Versao miniatura) {

    /** Uma das versoes (grande ou miniatura), como veio do navegador. */
    public record Versao(byte[] bytes, int largura, int altura) {
    }
}
