package com.geitus.app.inventory;

/**
 * Tipo do movimento de estoque ({@code movimentos_estoque.tipo}, V9;
 * docs/modules/produtos-estoque.md, 4.2). Os nomes sao gravados como texto e
 * espelham o CHECK {@code ck_movimento_estoque_tipo}.
 *
 * <ul>
 *   <li>{@link #ENTRADA}: o usuario informa a quantidade (&gt; 0), somada ao saldo;</li>
 *   <li>{@link #SAIDA}: o usuario informa a quantidade (&gt; 0), subtraida do saldo;</li>
 *   <li>{@link #AJUSTE}: "Contar e ajustar para" — o usuario informa o saldo
 *       contado (&gt;= 0) e a variacao gravada e a diferenca para o saldo atual.</li>
 * </ul>
 */
public enum TipoMovimento {
    ENTRADA,
    SAIDA,
    AJUSTE
}
