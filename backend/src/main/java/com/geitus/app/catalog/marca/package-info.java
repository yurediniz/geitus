/**
 * Fabricantes e marcas em arvore (docs/modules/fornecedores-e-marcas.md, 3;
 * DEC-039): o mesmo modelo e as mesmas regras das categorias.
 *
 * <p>Cadastro por empresa (DEC-016), identificado pelo {@code uuid}
 * (DEC-019), com profundidade livre (o primeiro nivel costuma ser o
 * fabricante). A arvore inteira da empresa e montada em memoria pela
 * {@link com.geitus.app.catalog.arvore.Arvore} generica. Nome unico entre
 * irmaos sem diferenciar maiusculas; exclusao so sem submarcas, sem produtos e
 * sem fornecedores; inativar nao cascateia; renomear recalcula a busca dos
 * produtos da marca. API {@code /api/marcas}: leitura para autenticados,
 * escrita so ADMIN.
 */
package com.geitus.app.catalog.marca;
