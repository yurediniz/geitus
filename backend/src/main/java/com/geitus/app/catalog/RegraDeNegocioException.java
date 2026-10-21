package com.geitus.app.catalog;

import java.util.Optional;

/**
 * Lancada quando uma operacao viola uma regra de negocio do modulo Produtos
 * relativa a dados invalidos (por exemplo: nome vazio, preco/custo/estoque
 * negativo, empresa inexistente).
 *
 * <p>Excecao de validacao simples, generica o suficiente para cobrir as regras
 * de dados invalidos sem criar uma excecao por regra. Mapeada para HTTP 400
 * (Bad Request) pelo {@code GlobalExceptionHandler}. Conflitos de unicidade
 * (SKU/codigo de barras duplicado) usam {@link ProdutoConflitoException} (409).
 *
 * <p>Quando a regra e de um campo do formulario (ex.: {@code codigosBarras}),
 * o {@link #campo()} e informado e a resposta traz tambem
 * {@code campos: [{campo, mensagem}]}.
 */
public class RegraDeNegocioException extends RuntimeException {

    private final String campo;

    public RegraDeNegocioException(String mensagem) {
        this(mensagem, null);
    }

    public RegraDeNegocioException(String mensagem, String campo) {
        super(mensagem);
        this.campo = campo;
    }

    /** Campo do request invalido, quando a regra e de um campo especifico. */
    public Optional<String> campo() {
        return Optional.ofNullable(campo);
    }
}
