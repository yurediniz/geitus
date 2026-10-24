package com.geitus.app.cashier.configuracao;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.cashier.configuracao.dto.ConfiguracaoDoCaixaRequest;
import com.geitus.app.cashier.configuracao.dto.ConfiguracaoDoCaixaResponse;
import com.geitus.app.shared.error.ApiError;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Configuracao do caixa (docs/modules/caixa.md, 5.2). Leitura para qualquer
 * autenticado; o {@code PUT} exige ADMIN no {@code SecurityConfig}.
 */
@RestController
@RequestMapping("/api/configuracoes/caixa")
@Tag(name = "Configuracoes", description = "Configuracoes da empresa do usuario autenticado")
public class ConfiguracaoDoCaixaController {

    private final ConfiguracaoDoCaixaService configuracaoService;

    public ConfiguracaoDoCaixaController(ConfiguracaoDoCaixaService configuracaoService) {
        this.configuracaoService = configuracaoService;
    }

    @Operation(summary = "Configuracao do caixa (modo de fechamento)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Configuracao (o padrao quando nunca foi alterada)"),
            @ApiResponse(responseCode = "401", description = "Sem token ou token invalido",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping
    public ResponseEntity<ConfiguracaoDoCaixaResponse> buscar(@AuthenticationPrincipal Long idUsuario) {
        return ResponseEntity.ok(configuracaoService.buscarParaUsuario(idUsuario));
    }

    @Operation(summary = "Altera o modo de fechamento do caixa (ADMIN)",
            description = "Registra quem alterou e quando. Sessoes ja contadas guardam o modo da contagem.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Configuracao gravada"),
            @ApiResponse(responseCode = "400", description = "Corpo sem fechamentoCego",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "403", description = "Perfil sem permissao",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PutMapping
    public ResponseEntity<ConfiguracaoDoCaixaResponse> salvar(@AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody ConfiguracaoDoCaixaRequest request) {
        return ResponseEntity.ok(configuracaoService.salvarParaUsuario(idUsuario, request));
    }
}
