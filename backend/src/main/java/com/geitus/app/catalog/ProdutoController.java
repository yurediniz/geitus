package com.geitus.app.catalog;

import java.util.List;

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

import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints do modulo Produtos.
 *
 * <p>Controller fino: valida a entrada (Bean Validation) e delega toda a
 * regra de negocio ao {@link ProdutoService}. Todo endpoint recebe apenas
 * {@code idUsuario} (extraido do JWT via {@code @AuthenticationPrincipal}) —
 * nunca um identificador de empresa vindo de path, query ou corpo da
 * requisicao. A empresa manipulada e sempre resolvida pelo service a partir
 * do usuario autenticado (DEC-016), o mesmo padrao usado em
 * {@code EmpresaController}/{@code EmpresaService}.
 */
@RestController
@RequestMapping("/api/produtos")
@Tag(name = "Produtos", description = "Cadastro e consulta de produtos da empresa do usuario autenticado")
public class ProdutoController {

    private final ProdutoService produtoService;

    public ProdutoController(ProdutoService produtoService) {
        this.produtoService = produtoService;
    }

    @Operation(summary = "Lista os produtos da empresa do usuario autenticado",
            description = "Aceita filtros opcionais de busca (nome, SKU ou codigo de barras) e status ativo/inativo.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<List<ProdutoResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Filtra por nome, SKU ou codigo de barras contendo o termo")
            @RequestParam(required = false) String busca,
            @Parameter(description = "Filtra por status ativo/inativo")
            @RequestParam(required = false) Boolean ativo) {
        return ResponseEntity.ok(produtoService.listarParaUsuario(idUsuario, busca, ativo));
    }

    @Operation(summary = "Busca um produto por id, limitado a empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/{id}")
    public ResponseEntity<ProdutoResponse> buscarPorId(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable Long id) {
        return ResponseEntity.ok(produtoService.buscarPorIdParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Cadastra um novo produto na empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping
    public ResponseEntity<ProdutoResponse> cadastrar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody ProdutoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(produtoService.cadastrarParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Atualiza os dados basicos de um produto da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}")
    public ResponseEntity<ProdutoResponse> atualizar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable Long id,
            @Valid @RequestBody ProdutoRequest request) {
        return ResponseEntity.ok(produtoService.atualizarDadosBasicosParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Inativa um produto da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<ProdutoResponse> inativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable Long id) {
        return ResponseEntity.ok(produtoService.inativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Reativa um produto da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<ProdutoResponse> reativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable Long id) {
        return ResponseEntity.ok(produtoService.reativarParaUsuario(idUsuario, id));
    }
}
