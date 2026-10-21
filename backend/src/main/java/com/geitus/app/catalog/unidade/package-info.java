/**
 * Unidades de medida do catalogo (docs/modules/categorias-e-unidades.md, secao 3).
 *
 * <p>Cadastro por empresa (DEC-016), identificado publicamente pelo
 * {@code uuid} (DEC-019/029). Toda empresa recebe as unidades padrao
 * ({@link com.geitus.app.catalog.unidade.UnidadesPadrao}); sigla unica por
 * empresa, em maiusculas. Exclusao so sem uso em produtos (venda ou compra);
 * inativar e reativar sempre permitidos. API {@code /api/unidades}: leitura
 * para autenticados, escrita so ADMIN (DEC-031).
 */
package com.geitus.app.catalog.unidade;
