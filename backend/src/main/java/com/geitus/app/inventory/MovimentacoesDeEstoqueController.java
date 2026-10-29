package com.geitus.app.inventory;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.inventory.dto.MovimentacaoDeEstoqueResponse;
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
 * Movimentacoes de todos os produtos, na area Estoque (docs/modules/estoque.md,
 * regras 26 e 27).
 *
 * <p>Controller fino: converte os parametros e delega ao
 * {@link MovimentacoesDeEstoqueService}. Leitura para qualquer autenticado (cai
 * no {@code anyRequest().authenticated()} do {@code SecurityConfig}); a empresa
 * vem do usuario do JWT (DEC-016).
 */
@RestController
@RequestMapping("/api/estoque/movimentos")
@Tag(name = "Estoque", description = "Saldo e movimentacoes de estoque dos produtos da empresa do usuario autenticado")
public class MovimentacoesDeEstoqueController {

    private final MovimentacoesDeEstoqueService movimentacoesService;

    public MovimentacoesDeEstoqueController(MovimentacoesDeEstoqueService movimentacoesService) {
        this.movimentacoesService = movimentacoesService;
    }

    @Operation(summary = "Movimentacoes de estoque de todos os produtos",
            description = "Do mais recente ao mais antigo, paginadas (25 por padrao, ate 100). Periodo em datas "
                    + "inclusivas (padrao: os ultimos 30 dias; no maximo 1 ano), produto, tipo, motivo e usuario. "
                    + "Produto ou usuario de outra empresa devolve a lista vazia.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pagina de movimentacoes"),
            @ApiResponse(responseCode = "400", description = "Parametro invalido (com o campo)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "401", description = "Sem token ou token invalido",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping
    public ResponseEntity<PaginaResponse<MovimentacaoDeEstoqueResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Primeiro dia (AAAA-MM-DD); padrao: 29 dias antes de 'ate'")
            @RequestParam(required = false) String de,
            @Parameter(description = "Ultimo dia, inclusivo (AAAA-MM-DD); padrao: hoje")
            @RequestParam(required = false) String ate,
            @Parameter(description = "UUID do produto")
            @RequestParam(required = false) UUID produto,
            @Parameter(description = "ENTRADA, SAIDA ou AJUSTE")
            @RequestParam(required = false) String tipo,
            @Parameter(description = "Motivo do movimento (ex.: COMPRA, VENDA, CONTAGEM)")
            @RequestParam(required = false) String motivo,
            @Parameter(description = "Id do usuario que registrou o movimento")
            @RequestParam(required = false) Long usuario,
            @Parameter(description = "Pagina, a partir de 0")
            @RequestParam(required = false) Integer pagina,
            @Parameter(description = "Itens por pagina, de 1 a 100 (padrao 25)")
            @RequestParam(required = false) Integer tamanho) {
        // "Hoje" pelo relogio da JVM, o mesmo que grava criado_em dos movimentos (DT-030).
        ParametrosDasMovimentacoes parametros = ParametrosDasMovimentacoes.daRequisicao(de, ate, produto, tipo,
                motivo, usuario, pagina, tamanho, LocalDate.now());
        return ResponseEntity.ok(movimentacoesService.listarParaUsuario(idUsuario, parametros));
    }
}
