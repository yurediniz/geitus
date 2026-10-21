package com.geitus.app.catalog.categoria;

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

import com.geitus.app.catalog.categoria.dto.CategoriaRequest;
import com.geitus.app.catalog.categoria.dto.CategoriaResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints das categorias (docs/modules/categorias-e-unidades.md, 4.3).
 *
 * <p>Controller fino: valida a entrada e delega ao {@link CategoriaService}.
 * Recebe so o {@code idUsuario} do JWT, nunca a empresa (DEC-016). O
 * {@code {id}} e o UUID publico; UUID malformado vira 400 no
 * {@code GlobalExceptionHandler}.
 *
 * <p>RBAC (DEC-031, no {@code SecurityConfig}): leitura para qualquer
 * autenticado; qualquer escrita exige ADMIN.
 */
@RestController
@Validated
@RequestMapping("/api/categorias")
@Tag(name = "Categorias", description = "Categorias de produtos (arvore) da empresa do usuario autenticado")
public class CategoriaController {

    private final CategoriaService categoriaService;

    public CategoriaController(CategoriaService categoriaService) {
        this.categoriaService = categoriaService;
    }

    @Operation(summary = "Lista plana das categorias da empresa, ordenada pelo caminho",
            description = "O frontend monta a arvore pelo parentId.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<List<CategoriaResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Filtra por status ativo/inativo")
            @RequestParam(required = false) Boolean ativo) {
        return ResponseEntity.ok(categoriaService.listarParaUsuario(idUsuario, ativo));
    }

    @Operation(summary = "Cadastra uma categoria, na raiz ou sob um pai (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping
    public ResponseEntity<CategoriaResponse> cadastrar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody CategoriaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(categoriaService.cadastrarParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Renomeia e/ou move uma categoria; parentId nulo leva para a raiz (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}")
    public ResponseEntity<CategoriaResponse> atualizar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody CategoriaRequest request) {
        return ResponseEntity.ok(categoriaService.atualizarParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Inativa uma categoria; filhos e produtos nao mudam (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<CategoriaResponse> inativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(categoriaService.inativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Reativa uma categoria (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<CategoriaResponse> reativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(categoriaService.reativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Exclui uma categoria sem subcategorias nem produtos (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        categoriaService.excluirParaUsuario(idUsuario, id);
        return ResponseEntity.noContent().build();
    }
}
