package com.geitus.app.cashier.ponto;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.cashier.ponto.dto.PontoDeCaixaRequest;
import com.geitus.app.cashier.ponto.dto.PontoDeCaixaResponse;
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
 * Pontos de caixa (docs/modules/caixa.md). Controller fino: recebe so o
 * {@code idUsuario} do JWT e delega ao {@link PontosDeCaixaService}. O
 * {@code {id}} e o UUID publico do ponto. RBAC no {@code SecurityConfig}: a
 * leitura vale para qualquer autenticado; cadastrar, renomear, inativar e
 * reativar exigem ADMIN.
 */
@RestController
@RequestMapping("/api/caixa/pontos")
@Tag(name = "Caixa", description = "Pontos de caixa, sessoes, movimentos e fechamento da empresa do usuario")
public class PontoDeCaixaController {

    private final PontosDeCaixaService pontosService;

    public PontoDeCaixaController(PontosDeCaixaService pontosService) {
        this.pontosService = pontosService;
    }

    @Operation(summary = "Lista os pontos de caixa com a situacao e o ultimo fundo de troco",
            description = "Ativos e inativos (filtro ativo), na ordem de criacao. A empresa que nunca teve ponto "
                    + "ganha o \"Caixa 1\" nesta consulta.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Lista de pontos"),
            @ApiResponse(responseCode = "401", description = "Sem token ou token invalido",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping
    public ResponseEntity<List<PontoDeCaixaResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "true: so ativos; false: so inativos; ausente: todos")
            @RequestParam(required = false) Boolean ativo) {
        return ResponseEntity.ok(pontosService.listarParaUsuario(idUsuario, ativo));
    }

    @Operation(summary = "Cadastra um ponto de caixa (ADMIN)", security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Ponto cadastrado"),
            @ApiResponse(responseCode = "400", description = "Nome vazio ou com mais de 40 caracteres",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "403", description = "Perfil sem permissao",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Nome repetido ou limite de 50 pontos",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PostMapping
    public ResponseEntity<PontoDeCaixaResponse> cadastrar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody PontoDeCaixaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(pontosService.cadastrarParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Renomeia um ponto de caixa (ADMIN)", security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Ponto renomeado"),
            @ApiResponse(responseCode = "400", description = "Nome invalido",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Ponto nao encontrado na empresa",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Nome repetido",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PatchMapping("/{id}")
    public ResponseEntity<PontoDeCaixaResponse> renomear(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody PontoDeCaixaRequest request) {
        return ResponseEntity.ok(pontosService.renomearParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Inativa um ponto de caixa sem caixa aberto (ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Ponto inativado"),
            @ApiResponse(responseCode = "404", description = "Ponto nao encontrado na empresa",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Ponto com caixa aberto ou em conferencia",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<PontoDeCaixaResponse> inativar(@AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(pontosService.inativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Reativa um ponto de caixa (ADMIN)", security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Ponto reativado"),
            @ApiResponse(responseCode = "404", description = "Ponto nao encontrado na empresa",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<PontoDeCaixaResponse> reativar(@AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(pontosService.reativarParaUsuario(idUsuario, id));
    }
}
