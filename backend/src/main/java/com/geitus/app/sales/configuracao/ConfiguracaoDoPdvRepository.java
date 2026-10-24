package com.geitus.app.sales.configuracao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Configuracao do PDV por empresa (a chave e o {@code empresa_id}, sempre do
 * usuario autenticado). So o que o modulo usa (DT-024).
 */
interface ConfiguracaoDoPdvRepository extends Repository<ConfiguracaoDoPdv, Long> {

    Optional<ConfiguracaoDoPdv> findById(Long empresaId);

    /** Cria ou atualiza a linha da empresa num comando so: duas primeiras alteracoes simultaneas nao colidem. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            INSERT INTO configuracoes_pdv (empresa_id, vender_sem_estoque, desconto_maximo_operador, atualizado_por,
                                           atualizado_em)
            VALUES (:empresaId, :venderSemEstoque, :descontoMaximoOperador, :atualizadoPor, :atualizadoEm)
            ON CONFLICT (empresa_id) DO UPDATE
                SET vender_sem_estoque = EXCLUDED.vender_sem_estoque,
                    desconto_maximo_operador = EXCLUDED.desconto_maximo_operador,
                    atualizado_por = EXCLUDED.atualizado_por,
                    atualizado_em = EXCLUDED.atualizado_em
            """, nativeQuery = true)
    void gravar(@Param("empresaId") Long empresaId, @Param("venderSemEstoque") boolean venderSemEstoque,
            @Param("descontoMaximoOperador") BigDecimal descontoMaximoOperador,
            @Param("atualizadoPor") Long atualizadoPor, @Param("atualizadoEm") OffsetDateTime atualizadoEm);
}
