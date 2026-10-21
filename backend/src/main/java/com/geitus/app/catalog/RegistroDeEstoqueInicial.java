package com.geitus.app.catalog;

import java.math.BigDecimal;

/**
 * Escritas do catalogo no estoque (docs/modules/produtos-estoque.md, 4.4 e
 * 4.7). Declarada aqui e implementada no pacote {@code inventory}. Os dois
 * metodos rodam na transacao de quem chama (o {@code ProdutoService}).
 */
public interface RegistroDeEstoqueInicial {

    /**
     * Registra o estoque inicial do produto recem-gravado como a primeira
     * entrada (motivo {@code ESTOQUE_INICIAL}, origem {@code CADASTRO}). A
     * quantidade chega validada (maior que zero, ate 3 casas, fracao conforme a
     * unidade) e o usuario e o autenticado.
     */
    void registrar(Produto produto, BigDecimal quantidade, Long usuarioId);

    /**
     * Apaga o movimento do estoque inicial e a linha de saldo do produto, antes
     * da exclusao fisica dele. So pode ser chamado quando
     * {@link ResumoDeEstoque#permiteExcluir()}: e a unica situacao em que um
     * movimento e apagado.
     */
    void removerParaExclusao(Long empresaId, Long produtoId);
}
