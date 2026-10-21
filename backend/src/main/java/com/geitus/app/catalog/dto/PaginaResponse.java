package com.geitus.app.catalog.dto;

import java.util.List;

import org.springframework.data.domain.Page;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Pagina de resultados de uma consulta paginada: os itens da pagina, a
 * pagina pedida (a partir de 0), o tamanho pedido e o total de itens da
 * consulta. O cliente sabe que ha mais quando {@code totalItens} passa dos
 * itens ja carregados.
 */
@Schema(description = "Pagina de resultados")
public record PaginaResponse<T>(List<T> itens, int pagina, int tamanho, long totalItens) {

    public static <T> PaginaResponse<T> de(Page<T> pagina) {
        return new PaginaResponse<>(pagina.getContent(), pagina.getNumber(), pagina.getSize(),
                pagina.getTotalElements());
    }
}
