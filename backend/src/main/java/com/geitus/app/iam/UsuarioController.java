package com.geitus.app.iam;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.iam.dto.AlterarSenhaRequest;
import com.geitus.app.iam.dto.RedefinirSenhaRequest;
import com.geitus.app.iam.dto.UsuarioAtualizarRequest;
import com.geitus.app.iam.dto.UsuarioCriarRequest;
import com.geitus.app.iam.dto.UsuarioResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints de gestao de usuarios (dominio {@code iam}).
 *
 * <p>Controller fino: valida a entrada (Bean Validation) e delega toda a regra
 * ao {@link UsuarioService}. Cada endpoint recebe apenas {@code idUsuario}
 * (extraido do JWT via {@code @AuthenticationPrincipal}); a empresa manipulada
 * e sempre resolvida pelo service a partir do usuario autenticado (DEC-016).
 *
 * <p>Autorizacao (RBAC) e aplicada no {@code SecurityConfig}: as rotas de gestao
 * exigem perfil ADMIN; apenas {@code PATCH /api/usuarios/me/senha} e liberada a
 * qualquer usuario autenticado (troca da propria senha).
 */
@RestController
@RequestMapping("/api/usuarios")
@Tag(name = "Usuarios", description = "Gestao de usuarios da empresa do usuario autenticado")
public class UsuarioController {

    private final UsuarioService usuarioService;

    public UsuarioController(UsuarioService usuarioService) {
        this.usuarioService = usuarioService;
    }

    @Operation(summary = "Lista os usuarios da empresa do usuario autenticado",
            description = "Aceita filtros opcionais de busca (nome/e-mail), status ativo/inativo e perfil.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<List<UsuarioResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Filtra por nome ou e-mail contendo o termo")
            @RequestParam(required = false) String busca,
            @Parameter(description = "Filtra por status ativo/inativo")
            @RequestParam(required = false) Boolean ativo,
            @Parameter(description = "Filtra por perfil (ADMIN ou OPERADOR)")
            @RequestParam(required = false) String perfil) {
        return ResponseEntity.ok(usuarioService.listarParaUsuario(idUsuario, busca, ativo, perfil));
    }

    @Operation(summary = "Busca um usuario por id, limitado a empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/{id}")
    public ResponseEntity<UsuarioResponse> buscarPorId(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable Long id) {
        return ResponseEntity.ok(usuarioService.buscarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Cria um usuario na empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping
    public ResponseEntity<UsuarioResponse> criar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody UsuarioCriarRequest request) {
        UsuarioResponse criado = usuarioService.criarParaUsuario(idUsuario, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(criado);
    }

    @Operation(summary = "Edita nome e perfil de um usuario da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}")
    public ResponseEntity<UsuarioResponse> atualizar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable Long id,
            @Valid @RequestBody UsuarioAtualizarRequest request) {
        return ResponseEntity.ok(usuarioService.atualizarParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Inativa um usuario da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<UsuarioResponse> inativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable Long id) {
        return ResponseEntity.ok(usuarioService.inativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Reativa um usuario da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<UsuarioResponse> reativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable Long id) {
        return ResponseEntity.ok(usuarioService.reativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Redefine a senha de um usuario da empresa (acao administrativa)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/senha")
    public ResponseEntity<Void> redefinirSenha(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable Long id,
            @Valid @RequestBody RedefinirSenhaRequest request) {
        usuarioService.redefinirSenhaParaUsuario(idUsuario, id, request);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Troca a propria senha (exige a senha atual)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/me/senha")
    public ResponseEntity<Void> alterarPropriaSenha(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody AlterarSenhaRequest request) {
        usuarioService.alterarPropriaSenhaParaUsuario(idUsuario, request);
        return ResponseEntity.noContent().build();
    }
}
