package com.geitus.app.sales.configuracao;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.sales.configuracao.dto.ConfiguracaoDoPdvRequest;
import com.geitus.app.sales.configuracao.dto.ConfiguracaoDoPdvResponse;
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
 * Configuracao do PDV (docs/modules/pdv.md, 5.3). Leitura para qualquer
 * autenticado; o {@code PUT} exige ADMIN no {@code SecurityConfig} e no perfil
 * do banco.
 */
@RestController
@RequestMapping("/api/configuracoes/pdv")
@Tag(name = "Configuracoes", description = "Configuracoes da empresa do usuario autenticado")
public class ConfiguracaoDoPdvController {

    private final ConfiguracaoDoPdvService configuracaoService;

    public ConfiguracaoDoPdvController(ConfiguracaoDoPdvService configuracaoService) {
        this.configuracaoService = configuracaoService;
    }

    @Operation(summary = "Configuracao do PDV (vender sem estoque e desconto maximo do operador)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Configuracao (os padroes quando nunca foi alterada)"),
            @ApiResponse(responseCode = "401", description = "Sem token ou token invalido",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping
    public ResponseEntity<ConfiguracaoDoPdvResponse> buscar(@AuthenticationPrincipal Long idUsuario) {
        return ResponseEntity.ok(configuracaoService.buscarParaUsuario(idUsuario));
    }

    @Operation(summary = "Altera a configuracao do PDV (ADMIN)", description = "Registra quem alterou e quando.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Configuracao gravada"),
            @ApiResponse(responseCode = "400", description = "Campo ausente ou desconto fora de 0 a 100",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "403", description = "Perfil sem permissao",
                    content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @PutMapping
    public ResponseEntity<ConfiguracaoDoPdvResponse> salvar(@AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody ConfiguracaoDoPdvRequest request) {
        return ResponseEntity.ok(configuracaoService.salvarParaUsuario(idUsuario, request));
    }
}
