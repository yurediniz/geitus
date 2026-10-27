package com.geitus.app.sales.carrinho;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.sales.dto.CalculoResponse;
import com.geitus.app.sales.dto.CarrinhoRequest;
import com.geitus.app.shared.error.ApiError;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Calculo do carrinho (docs/modules/pdv.md). Controller fino: delega ao {@link CalculoDoCarrinho}. */
@RestController
@RequestMapping("/api/pdv/calculo")
@Tag(name = "PDV", description = "Venda no balcao: itens, calculo, vendas e cancelamento")
public class CalculoController {

    private final CalculoDoCarrinho calculo;

    public CalculoController(CalculoDoCarrinho calculo) {
        this.calculo = calculo;
    }

    @Operation(summary = "Calcula o carrinho: precos, descontos, total, pagamento e troco",
            description = "200 mesmo com regras violadas (em erros, com o campo). O servidor le de novo as "
                    + "etiquetas e ignora a quantidade enviada nelas.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Calculo, com erros e avisos por campo"),
            @ApiResponse(responseCode = "400", description = "Corpo malformado ou etiqueta fora do formato",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Produto, embalagem ou cliente inexistente (com campo)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Produto inativo (com campo)",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PostMapping
    public ResponseEntity<CalculoResponse> calcular(@AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody CarrinhoRequest carrinho) {
        return ResponseEntity.ok(calculo.calcularParaUsuario(idUsuario, carrinho));
    }
}
