package com.geitus.app.catalog;

/**
 * Lancada quando uma operacao sobre produto conflita com o estado atual da
 * empresa — no momento, SKU ou codigo de barras ja utilizado por outro produto
 * da mesma empresa (constraints {@code uq_produto_empresa_sku} e
 * {@code uq_produto_empresa_codigo_barras}).
 *
 * <p>Mapeada para HTTP 409 (Conflict) pelo {@code GlobalExceptionHandler},
 * seguindo o mesmo padrao de {@code ConflitoDeEmpresaException} e
 * {@code ConflitoDeUsuarioException}. Difere de {@link RegraDeNegocioException}
 * (400), reservada a dados invalidos (nome, preco, custo, estoque). A mensagem
 * e clara e segura para o cliente (nao vaza detalhe interno).
 */
public class ProdutoConflitoException extends RuntimeException {

    public ProdutoConflitoException(String mensagem) {
        super(mensagem);
    }
}
