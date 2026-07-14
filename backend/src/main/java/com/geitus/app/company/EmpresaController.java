package com.geitus.app.company;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.company.dto.AtualizarEmpresaRequest;
import com.geitus.app.company.dto.EmpresaResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints do contexto de empresa do usuario autenticado.
 *
 * <p>Controller fino: valida a entrada (Bean Validation) e delega a regra ao
 * {@link EmpresaService}. A empresa manipulada e sempre a do usuario
 * autenticado (extraida do JWT) — nao existe parametro de identificador de
 * empresa em nenhum endpoint.
 */
@RestController
@RequestMapping("/api/empresas")
@Tag(name = "Empresa", description = "Contexto de empresa do usuario autenticado")
public class EmpresaController {

    private final EmpresaService empresaService;

    public EmpresaController(EmpresaService empresaService) {
        this.empresaService = empresaService;
    }

    @Operation(summary = "Retorna a empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/minha")
    public ResponseEntity<EmpresaResponse> minhaEmpresa(@AuthenticationPrincipal Long idUsuario) {
        return ResponseEntity.ok(empresaService.buscarEmpresaDoUsuario(idUsuario));
    }

    @Operation(summary = "Atualiza o nome da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/minha")
    public ResponseEntity<EmpresaResponse> atualizarMinhaEmpresa(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody AtualizarEmpresaRequest request) {
        return ResponseEntity.ok(empresaService.atualizarNomeDaEmpresa(idUsuario, request.nome()));
    }
}
