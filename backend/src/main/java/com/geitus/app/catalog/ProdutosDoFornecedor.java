package com.geitus.app.catalog;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoDoFornecedorResponse;

/**
 * Os produtos que um fornecedor vende, vistos pelo fornecedor
 * (docs/modules/fornecedores-e-marcas.md, 4.4): a ligacao
 * {@code produto_fornecedores} pertence ao catalogo, que a expoe ao pacote
 * {@code supplier} por esta interface. O fornecedor chega pelo id interno, ja
 * resolvido na empresa do usuario (DEC-016); o produto, pelo UUID publico, e e
 * procurado so nessa empresa.
 */
public interface ProdutosDoFornecedor {

    /** Produtos ligados ao fornecedor. */
    long contar(Long empresaId, Long fornecedorId);

    /** Produtos ligados a cada fornecedor, numa consulta so; fornecedor sem produto fica de fora. */
    Map<Long, Long> contarPorFornecedor(Long empresaId, Collection<Long> fornecedorIds);

    /** Pagina dos produtos ligados, por nome. */
    PaginaResponse<ProdutoDoFornecedorResponse> pagina(Long empresaId, Long fornecedorId, int pagina, int tamanho);

    /** Liga o produto ao fornecedor, idempotente; produto de outra empresa ou inexistente, 404. */
    LigacaoDoProduto ligar(Long empresaId, Long fornecedorId, UUID produtoId);

    /** Tira o produto do fornecedor, limpando antes o da ultima compra se for ele; fora da lista, 404. */
    void desligar(Long empresaId, Long fornecedorId, UUID produtoId);
}
