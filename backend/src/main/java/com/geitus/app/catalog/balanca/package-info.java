/**
 * Etiqueta de balanca do catalogo (docs/modules/produtos.md;
 * DEC-036).
 *
 * <p>Configuracao por empresa (DEC-016, uma linha no maximo; sem linha vale o
 * padrao), leitor da etiqueta como regra de dominio pura
 * ({@link com.geitus.app.catalog.balanca.LeitorEtiquetaBalanca}, que o PDV vai
 * usar) e a API {@code /api/etiqueta-balanca}: leitura e teste para
 * autenticados, salvar so ADMIN.
 */
package com.geitus.app.catalog.balanca;
