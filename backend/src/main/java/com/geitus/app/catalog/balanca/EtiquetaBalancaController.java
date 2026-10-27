package com.geitus.app.catalog.balanca;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.catalog.balanca.dto.ConfiguracaoEtiquetaRequest;
import com.geitus.app.catalog.balanca.dto.ConfiguracaoEtiquetaResponse;
import com.geitus.app.catalog.balanca.dto.SalvarEtiquetaResponse;
import com.geitus.app.catalog.balanca.dto.TesteEtiquetaRequest;
import com.geitus.app.catalog.balanca.dto.TesteEtiquetaResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints da etiqueta de balanca (docs/modules/produtos.md).
 *
 * <p>Controller fino: valida a entrada e delega ao {@link EtiquetaBalancaService}.
 * Recebe so o {@code idUsuario} do JWT, nunca a empresa (DEC-016).
 *
 * <p>RBAC (no {@code SecurityConfig}): leitura e teste para qualquer
 * autenticado; salvar ({@code PUT}) so ADMIN.
 */
@RestController
@RequestMapping("/api/etiqueta-balanca")
@Tag(name = "Etiqueta de balanca", description = "Formato da etiqueta de balanca da empresa do usuario autenticado")
public class EtiquetaBalancaController {

    private final EtiquetaBalancaService etiquetaService;

    public EtiquetaBalancaController(EtiquetaBalancaService etiquetaService) {
        this.etiquetaService = etiquetaService;
    }

    @Operation(summary = "Configuracao da etiqueta de balanca da empresa",
            description = "Sem configuracao salva, devolve o padrao (2 + codigo 6 + valor 6 com 3 casas, sem DV) "
                    + "com padrao: true.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<ConfiguracaoEtiquetaResponse> buscar(@AuthenticationPrincipal Long idUsuario) {
        return ResponseEntity.ok(etiquetaService.buscarParaUsuario(idUsuario));
    }

    @Operation(summary = "Salva a configuracao da etiqueta de balanca (apenas ADMIN)",
            description = "400 com o campo fora do intervalo ou com a soma diferente de 13 digitos. A resposta "
                    + "traz os produtos vendidos na balanca cujo codigo nao cabe na etiqueta (aviso, nao bloqueia).",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PutMapping
    public ResponseEntity<SalvarEtiquetaResponse> salvar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody ConfiguracaoEtiquetaRequest request) {
        return ResponseEntity.ok(etiquetaService.salvarParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Testa a leitura de uma etiqueta com a configuracao informada (ainda nao salva)",
            description = "Le o numero e procura o produto pelo codigo lido na empresa do usuario. Numero fora do "
                    + "formato responde 200 com leitura e produto nulos e a mensagem.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping("/teste")
    public ResponseEntity<TesteEtiquetaResponse> testar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody TesteEtiquetaRequest request) {
        return ResponseEntity.ok(etiquetaService.testarParaUsuario(idUsuario, request));
    }
}
