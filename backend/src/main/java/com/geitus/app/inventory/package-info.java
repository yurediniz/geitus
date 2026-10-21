/**
 * Modulo de estoque do Geitus (Fase D da evolucao de Produtos; DEC-034,
 * docs/modules/produtos-estoque.md).
 *
 * <p>O saldo de cada produto e derivado de movimentos imutaveis:
 * <ul>
 *   <li>{@link com.geitus.app.inventory.MovimentoEstoque} — tabela
 *       {@code movimentos_estoque} (V9), so de insercao, com tipo, motivo,
 *       origem, quantidade com sinal, saldo anterior e novo, usuario e chave de
 *       idempotencia;</li>
 *   <li>{@link com.geitus.app.inventory.EstoqueSaldo} — tabela
 *       {@code estoque_saldos} (V9), saldo &gt;= 0 por produto, alterado so na
 *       mesma transacao do movimento, com a linha travada.</li>
 * </ul>
 *
 * <p>Isolado por empresa (DEC-016): a empresa vem sempre do usuario
 * autenticado e as FKs compostas garantem produto e usuario da mesma empresa.
 * O catalogo nao depende deste pacote: ele declara as interfaces que precisa e
 * este pacote as implementa.
 */
package com.geitus.app.inventory;
