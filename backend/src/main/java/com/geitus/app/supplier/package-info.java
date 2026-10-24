/**
 * Fornecedores da empresa (docs/modules/fornecedores-e-marcas.md, 4; DEC-039).
 *
 * <p>Cadastro por empresa (DEC-016), identificado pelo {@code uuid} (DEC-019)
 * e numerado pelo {@code Numerador} (tipo {@code FORNECEDOR}): dados do
 * emitente da NF-e de compra, ate 10 representantes de venda e ate 200 marcas
 * que vende. So a razao social/nome e obrigatoria.
 *
 * <p>Fronteiras: este pacote usa o catalogo (marcas, e os produtos que o
 * fornecedor vende pela interface {@code catalog.ProdutosDoFornecedor}); o
 * catalogo NAO depende daqui — obtem nome e numero dos fornecedores pela
 * interface {@code catalog.NomesDeFornecedores}, implementada neste pacote.
 * API {@code /api/fornecedores}: leitura para autenticados, escrita so ADMIN.
 */
package com.geitus.app.supplier;
