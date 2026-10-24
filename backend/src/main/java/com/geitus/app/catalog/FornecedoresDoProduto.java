package com.geitus.app.catalog;

import java.util.Collection;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Regras da lista de fornecedores do produto (docs/modules/fornecedores-e-marcas.md,
 * 4.4 e 5), a mesma lista vista pelo produto e pelo fornecedor. Implementa a
 * visao do fornecedor ({@link ProdutosDoFornecedor}).
 */
@Component
public class FornecedoresDoProduto implements ProdutosDoFornecedor {

    private final ProdutoFornecedorRepository ligacaoRepository;

    public FornecedoresDoProduto(ProdutoFornecedorRepository ligacaoRepository) {
        this.ligacaoRepository = ligacaoRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public long contar(Long empresaId, Long fornecedorId) {
        return ligacaoRepository.contar(empresaId, fornecedorId);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Long> contarPorFornecedor(Long empresaId, Collection<Long> fornecedorIds) {
        if (fornecedorIds.isEmpty()) {
            return Map.of();
        }
        return ContagensPorId.de(ligacaoRepository.contarPorFornecedor(empresaId, fornecedorIds));
    }
}
