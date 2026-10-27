package com.geitus.app.catalog;

/**
 * Quantos digitos de codigo do produto cabem na etiqueta de balanca da empresa
 * (docs/modules/produtos.md). O cadastro do produto
 * usa para recusar um produto "Vendido na balanca" com codigo grande demais.
 *
 * <p>Declarada aqui para o {@code ProdutoService} nao depender de quem guarda a
 * configuracao da etiqueta (mesmo desenho de {@link UsoDoProdutoNoEstoque}).
 */
public interface TamanhoDoCodigoNaEtiqueta {

    /** Digitos do codigo na etiqueta configurada da empresa (ou no padrao, sem configuracao). */
    int digitosCodigo(Long empresaId);
}
