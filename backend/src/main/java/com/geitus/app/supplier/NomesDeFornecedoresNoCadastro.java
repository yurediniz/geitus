package com.geitus.app.supplier;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.FornecedorResumido;
import com.geitus.app.catalog.NomesDeFornecedores;

/**
 * Implementacao, no cadastro de fornecedores, da interface que o catalogo
 * declara ({@link NomesDeFornecedores}): uma consulta por chamada, sempre
 * filtrada pela empresa (DEC-016); nenhuma sem ids.
 */
@Component
public class NomesDeFornecedoresNoCadastro implements NomesDeFornecedores {

    private final FornecedorRepository fornecedorRepository;

    public NomesDeFornecedoresNoCadastro(FornecedorRepository fornecedorRepository) {
        this.fornecedorRepository = fornecedorRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, FornecedorResumido> porIds(Long empresaId, Collection<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return fornecedorRepository.resumosPorIds(empresaId, ids).stream()
                .collect(Collectors.toMap(FornecedorResumido::id, Function.identity()));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, FornecedorResumido> porUuids(Long empresaId, Collection<UUID> uuids) {
        if (uuids.isEmpty()) {
            return Map.of();
        }
        return fornecedorRepository.resumosPorUuids(empresaId, uuids).stream()
                .collect(Collectors.toMap(FornecedorResumido::uuid, Function.identity()));
    }
}
