package com.geitus.app.iam;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.iam.dto.LoginRequest;
import com.geitus.app.iam.dto.LoginResponse;
import com.geitus.app.iam.dto.UsuarioResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints de autenticacao do Geitus.
 *
 * <p>Controller fino: valida a entrada (Bean Validation) e delega a regra ao
 * {@link AuthService}.
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Autenticacao", description = "Login e dados do usuario autenticado")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @Operation(summary = "Autentica um usuario e retorna um token JWT")
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @Operation(summary = "Retorna os dados do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/me")
    public ResponseEntity<UsuarioResponse> me(@AuthenticationPrincipal Long idUsuario) {
        return ResponseEntity.ok(authService.buscarUsuarioAutenticado(idUsuario));
    }
}
