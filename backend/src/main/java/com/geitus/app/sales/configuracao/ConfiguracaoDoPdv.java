package com.geitus.app.sales.configuracao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Configuracao do PDV da empresa (tabela {@code configuracoes_pdv}, V17;
 * docs/modules/pdv.md): uma linha por empresa, criada na primeira
 * alteracao. Sem linha valem os padroes ({@link RegrasDoPdv#PADRAO}). A
 * gravacao e pelo upsert do {@link ConfiguracaoDoPdvRepository}; a entidade so
 * e lida.
 */
@Entity
@Table(name = "configuracoes_pdv")
public class ConfiguracaoDoPdv {

    @Id
    @Column(name = "empresa_id")
    private Long empresaId;

    @Column(name = "vender_sem_estoque", nullable = false)
    private boolean venderSemEstoque;

    @Column(name = "desconto_maximo_operador", nullable = false, precision = 5, scale = 2)
    private BigDecimal descontoMaximoOperador;

    @Column(name = "atualizado_por", nullable = false)
    private Long atualizadoPor;

    @Column(name = "atualizado_em", nullable = false)
    private OffsetDateTime atualizadoEm;

    protected ConfiguracaoDoPdv() {
        // Construtor exigido pelo JPA.
    }

    public RegrasDoPdv regras() {
        return new RegrasDoPdv(venderSemEstoque, descontoMaximoOperador);
    }

    public Long getAtualizadoPor() {
        return atualizadoPor;
    }

    public OffsetDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
