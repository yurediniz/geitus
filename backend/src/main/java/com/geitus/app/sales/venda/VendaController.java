package com.geitus.app.sales.venda;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
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

import com.geitus.app.sales.venda.VendasService.ResultadoDaVenda;
import com.geitus.app.sales.venda.dto.CancelamentoRequest;
import com.geitus.app.sales.venda.dto.FinalizarVendaRequest;
import com.geitus.app.sales.venda.dto.VendaResponse;
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
import jakarta.validation.Valid;

/**
 * Vendas do PDV (docs/modules/pdv.md, 5.3). Controller fino: recebe so o
 * {@code idUsuario} do JWT e delega ao {@link VendasService}. O {@code {id}} e
 * o UUID publico da venda; a regra "dono da sessao ou ADMIN" fica no service.
 */
@RestController
@RequestMapping("/api/pdv/vendas")
@Tag(name = "PDV", description = "Venda no balcao: itens, calculo, vendas e cancelamento")
public class VendaController {

    private static final String PAGINA_PADRAO = "0";
    private static final String TAMANHO_PADRAO = "20";

    private final VendasService vendasService;

    public VendaController(VendasService vendasService) {
        this.vendasService = vendasService;
    }

    @Operation(summary = "Finaliza a venda no caixa aberto do usuario",
            description = "O servidor recalcula tudo. 201 quando grava; 200 com a venda gravada quando a chave se "
                    + "repete com os mesmos dados; 409 sem caixa aberto, com o total mudado, estoque insuficiente "
                    + "(\"Vender sem estoque\" desligada), produto inativo ou chave com outros dados.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Venda concluida"),
            @ApiResponse(responseCode = "200", description = "Chave repetida: a venda ja gravada"),
            @ApiResponse(responseCode = "400", description = "Regra do carrinho violada (com campos)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Produto, embalagem ou cliente inexistente (com campo)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Conflito com o caixa, o estoque ou o total",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PostMapping
    public ResponseEntity<VendaResponse> finalizar(@AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody FinalizarVendaRequest request) {
        ResultadoDaVenda resultado = vendasService.finalizarParaUsuario(idUsuario, request);
        return ResponseEntity.status(resultado.criada() ? HttpStatus.CREATED : HttpStatus.OK).body(resultado.venda());
    }

    @Operation(summary = "Vendas, da mais recente (OPERADOR: so as das proprias sessoes)",
            description = "Sem os itens. Sem sessaoId e sem periodo, a sessao atual do usuario; com periodo, todas "
                    + "as que ele pode ver. Paginado: pagina a partir de 0; tamanho de 1 a 100 (padrao 20).",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pagina de vendas"),
            @ApiResponse(responseCode = "400", description = "Filtro, pagina ou tamanho invalido",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping
    public ResponseEntity<PaginaResponse<VendaResponse>> listar(@AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "UUID da sessao de caixa") @RequestParam(required = false) UUID sessaoId,
            @Parameter(description = "CONCLUIDA ou CANCELADA") @RequestParam(required = false) StatusDaVenda status,
            @Parameter(description = "Concluidas a partir desta data (AAAA-MM-DD)")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de,
            @Parameter(description = "Concluidas ate esta data, inclusive (AAAA-MM-DD)")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate ate,
            @Parameter(description = "Numero da venda") @RequestParam(required = false) Long numero,
            @Parameter(description = "Pagina, a partir de 0") @RequestParam(defaultValue = PAGINA_PADRAO) int pagina,
            @Parameter(description = "Itens por pagina, de 1 a 100")
            @RequestParam(defaultValue = TAMANHO_PADRAO) int tamanho) {
        return ResponseEntity.ok(vendasService.listarParaUsuario(idUsuario,
                new FiltroDeVendas(sessaoId, status, de, ate, numero), pagina, tamanho));
    }

    @Operation(summary = "Detalhe da venda com os itens (dono da sessao ou ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Venda"),
            @ApiResponse(responseCode = "404", description = "Venda nao encontrada",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping("/{id}")
    public ResponseEntity<VendaResponse> detalhe(@AuthenticationPrincipal Long idUsuario, @PathVariable UUID id) {
        return ResponseEntity.ok(vendasService.detalheParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Cancela a venda do caixa aberto (dono da sessao ou ADMIN)",
            description = "Estorna o estoque e o caixa. Repetir com o mesmo motivo devolve a venda cancelada; com "
                    + "outro motivo, 409.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Venda cancelada"),
            @ApiResponse(responseCode = "400", description = "Motivo ausente ou longo demais",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Venda nao encontrada",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Caixa nao aberto, venda ja cancelada ou sem dinheiro "
                    + "na gaveta", content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PostMapping("/{id}/cancelamento")
    public ResponseEntity<VendaResponse> cancelar(@AuthenticationPrincipal Long idUsuario, @PathVariable UUID id,
            @Valid @RequestBody CancelamentoRequest request) {
        return ResponseEntity.ok(vendasService.cancelarParaUsuario(idUsuario, id, request));
    }
}
