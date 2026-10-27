/**
 * Listagem paginada de produtos (docs/modules/produtos.md, DEC-035).
 *
 * <p>Etapa 1 da consulta: {@link com.geitus.app.catalog.listagem.ConsultaDeProdutos}
 * devolve os ids da pagina e o total, em SQL nativo de leitura montado SO com
 * fragmentos fixos escolhidos por enums ({@link com.geitus.app.catalog.listagem.OrdemDeProdutos},
 * {@link com.geitus.app.catalog.listagem.StatusFiltro},
 * {@link com.geitus.app.catalog.listagem.EstoqueFiltro}); todo valor vindo do
 * usuario vai como parametro nomeado. A etapa 2 (carregar os produtos com as
 * relacoes, na mesma ordem) fica no {@code ProdutoService}.
 *
 * <p>Acoplamento com o estoque so de leitura e so no SQL: a consulta faz
 * {@code LEFT JOIN estoque_saldos} para filtrar e ordenar pelo saldo, sem
 * importar classes do pacote {@code inventory}.
 */
package com.geitus.app.catalog.listagem;
