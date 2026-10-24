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
 *       {@code estoque_saldos} (V9), saldo por produto (negativo so por venda, V17), alterado so na
 *       mesma transacao do movimento, com a linha travada.</li>
 * </ul>
 *
 * <p>Isolado por empresa (DEC-016): a empresa vem sempre do usuario
 * autenticado e as FKs compostas garantem produto e usuario da mesma empresa.
 * O catalogo nao depende deste pacote: ele declara as interfaces que precisa e
 * este pacote as implementa.
 *
 * <p><b>PDV (etapa 11, DEC-042):</b> publica {@link com.geitus.app.inventory.EstoqueDaVenda}
 * (trava dos produtos em ordem de id, baixa e estorno por item de venda); so a
 * baixa por venda pode deixar o saldo negativo.
 *
 * <p><b>Direcao das dependencias (Fase B5):</b> {@code inventory -> supplier
 * -> catalog}; o catalogo e independente. Este pacote implementa
 * {@code supplier.EntradasDoFornecedor} e le a entidade {@code Fornecedor} nas
 * consultas de movimentos (o nome do fornecedor da compra); resolve o
 * fornecedor do ajuste pela {@code catalog.NomesDeFornecedores}.
 */
package com.geitus.app.inventory;
