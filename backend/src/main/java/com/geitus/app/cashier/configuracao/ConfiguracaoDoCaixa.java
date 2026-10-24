package com.geitus.app.cashier.configuracao;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Configuracao do caixa da empresa (tabela {@code configuracoes_caixa}, V16):
 * uma linha por empresa, criada na primeira alteracao. Sem linha vale o
 * padrao, fechamento cego ligado (docs/modules/caixa.md, 3.9). A gravacao e
 * feita pelo upsert do {@link ConfiguracaoDoCaixaRepository}; a entidade so e
 * lida.
 */
@Entity
@Table(name = "configuracoes_caixa")
public class ConfiguracaoDoCaixa {

    @Id
    @Column(name = "empresa_id")
    private Long empresaId;

    @Column(name = "fechamento_cego", nullable = false)
    private boolean fechamentoCego;

    @Column(name = "atualizado_por", nullable = false)
    private Long atualizadoPor;

    @Column(name = "atualizado_em", nullable = false)
    private OffsetDateTime atualizadoEm;

    protected ConfiguracaoDoCaixa() {
        // Construtor exigido pelo JPA.
    }

    public boolean isFechamentoCego() {
        return fechamentoCego;
    }

    public Long getAtualizadoPor() {
        return atualizadoPor;
    }

    public OffsetDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
