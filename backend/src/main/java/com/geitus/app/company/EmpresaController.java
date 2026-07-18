package com.geitus.app.company;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.company.dto.EmpresaAtualizarRequest;
import com.geitus.app.company.dto.EmpresaDetalheResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints do cadastro da empresa do usuario autenticado.
 *
 * <p>Controller fino: valida a entrada (Bean Validation) e delega a regra ao
 * {@link EmpresaService}. A empresa manipulada e sempre a do usuario autenticado
 * (extraida do JWT) — nao existe parametro de identificador de empresa em nenhum
 * endpoint (DEC-016).
 *
 * <p>RBAC: a leitura ({@code GET}) e liberada a qualquer autenticado; a edicao
 * ({@code PATCH}) exige perfil ADMIN — restricao aplicada no {@code SecurityConfig}
 * (OPERADOR recebe 403).
 */
@RestController
@RequestMapping("/api/empresas")
@Tag(name = "Empresa", description = "Cadastro da empresa do usuario autenticado")
public class EmpresaController {

    private final EmpresaService empresaService;

    public EmpresaController(EmpresaService empresaService) {
        this.empresaService = empresaService;
    }

    @Operation(summary = "Retorna o cadastro da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/minha")
    public ResponseEntity<EmpresaDetalheResponse> minhaEmpresa(@AuthenticationPrincipal Long idUsuario) {
        return ResponseEntity.ok(empresaService.buscarEmpresaDoUsuario(idUsuario));
    }

    @Operation(summary = "Atualiza o cadastro da empresa do usuario autenticado (requer ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/minha")
    public ResponseEntity<EmpresaDetalheResponse> atualizarMinhaEmpresa(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody EmpresaAtualizarRequest request) {
        return ResponseEntity.ok(empresaService.atualizarEmpresa(idUsuario, request));
    }
}
