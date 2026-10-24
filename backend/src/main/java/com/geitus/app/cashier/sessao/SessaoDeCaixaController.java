package com.geitus.app.cashier.sessao;

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

import com.geitus.app.cashier.sessao.SessoesDeCaixaService.ResultadoDaOperacao;
import com.geitus.app.cashier.sessao.dto.AbrirCaixaRequest;
import com.geitus.app.cashier.sessao.dto.ContagemRequest;
import com.geitus.app.cashier.sessao.dto.FechamentoRequest;
import com.geitus.app.cashier.sessao.dto.MovimentoDeCaixaRequest;
import com.geitus.app.cashier.sessao.dto.SessaoDeCaixaResponse;
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
 * Sessoes de caixa (docs/modules/caixa.md, 5.2). Controller fino: recebe so o
 * {@code idUsuario} do JWT e delega ao {@link SessoesDeCaixaService}. O
 * {@code {id}} e o UUID publico da sessao. Todas as rotas valem para qualquer
 * autenticado; a regra "dono ou ADMIN" fica no service (OPERADOR em sessao de
 * outra pessoa recebe 404).
 */
@RestController
@RequestMapping("/api/caixa/sessoes")
@Tag(name = "Caixa", description = "Pontos de caixa, sessoes, movimentos e fechamento da empresa do usuario")
public class SessaoDeCaixaController {

    private static final String PAGINA_PADRAO = "0";
    private static final String TAMANHO_PADRAO = "20";

    private final SessoesDeCaixaService sessoesService;

    public SessaoDeCaixaController(SessoesDeCaixaService sessoesService) {
        this.sessoesService = sessoesService;
    }

    @Operation(summary = "Caixa aberto (ou em conferencia) pelo usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Sessao atual do usuario"),
            @ApiResponse(responseCode = "204", description = "O usuario nao tem caixa aberto", content = @Content)
    })
    @GetMapping("/atual")
    public ResponseEntity<SessaoDeCaixaResponse> atual(@AuthenticationPrincipal Long idUsuario) {
        return sessoesService.atualParaUsuario(idUsuario)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Operation(summary = "Abre o caixa num ponto com o fundo de troco",
            description = "201 quando abre; 200 com a sessao ja aberta quando a chave se repete com os mesmos "
                    + "dados; 409 com ponto ocupado, ponto inativo, usuario com outro caixa ou chave usada com "
                    + "outros dados.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Caixa aberto"),
            @ApiResponse(responseCode = "200", description = "Chave repetida: a sessao ja aberta"),
            @ApiResponse(responseCode = "400", description = "Dados invalidos (com campos)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Ponto nao encontrado na empresa",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Conflito com o estado do caixa",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PostMapping
    public ResponseEntity<SessaoDeCaixaResponse> abrir(@AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody AbrirCaixaRequest request) {
        return comStatus(sessoesService.abrirParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Registra sangria ou suprimento (dono ou ADMIN)",
            description = "201 quando grava; 200 com a sessao quando a chave se repete com os mesmos dados; 400 "
                    + "quando o suprimento passa do limite do caixa; 409 com caixa em conferencia ou fechado, "
                    + "sangria acima do dinheiro na gaveta ou chave usada com outros dados.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Movimento registrado"),
            @ApiResponse(responseCode = "200", description = "Chave repetida: a sessao sem novo movimento"),
            @ApiResponse(responseCode = "400", description = "Dados invalidos ou limite do caixa (com campos)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Sessao nao encontrada",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Conflito com o estado do caixa",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PostMapping("/{id}/movimentos")
    public ResponseEntity<SessaoDeCaixaResponse> lancar(@AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id, @Valid @RequestBody MovimentoDeCaixaRequest request) {
        return comStatus(sessoesService.lancarParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Registra a contagem da gaveta (dono ou ADMIN)",
            description = "Sem diferenca, fecha. Com diferenca: no modo cego vai para EM_CONFERENCIA; no modo "
                    + "nao cego fecha se vier a justificativa. Repetir com o mesmo valor devolve o resultado "
                    + "gravado; outro valor, 409.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Contagem registrada"),
            @ApiResponse(responseCode = "400", description = "Dados invalidos ou justificativa no modo cego",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Sessao nao encontrada",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Contagem ja registrada com outro valor",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PostMapping("/{id}/contagem")
    public ResponseEntity<SessaoDeCaixaResponse> contar(@AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id, @Valid @RequestBody ContagemRequest request) {
        return ResponseEntity.ok(sessoesService.contarParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Fecha o caixa em conferencia com a justificativa (dono ou ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Caixa fechado (ou ja fechado com a mesma justificativa)"),
            @ApiResponse(responseCode = "400", description = "Justificativa ausente ou longa demais",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Sessao nao encontrada",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Caixa sem contagem ou ja fechado",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PostMapping("/{id}/fechamento")
    public ResponseEntity<SessaoDeCaixaResponse> fechar(@AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id, @Valid @RequestBody FechamentoRequest request) {
        return ResponseEntity.ok(sessoesService.fecharParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Historico de sessoes, da mais recente (OPERADOR: so as suas)",
            description = "Sem os movimentos. Filtros opcionais: ponto, situacao e periodo de abertura (datas "
                    + "em America/Sao_Paulo). Paginado: pagina a partir de 0; tamanho de 1 a 100 (padrao 20).",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pagina de sessoes"),
            @ApiResponse(responseCode = "400", description = "Filtro, pagina ou tamanho invalido",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping
    public ResponseEntity<PaginaResponse<SessaoDeCaixaResponse>> historico(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "UUID do ponto de caixa") @RequestParam(required = false) UUID pontoId,
            @Parameter(description = "ABERTA, EM_CONFERENCIA ou FECHADA")
            @RequestParam(required = false) StatusDaSessao status,
            @Parameter(description = "Abertas a partir desta data (AAAA-MM-DD)")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de,
            @Parameter(description = "Abertas ate esta data, inclusive (AAAA-MM-DD)")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate ate,
            @Parameter(description = "Pagina, a partir de 0") @RequestParam(defaultValue = PAGINA_PADRAO) int pagina,
            @Parameter(description = "Itens por pagina, de 1 a 100")
            @RequestParam(defaultValue = TAMANHO_PADRAO) int tamanho) {
        return ResponseEntity.ok(sessoesService.historicoParaUsuario(idUsuario,
                new FiltroDeSessoes(pontoId, status, de, ate), pagina, tamanho));
    }

    @Operation(summary = "Detalhe da sessao com os movimentos (dono ou ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Sessao"),
            @ApiResponse(responseCode = "404", description = "Sessao nao encontrada",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping("/{id}")
    public ResponseEntity<SessaoDeCaixaResponse> detalhe(@AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(sessoesService.detalheParaUsuario(idUsuario, id));
    }

    private static ResponseEntity<SessaoDeCaixaResponse> comStatus(ResultadoDaOperacao resultado) {
        HttpStatus status = resultado.criada() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(resultado.sessao());
    }
}
