package com.geitus.app.sales.carrinho;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.sales.dto.ItemResolvidoResponse;
import com.geitus.app.sales.dto.ProdutoDoPdvResponse;
import com.geitus.app.shared.error.ApiError;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Leitura de codigo e busca por nome no PDV (docs/modules/pdv.md, 3.1 e 5.3).
 * Controller fino: delega a {@link ResolucaoDeItens}. Uma rota, dois usos pelo
 * parametro: {@code ?codigo=} ou {@code ?busca=}.
 */
@RestController
@RequestMapping("/api/pdv/itens")
@Tag(name = "PDV", description = "Venda no balcao: itens, calculo, vendas e cancelamento")
public class PdvItensController {

    private static final int TAMANHO_MAXIMO_DO_TEXTO = 100;

    private final ResolucaoDeItens resolucao;

    public PdvItensController(ResolucaoDeItens resolucao) {
        this.resolucao = resolucao;
    }

    @Operation(summary = "Resolve o codigo lido: etiqueta de balanca, codigo*quantidade, codigo do produto ou "
            + "codigo de barras", security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Item para o carrinho"),
            @ApiResponse(responseCode = "400", description = "Quantidade invalida (campo codigo)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Codigo nao encontrado",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Produto inativo ou estoque insuficiente com \"Vender "
                    + "sem estoque\" desligada", content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping(params = "codigo")
    public ResponseEntity<ItemResolvidoResponse> resolver(@AuthenticationPrincipal Long idUsuario,
            @RequestParam String codigo) {
        return ResponseEntity.ok(resolucao.resolverParaUsuario(idUsuario, recortado(codigo)));
    }

    @Operation(summary = "Busca ate 20 produtos ativos por nome, codigo ou codigo de barras",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping(params = "busca")
    public ResponseEntity<List<ProdutoDoPdvResponse>> buscar(@AuthenticationPrincipal Long idUsuario,
            @RequestParam String busca) {
        return ResponseEntity.ok(resolucao.buscarParaUsuario(idUsuario, recortado(busca)));
    }

    /** Texto longo demais nao e codigo nem busca util: recortado, sem erro. */
    private static String recortado(String texto) {
        return texto.length() > TAMANHO_MAXIMO_DO_TEXTO ? texto.substring(0, TAMANHO_MAXIMO_DO_TEXTO) : texto;
    }
}
