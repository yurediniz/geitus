package com.geitus.app.catalog.balanca.dto;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Resposta do PUT da configuracao: a configuracao gravada e os produtos
 * "Vendidos na balanca" com codigo grande demais para ela (o aviso nao bloqueia
 * o salvamento; spec 3.3).
 */
@Schema(description = "Configuracao gravada e produtos com codigo grande demais para ela")
public record SalvarEtiquetaResponse(
        ConfiguracaoEtiquetaResponse configuracao,
        @Schema(description = "Produtos vendidos na balanca cujo codigo nao cabe na etiqueta; vazio se nenhum")
        List<ProdutoAfetadoResponse> produtosComCodigoGrandeDemais) {
}
