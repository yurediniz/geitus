/**
 * Modulo de produtos do Geitus.
 *
 * <p>Backend do cadastro de produtos fisicos, isolado por empresa (DEC-016):
 * entidade, repository, service e controller REST ({@code /api/produtos}). A
 * escrita (POST/PATCH) exige perfil ADMIN e a leitura (GET) e liberada a
 * qualquer usuario autenticado (ver {@code SecurityConfig}). As excecoes do
 * modulo sao mapeadas para HTTP pelo {@code GlobalExceptionHandler}: 404
 * ({@link com.geitus.app.catalog.ProdutoNaoEncontradoException}), 400
 * ({@link com.geitus.app.catalog.RegraDeNegocioException}) e 409
 * ({@link com.geitus.app.catalog.ProdutoConflitoException}). Ver CLAUDE.md e
 * docs/modules/produtos.md.
 */
package com.geitus.app.catalog;
