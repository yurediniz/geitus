/**
 * Fornecedores da empresa (docs/modules/fornecedores-e-marcas.md, 4; DEC-039).
 *
 * <p>Cadastro por empresa (DEC-016), identificado pelo {@code uuid} (DEC-019)
 * e numerado pelo {@code Numerador} (tipo {@code FORNECEDOR}): dados do
 * emitente da NF-e de compra, ate 10 representantes de venda e ate 200 marcas
 * que vende. So a razao social/nome e obrigatoria.
 *
 * <p><b>Direcao das dependencias:</b> {@code inventory -> supplier -> catalog};
 * o catalogo e independente. Este pacote usa o catalogo (marcas, e os produtos
 * que o fornecedor vende pela interface {@code catalog.ProdutosDoFornecedor})
 * e implementa {@code catalog.NomesDeFornecedores}, pela qual o catalogo e o
 * estoque obtem numero, nome e status dos fornecedores. Do estoque, so declara
 * {@link com.geitus.app.supplier.EntradasDoFornecedor}, implementada la: este
 * pacote nao depende do {@code inventory}.
 * API {@code /api/fornecedores}: leitura para autenticados, escrita so ADMIN.
 */
package com.geitus.app.supplier;
