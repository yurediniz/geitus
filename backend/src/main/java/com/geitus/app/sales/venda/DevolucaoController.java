package com.geitus.app.sales.venda;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.sales.venda.DevolucoesService.ResultadoDaDevolucao;
import com.geitus.app.sales.venda.dto.DevolucaoRequest;
import com.geitus.app.sales.venda.dto.DevolucaoResponse;
import com.geitus.app.sales.venda.dto.VendaParaDevolucaoResponse;
import com.geitus.app.shared.error.ApiError;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Devolucao de itens de uma venda (docs/modules/estoque.md, secao 6.2). Controller
 * fino: recebe so o {@code idUsuario} do JWT e delega ao {@link DevolucoesService}.
 * So o ADMIN (a rota exige o perfil do token e o service confere o do banco).
 */
@RestController
@RequestMapping("/api/pdv")
@Tag(name = "PDV", description = "Venda no balcao: itens, calculo, vendas e cancelamento")
public class DevolucaoController {

    private final DevolucoesService devolucoesService;

    public DevolucaoController(DevolucoesService devolucoesService) {
        this.devolucoesService = devolucoesService;
    }

    @Operation(summary = "Venda para devolucao, pelo numero (so ADMIN)",
            description = "De qualquer sessao e data: o que cada linha ainda pode devolver, o que cada forma ainda "
                    + "pode reembolsar e as devolucoes ja feitas. Venda cancelada da 409.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Venda para devolucao"),
            @ApiResponse(responseCode = "403", description = "Perfil sem permissao",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Venda nao encontrada",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Venda cancelada",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping("/devolucoes/venda")
    public ResponseEntity<VendaParaDevolucaoResponse> vendaParaDevolucao(@AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Numero da venda", example = "128") @RequestParam long numero) {
        return ResponseEntity.ok(devolucoesService.vendaParaDevolucaoParaUsuario(idUsuario, numero));
    }

    @Operation(summary = "Devolve itens da venda no caixa aberto de quem devolve (so ADMIN)",
            description = "Volta ao estoque (ou avariado) e reembolsa pela forma original. 201 quando grava; 200 "
                    + "com a devolucao gravada quando a chave se repete com os mesmos dados; 409 sem caixa aberto, "
                    + "com a venda cancelada, sem dinheiro na gaveta ou com a chave de outros dados.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Devolucao gravada"),
            @ApiResponse(responseCode = "200", description = "Chave repetida: a devolucao ja gravada"),
            @ApiResponse(responseCode = "400", description = "Linha, quantidade, motivo ou reembolso invalido (com campo)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "403", description = "Perfil sem permissao",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Venda nao encontrada",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Conflito com o caixa ou com a venda",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PostMapping("/vendas/{id}/devolucoes")
    public ResponseEntity<DevolucaoResponse> devolver(@AuthenticationPrincipal Long idUsuario, @PathVariable UUID id,
            @Valid @RequestBody DevolucaoRequest request) {
        ResultadoDaDevolucao resultado = devolucoesService.devolverParaUsuario(idUsuario, id, request);
        return ResponseEntity.status(resultado.criada() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(resultado.devolucao());
    }
}
