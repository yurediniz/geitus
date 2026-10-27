/**
 * Categorias de produtos em arvore (docs/modules/produtos.md).
 *
 * <p>Cadastro por empresa (DEC-016), identificado pelo {@code uuid}
 * (DEC-019/029), com profundidade ilimitada. A arvore inteira da empresa e
 * montada em memoria pela {@link com.geitus.app.catalog.categoria.CategoriaArvore}
 * (objeto de dominio puro: caminho, nivel, ramo selecionavel, subarvore e
 * deteccao de ciclo). Nome unico entre irmaos sem diferenciar maiusculas;
 * exclusao so sem subcategorias e sem produtos; inativar nao cascateia.
 * API {@code /api/categorias}: leitura para autenticados, escrita so ADMIN
 * (DEC-031).
 */
package com.geitus.app.catalog.categoria;
