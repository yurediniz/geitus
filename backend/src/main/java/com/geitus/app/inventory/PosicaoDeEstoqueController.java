package com.geitus.app.inventory;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.inventory.dto.PosicaoDeEstoqueResponse;
import com.geitus.app.inventory.dto.ResumoDaPosicaoResponse;
import com.geitus.app.shared.error.ApiError;
import com.geitus.app.shared.paginacao.PaginaResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Posicao de estoque da area Estoque (docs/modules/estoque.md, regras 22 a 24).
 *
 * <p>Controller fino: converte os parametros e delega ao
 * {@link PosicaoDeEstoqueService}. Leitura para qualquer autenticado (cai no
 * {@code anyRequest().authenticated()} do {@code SecurityConfig}); a empresa vem
 * do usuario do JWT (DEC-016).
 */
@RestController
@RequestMapping("/api/estoque/posicao")
@Tag(name = "Estoque", description = "Saldo e movimentacoes de estoque dos produtos da empresa do usuario autenticado")
public class PosicaoDeEstoqueController {

    private final PosicaoDeEstoqueService posicaoService;

    public PosicaoDeEstoqueController(PosicaoDeEstoqueService posicaoService) {
        this.posicaoService = posicaoService;
    }

    @Operation(summary = "Posicao de estoque dos produtos que controlam estoque",
            description = "Saldo, situacao, niveis, custo e valor em custo, paginados (25 por padrao, ate 100). "
                    + "Busca e categoria como na listagem de produtos; situacao repor, negativo, zerado, baixo, "
                    + "reposicao, regular ou alto; ordem nome, "
                    + "saldo ou valor (com - para decrescente).",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pagina da posicao"),
            @ApiResponse(responseCode = "400", description = "Parametro invalido (com o campo)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "401", description = "Sem token ou token invalido",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping
    public ResponseEntity<PaginaResponse<PosicaoDeEstoqueResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Nome, codigo de barras, numero ou codigo do produto (ate 200 caracteres)")
            @RequestParam(required = false) String busca,
            @Parameter(description = "ativos (padrao), inativos ou todos")
            @RequestParam(required = false) String status,
            @Parameter(description = "UUID da categoria; inclui as descendentes")
            @RequestParam(required = false) UUID categoria,
            @Parameter(description = "repor (negativo, zerado, baixo ou reposicao), negativo, zerado, baixo, "
                    + "reposicao, regular ou alto")
            @RequestParam(required = false) String situacao,
            @Parameter(description = "nome (padrao), -nome, saldo, -saldo, valor ou -valor")
            @RequestParam(required = false) String ordem,
            @Parameter(description = "Pagina, a partir de 0")
            @RequestParam(required = false) Integer pagina,
            @Parameter(description = "Itens por pagina, de 1 a 100 (padrao 25)")
            @RequestParam(required = false) Integer tamanho) {
        ParametrosDaPosicao parametros = ParametrosDaPosicao.daRequisicao(busca, status, categoria, situacao, ordem,
                pagina, tamanho);
        return ResponseEntity.ok(posicaoService.listarParaUsuario(idUsuario, parametros));
    }

    @Operation(summary = "Resumo da posicao de estoque",
            description = "Contagens exclusivas (produtos, negativos, zerados, baixo, reposicao, alto, sem custo) e "
                    + "valor total em custo para "
                    + "a busca, a categoria e o status, sem o filtro de situacao.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Resumo"),
            @ApiResponse(responseCode = "400", description = "Parametro invalido (com o campo)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "401", description = "Sem token ou token invalido",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping("/resumo")
    public ResponseEntity<ResumoDaPosicaoResponse> resumo(
            @AuthenticationPrincipal Long idUsuario,
            @RequestParam(required = false) String busca,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID categoria) {
        ParametrosDaPosicao parametros = ParametrosDaPosicao.daRequisicao(busca, status, categoria, null, null, null,
                null);
        return ResponseEntity.ok(posicaoService.resumoParaUsuario(idUsuario, parametros));
    }
}
