package com.geitus.app.cashier.configuracao;

import java.time.OffsetDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Configuracao do caixa por empresa (a chave e o {@code empresa_id}, sempre do
 * usuario autenticado). So o que o modulo usa (DT-024).
 */
public interface ConfiguracaoDoCaixaRepository extends Repository<ConfiguracaoDoCaixa, Long> {

    Optional<ConfiguracaoDoCaixa> findById(Long empresaId);

    /**
     * Cria ou atualiza a linha da empresa num comando so ({@code INSERT ... ON
     * CONFLICT DO UPDATE}): duas primeiras alteracoes simultaneas nao colidem
     * na chave primaria.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            INSERT INTO configuracoes_caixa (empresa_id, fechamento_cego, atualizado_por, atualizado_em)
            VALUES (:empresaId, :fechamentoCego, :atualizadoPor, :atualizadoEm)
            ON CONFLICT (empresa_id) DO UPDATE
                SET fechamento_cego = EXCLUDED.fechamento_cego,
                    atualizado_por = EXCLUDED.atualizado_por,
                    atualizado_em = EXCLUDED.atualizado_em
            """, nativeQuery = true)
    void gravar(@Param("empresaId") Long empresaId, @Param("fechamentoCego") boolean fechamentoCego,
            @Param("atualizadoPor") Long atualizadoPor, @Param("atualizadoEm") OffsetDateTime atualizadoEm);
}
