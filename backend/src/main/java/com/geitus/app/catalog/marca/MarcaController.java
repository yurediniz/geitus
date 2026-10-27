package com.geitus.app.catalog.marca;

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

import com.geitus.app.catalog.marca.dto.MarcaRequest;
import com.geitus.app.catalog.marca.dto.MarcaResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints das marcas (docs/modules/fornecedores-e-marcas.md).
 *
 * <p>Controller fino: valida a entrada e delega ao {@link MarcaService}.
 * Recebe so o {@code idUsuario} do JWT, nunca a empresa (DEC-016). O
 * {@code {id}} e o UUID publico; UUID malformado vira 400 no
 * {@code GlobalExceptionHandler}.
 *
 * <p>RBAC (DEC-039, como DEC-031, no {@code SecurityConfig}): leitura para qualquer
 * autenticado; qualquer escrita exige ADMIN.
 */
@RestController
@Validated
@RequestMapping("/api/marcas")
@Tag(name = "Marcas", description = "Fabricantes e marcas (arvore) da empresa do usuario autenticado")
public class MarcaController {

    private final MarcaService marcaService;

    public MarcaController(MarcaService marcaService) {
        this.marcaService = marcaService;
    }

    @Operation(summary = "Lista plana das marcas da empresa, ordenada pelo caminho",
            description = "O frontend monta a arvore pelo parentId.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<List<MarcaResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Filtra por status ativo/inativo")
            @RequestParam(required = false) Boolean ativo) {
        return ResponseEntity.ok(marcaService.listarParaUsuario(idUsuario, ativo));
    }

    @Operation(summary = "Cadastra uma marca, na raiz ou sob um pai (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping
    public ResponseEntity<MarcaResponse> cadastrar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody MarcaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(marcaService.cadastrarParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Renomeia e/ou move uma marca (apenas ADMIN)",
            description = "Substitui nome E pai de uma vez (nao e merge parcial): envie sempre o nome e o "
                    + "parentId desejados. parentId ausente ou nulo move a marca para a raiz "
                    + "(marca principal). Para so renomear, reenvie o parentId atual.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}")
    public ResponseEntity<MarcaResponse> atualizar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody MarcaRequest request) {
        return ResponseEntity.ok(marcaService.atualizarParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Inativa uma marca; filhos, produtos e fornecedores nao mudam (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<MarcaResponse> inativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(marcaService.inativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Reativa uma marca (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<MarcaResponse> reativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(marcaService.reativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Exclui uma marca sem submarcas, produtos nem fornecedores (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        marcaService.excluirParaUsuario(idUsuario, id);
        return ResponseEntity.noContent().build();
    }
}
