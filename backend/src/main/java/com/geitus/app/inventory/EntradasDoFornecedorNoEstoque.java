package com.geitus.app.inventory;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.supplier.EntradasDoFornecedor;

/**
 * Implementacao, no estoque, da interface que o fornecedor declara
 * ({@link EntradasDoFornecedor}): o pacote {@code supplier} nao depende deste.
 */
@Component
public class EntradasDoFornecedorNoEstoque implements EntradasDoFornecedor {

    private final MovimentoEstoqueRepository movimentoRepository;

    public EntradasDoFornecedorNoEstoque(MovimentoEstoqueRepository movimentoRepository) {
        this.movimentoRepository = movimentoRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public long contar(Long empresaId, Long fornecedorId) {
        return movimentoRepository.countByEmpresaIdAndFornecedorId(empresaId, fornecedorId);
    }
}
