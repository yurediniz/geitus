package com.geitus.app.inventory;

import java.util.EnumSet;
import java.util.Set;

/**
 * Motivo do movimento de estoque ({@code movimentos_estoque.motivo}, V9;
 * docs/modules/produtos-estoque.md, 4.3). Os nomes sao gravados como texto e
 * espelham o CHECK {@code ck_movimento_estoque_motivo}.
 *
 * <p>Cada motivo vale para um conjunto de tipos. Os motivos de sistema
 * ({@link #ESTOQUE_INICIAL}, so do cadastro, e {@link #VENDA} e
 * {@link #CANCELAMENTO_VENDA}, do PDV; docs/modules/pdv.md, 4.5) nunca sao
 * aceitos num ajuste manual.
 */
public enum MotivoMovimento {
    COMPRA("Compra/recebimento", true, TipoMovimento.ENTRADA),
    DEVOLUCAO_CLIENTE("Devolução de cliente", true, TipoMovimento.ENTRADA),
    PERDA_AVARIA("Perda/avaria", true, TipoMovimento.SAIDA),
    VENCIDO("Vencido", true, TipoMovimento.SAIDA),
    USO_INTERNO("Uso interno", true, TipoMovimento.SAIDA),
    DEVOLUCAO_FORNECEDOR("Devolução ao fornecedor", true, TipoMovimento.SAIDA),
    CONTAGEM("Contagem/inventário", true, TipoMovimento.AJUSTE),
    OUTRO("Outro", true, TipoMovimento.ENTRADA, TipoMovimento.SAIDA, TipoMovimento.AJUSTE),
    ESTOQUE_INICIAL("Estoque inicial", false, TipoMovimento.ENTRADA),
    VENDA("Venda", false, TipoMovimento.SAIDA),
    CANCELAMENTO_VENDA("Cancelamento de venda", false, TipoMovimento.ENTRADA);

    private final String rotulo;
    private final boolean manual;
    private final Set<TipoMovimento> tipos;

    MotivoMovimento(String rotulo, boolean manual, TipoMovimento primeiroTipo, TipoMovimento... demaisTipos) {
        this.rotulo = rotulo;
        this.manual = manual;
        this.tipos = EnumSet.of(primeiroTipo, demaisTipos);
    }

    /** Texto do motivo na tela. */
    public String rotulo() {
        return rotulo;
    }

    /** Tipos de movimento em que o motivo pode ser usado. */
    public Set<TipoMovimento> tipos() {
        return EnumSet.copyOf(tipos);
    }

    /** Se o usuario pode escolher o motivo num ajuste manual. */
    public boolean manual() {
        return manual;
    }

    /** Se o motivo pode ser escolhido num ajuste manual do tipo informado. */
    public boolean aceitoNoAjusteManual(TipoMovimento tipo) {
        return manual && tipos.contains(tipo);
    }
}
