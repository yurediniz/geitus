package com.geitus.app.catalog.unidade;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.catalog.unidade.dto.UnidadeMedidaRequest;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints das unidades de medida (docs/modules/categorias-e-unidades.md, 3.4).
 *
 * <p>Controller fino: valida a entrada e delega ao {@link UnidadeMedidaService}.
 * Recebe so o {@code idUsuario} do JWT, nunca a empresa (DEC-016). O
 * {@code {id}} e o UUID publico; UUID malformado vira 400 no
 * {@code GlobalExceptionHandler}.
 *
 * <p>RBAC (DEC-031, no {@code SecurityConfig}): leitura para qualquer
 * autenticado; qualquer escrita exige ADMIN.
 */
@RestController
@Validated
@RequestMapping("/api/unidades")
@Tag(name = "Unidades de medida", description = "Cadastro de unidades de medida da empresa do usuario autenticado")
public class UnidadeMedidaController {

    private final UnidadeMedidaService unidadeService;

    public UnidadeMedidaController(UnidadeMedidaService unidadeService) {
        this.unidadeService = unidadeService;
    }

    @Operation(summary = "Lista as unidades da empresa, ordenadas por sigla",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<List<UnidadeMedidaResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Filtra por status ativo/inativo")
            @RequestParam(required = false) Boolean ativo) {
        return ResponseEntity.ok(unidadeService.listarParaUsuario(idUsuario, ativo));
    }

    @Operation(summary = "Cadastra uma unidade de medida (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping
    public ResponseEntity<UnidadeMedidaResponse> cadastrar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody UnidadeMedidaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(unidadeService.cadastrarParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Edita uma unidade de medida (apenas ADMIN)",
            description = "400 ao deixar de ser fracionada se algum produto com movimentacao de estoque usa a "
                    + "unidade.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}")
    public ResponseEntity<UnidadeMedidaResponse> atualizar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody UnidadeMedidaRequest request) {
        return ResponseEntity.ok(unidadeService.atualizarParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Inativa uma unidade de medida (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<UnidadeMedidaResponse> inativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(unidadeService.inativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Reativa uma unidade de medida (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<UnidadeMedidaResponse> reativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(unidadeService.reativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Exclui uma unidade sem uso em produtos (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        unidadeService.excluirParaUsuario(idUsuario, id);
        return ResponseEntity.noContent().build();
    }
}
