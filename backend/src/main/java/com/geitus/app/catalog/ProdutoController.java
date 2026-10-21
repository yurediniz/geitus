package com.geitus.app.catalog;

import java.util.List;
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

import com.geitus.app.catalog.dto.HistoricoPrecoResponse;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.dto.SkuSugestaoResponse;

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
 *
 * <p>O {@code {id}} das rotas e o UUID publico do produto (DEC-019); UUID
 * malformado responde 400 pelo handler global. RBAC (DEC-025) no
 * {@code SecurityConfig}: escrita, exclusao e sugestao de SKU exigem ADMIN;
 * leitura (inclusive o historico de precos) e sugestoes de marca/fornecedor
 * ficam com qualquer autenticado.
 */
@RestController
@RequestMapping("/api/produtos")
@Tag(name = "Produtos", description = "Cadastro e consulta de produtos da empresa do usuario autenticado")
public class ProdutoController {

    private static final String PAGINA_PADRAO = "0";
    private static final String TAMANHO_PADRAO_HISTORICO = "20";

    private final ProdutoService produtoService;

    public ProdutoController(ProdutoService produtoService) {
        this.produtoService = produtoService;
    }

    @Operation(summary = "Lista os produtos da empresa do usuario autenticado",
            description = "Aceita filtros opcionais de busca (nome, nome curto, SKU ou qualquer codigo de barras) "
                    + "e status ativo/inativo.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<List<ProdutoResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Filtra por nome, nome curto, SKU ou codigo de barras contendo o termo")
            @RequestParam(required = false) String busca,
            @Parameter(description = "Filtra por status ativo/inativo")
            @RequestParam(required = false) Boolean ativo) {
        return ResponseEntity.ok(produtoService.listarParaUsuario(idUsuario, busca, ativo));
    }

    @Operation(summary = "Sugere o proximo SKU no padrao P + 6 digitos (ADMIN)",
            description = "Nao reserva o SKU: a unicidade e conferida ao salvar.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/sku/sugestao")
    public ResponseEntity<SkuSugestaoResponse> sugerirSku(@AuthenticationPrincipal Long idUsuario) {
        return ResponseEntity.ok(new SkuSugestaoResponse(produtoService.sugerirSkuParaUsuario(idUsuario)));
    }

    @Operation(summary = "Sugere marcas ou fornecedores ja usados na empresa",
            description = "Ate 10 valores distintos, dos mais usados para os menos usados.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/sugestoes")
    public ResponseEntity<List<String>> sugestoes(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "marca ou fornecedor")
            @RequestParam(required = false) String campo,
            @Parameter(description = "Trecho do valor (ate 50 caracteres); vazio traz os mais usados")
            @RequestParam(required = false) String termo) {
        return ResponseEntity.ok(produtoService.sugestoesParaUsuario(idUsuario, campo, termo));
    }

    @Operation(summary = "Busca um produto pelo UUID, limitado a empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/{id}")
    public ResponseEntity<ProdutoResponse> buscarPorId(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(produtoService.buscarPorIdParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Historico de custo e preco de venda do produto, do mais recente para o mais antigo",
            description = "Paginado: pagina a partir de 0; tamanho de 1 a 100 (padrao 20). Produto de outra "
                    + "empresa responde 404.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/{id}/historico-precos")
    public ResponseEntity<PaginaResponse<HistoricoPrecoResponse>> historicoDePrecos(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Parameter(description = "Pagina, a partir de 0")
            @RequestParam(defaultValue = PAGINA_PADRAO) int pagina,
            @Parameter(description = "Itens por pagina, de 1 a 100")
            @RequestParam(defaultValue = TAMANHO_PADRAO_HISTORICO) int tamanho) {
        return ResponseEntity.ok(produtoService.historicoDePrecosParaUsuario(idUsuario, id, pagina, tamanho));
    }

    @Operation(summary = "Cadastra um novo produto na empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping
    public ResponseEntity<ProdutoResponse> cadastrar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody ProdutoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(produtoService.cadastrarParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Atualiza um produto da empresa do usuario autenticado",
            description = "Substitui a lista inteira de codigos de barras pela informada.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}")
    public ResponseEntity<ProdutoResponse> atualizar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody ProdutoRequest request) {
        return ResponseEntity.ok(produtoService.atualizarDadosBasicosParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Inativa um produto da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<ProdutoResponse> inativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(produtoService.inativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Reativa um produto da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<ProdutoResponse> reativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(produtoService.reativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Exclui um produto que nunca teve movimentacao (ADMIN)",
            description = "409 se o produto ja teve venda ou movimentacao de estoque; os codigos de barras "
                    + "sao excluidos junto.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        produtoService.excluirParaUsuario(idUsuario, id);
        return ResponseEntity.noContent().build();
    }
}
