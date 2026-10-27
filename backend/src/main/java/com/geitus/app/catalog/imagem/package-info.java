/**
 * Imagem do produto (Fase F; docs/modules/produtos.md, DEC-040).
 *
 * <p>Uma imagem por produto, comprimida no navegador em duas versoes (grande
 * e miniatura) e guardada no PostgreSQL numa tabela separada de
 * {@code produtos} (V15), para nenhuma consulta de produto carregar os bytes.
 * O servidor nao recomprime: confere o tipo real pelos primeiros bytes, os
 * tamanhos e as dimensoes lidas do cabecalho ({@link
 * com.geitus.app.catalog.imagem.CabecalhoDeImagem}). Isolada por empresa
 * (DEC-016) no envio e na remocao.
 */
package com.geitus.app.catalog.imagem;
