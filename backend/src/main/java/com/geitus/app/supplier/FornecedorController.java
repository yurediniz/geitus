package com.geitus.app.supplier;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.catalog.LigacaoDoProduto;
import com.geitus.app.catalog.dto.ProdutoDoFornecedorResponse;
import com.geitus.app.shared.paginacao.PaginaResponse;
import com.geitus.app.supplier.dto.FornecedorItemResponse;
import com.geitus.app.supplier.dto.FornecedorRequest;
import com.geitus.app.supplier.dto.FornecedorResponse;
import com.geitus.app.supplier.dto.ProdutoDoFornecedorRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints dos fornecedores (docs/modules/fornecedores-e-marcas.md, 4.7).
 *
 * <p>Controller fino: valida a entrada e delega ao {@link FornecedorService}.
 * Recebe so o {@code idUsuario} do JWT, nunca a empresa (DEC-016). O
 * {@code {id}} e o UUID publico; UUID malformado vira 400 no handler global.
 *
 * <p>RBAC (DEC-039, no {@code SecurityConfig}): leitura para qualquer
 * autenticado; qualquer escrita exige ADMIN.
 */
@RestController
@RequestMapping("/api/fornecedores")
@Tag(name = "Fornecedores", description = "Fornecedores da empresa do usuario autenticado")
public class FornecedorController {

    private static final String PAGINA_PADRAO = "0";
    private static final String TAMANHO_PADRAO = "25";

    private final FornecedorService fornecedorService;

    public FornecedorController(FornecedorService fornecedorService) {
        this.fornecedorService = fornecedorService;
    }

    @Operation(summary = "Lista paginada dos fornecedores, por nome",
            description = "Busca sem acento por nome, nome fantasia, documento (com ou sem mascara), numero e "
                    + "nome do representante.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<PaginaResponse<FornecedorItemResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Termo de busca") @RequestParam(required = false) String busca,
            @Parameter(description = "ativos (padrao), inativos ou todos")
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = PAGINA_PADRAO) int pagina,
            @RequestParam(defaultValue = TAMANHO_PADRAO) int tamanho) {
        return ResponseEntity.ok(fornecedorService.listarParaUsuario(idUsuario, busca, status, pagina, tamanho));
    }

    @Operation(summary = "Cadastra um fornecedor (apenas ADMIN)", security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping
    public ResponseEntity<FornecedorResponse> cadastrar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody FornecedorRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(fornecedorService.cadastrarParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Busca um fornecedor pelo UUID", security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/{id}")
    public ResponseEntity<FornecedorResponse> buscar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(fornecedorService.buscarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Atualiza um fornecedor (apenas ADMIN)",
            description = "Substitui os dados; representantes e marcaIds ausentes mantem as listas atuais.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}")
    public ResponseEntity<FornecedorResponse> atualizar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody FornecedorRequest request) {
        return ResponseEntity.ok(fornecedorService.atualizarParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Inativa um fornecedor (apenas ADMIN)", security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<FornecedorResponse> inativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(fornecedorService.inativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Reativa um fornecedor (apenas ADMIN)", security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<FornecedorResponse> reativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(fornecedorService.reativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Exclui um fornecedor sem produtos nem entradas (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        fornecedorService.excluirParaUsuario(idUsuario, id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Produtos que o fornecedor vende, por nome",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/{id}/produtos")
    public ResponseEntity<PaginaResponse<ProdutoDoFornecedorResponse>> produtos(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @RequestParam(defaultValue = PAGINA_PADRAO) int pagina,
            @RequestParam(defaultValue = TAMANHO_PADRAO) int tamanho) {
        return ResponseEntity.ok(fornecedorService.produtosParaUsuario(idUsuario, id, pagina, tamanho));
    }

    @Operation(summary = "Liga um produto ao fornecedor (apenas ADMIN)",
            description = "Idempotente: 201 na ligacao nova, 200 se o produto ja era do fornecedor.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping("/{id}/produtos")
    public ResponseEntity<ProdutoDoFornecedorResponse> ligarProduto(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody ProdutoDoFornecedorRequest request) {
        LigacaoDoProduto ligacao = fornecedorService.ligarProdutoParaUsuario(idUsuario, id, request.produtoId());
        return ResponseEntity.status(ligacao.criada() ? HttpStatus.CREATED : HttpStatus.OK).body(ligacao.produto());
    }

    @Operation(summary = "Tira um produto do fornecedor (apenas ADMIN)",
            description = "Se o fornecedor era o da ultima compra do produto, esse campo do produto e limpo.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @DeleteMapping("/{id}/produtos/{produtoId}")
    public ResponseEntity<Void> desligarProduto(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @PathVariable UUID produtoId) {
        fornecedorService.desligarProdutoParaUsuario(idUsuario, id, produtoId);
        return ResponseEntity.noContent().build();
    }
}
