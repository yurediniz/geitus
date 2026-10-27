package com.geitus.app.sales.carrinho;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.sales.dto.CatalogoDoPdvResponse;
import com.geitus.app.shared.error.ApiError;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Catalogo do PDV antes de digitar (docs/modules/pdv.md; DEC-044).
 * Controller fino: delega a {@link CatalogoDoPdv}.
 */
@RestController
@RequestMapping("/api/pdv/catalogo")
@Tag(name = "PDV", description = "Venda no balcao: itens, calculo, vendas e cancelamento")
public class CatalogoDoPdvController {

    private final CatalogoDoPdv catalogo;

    public CatalogoDoPdvController(CatalogoDoPdv catalogo) {
        this.catalogo = catalogo;
    }

    @Operation(summary = "Produtos ativos, os mais vendidos nos ultimos 30 dias primeiro e o resto por nome; "
            + "categoria com as subcategorias; paginas de 24", security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pagina do catalogo"),
            @ApiResponse(responseCode = "400", description = "Pagina invalida ou categoria que nao e UUID",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping
    public ResponseEntity<CatalogoDoPdvResponse> listar(@AuthenticationPrincipal Long idUsuario,
            @RequestParam(required = false) UUID categoria, @RequestParam(defaultValue = "0") int pagina) {
        return ResponseEntity.ok(catalogo.listarParaUsuario(idUsuario, categoria, pagina));
    }
}
