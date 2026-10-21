package com.geitus.app.catalog;

import java.util.Optional;

/**
 * Lancada quando uma operacao sobre produto conflita com o estado atual da
 * empresa: SKU ou codigo de barras ja utilizado por outro produto da mesma
 * empresa (constraints {@code uq_produto_empresa_sku} e
 * {@code uq_codigo_barras_empresa}) ou exclusao de produto que ja teve
 * movimentacao. A mensagem de codigo duplicado traz o nome do outro produto,
 * sempre da mesma empresa (DEC-016).
 *
 * <p>Mapeada para HTTP 409 (Conflict) pelo {@code GlobalExceptionHandler},
 * seguindo o mesmo padrao de {@code ConflitoDeEmpresaException} e
 * {@code ConflitoDeUsuarioException}. Difere de {@link RegraDeNegocioException}
 * (400), reservada a dados invalidos (nome, preco, custo, estoque). A mensagem
 * e clara e segura para o cliente (nao vaza detalhe interno).
 *
 * <p>Quando o conflito e de um campo do formulario ({@code sku},
 * {@code codigosBarras}), o {@link #campo()} e informado e a resposta traz
 * tambem {@code campos: [{campo, mensagem}]}, para o frontend marcar o campo.
 */
public class ProdutoConflitoException extends RuntimeException {

    private final String campo;

    public ProdutoConflitoException(String mensagem) {
        this(mensagem, null);
    }

    public ProdutoConflitoException(String mensagem, String campo) {
        super(mensagem);
        this.campo = campo;
    }

    /** Campo do request em conflito, quando o conflito e de um campo especifico. */
    public Optional<String> campo() {
        return Optional.ofNullable(campo);
    }
}
