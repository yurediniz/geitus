package com.geitus.app.customer;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.customer.dto.ClienteRequest;
import com.geitus.app.customer.dto.ClienteResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

/**
 * Endpoints do modulo Clientes (docs/modules/clientes.md, secao 6).
 *
 * <p>Controller fino: valida a entrada (Bean Validation) e delega as regras ao
 * {@link ClienteService}. Recebe apenas o {@code idUsuario} do JWT — nunca um
 * identificador de empresa (DEC-016). O {@code {id}} das rotas e o UUID publico
 * (DEC-019/029); UUID malformado vira 400 no {@code GlobalExceptionHandler}.
 *
 * <p>RBAC (DEC-029, aplicado no {@code SecurityConfig}): consultar, cadastrar e
 * editar sao liberados a qualquer autenticado; inativar e reativar exigem ADMIN.
 *
 * <p>{@code @Validated} ativa a validacao dos parametros simples (ex.: tamanho
 * da {@code busca}); a violacao vira {@code ConstraintViolationException},
 * tratada como 400 no {@code GlobalExceptionHandler}.
 */
@RestController
@Validated
@RequestMapping("/api/clientes")
@Tag(name = "Clientes", description = "Cadastro e consulta de clientes da empresa do usuario autenticado")
public class ClienteController {

    private static final int TAMANHO_MAXIMO_BUSCA = 100;

    private final ClienteService clienteService;

    public ClienteController(ClienteService clienteService) {
        this.clienteService = clienteService;
    }

    @Operation(summary = "Lista os clientes da empresa do usuario autenticado, ordenados por nome",
            description = "Filtros opcionais: busca (nome, ou digitos de CPF/telefone/WhatsApp) e status.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<List<ClienteResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Nome contendo o termo, ou CPF/telefone/WhatsApp contendo seus digitos")
            @RequestParam(required = false)
            @Size(max = TAMANHO_MAXIMO_BUSCA, message = "Busca deve ter no máximo 100 caracteres.") String busca,
            @Parameter(description = "Filtra por status ativo/inativo")
            @RequestParam(required = false) Boolean ativo) {
        List<ClienteResponse> clientes = clienteService.listarParaUsuario(idUsuario, busca, ativo).stream()
                .map(ClienteResponse::de)
                .toList();
        return ResponseEntity.ok(clientes);
    }

    @Operation(summary = "Busca um cliente pelo identificador publico",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/{id}")
    public ResponseEntity<ClienteResponse> buscar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(ClienteResponse.de(clienteService.buscarParaUsuario(idUsuario, id)));
    }

    @Operation(summary = "Cadastra um cliente na empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping
    public ResponseEntity<ClienteResponse> cadastrar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody ClienteRequest request) {
        Cliente cliente = clienteService.cadastrarParaUsuario(idUsuario, request.paraDados());
        return ResponseEntity.status(HttpStatus.CREATED).body(ClienteResponse.de(cliente));
    }

    @Operation(summary = "Atualiza os dados cadastrais de um cliente (substitui todos os campos)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}")
    public ResponseEntity<ClienteResponse> atualizar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody ClienteRequest request) {
        Cliente cliente = clienteService.atualizarParaUsuario(idUsuario, id, request.paraDados());
        return ResponseEntity.ok(ClienteResponse.de(cliente));
    }

    @Operation(summary = "Inativa um cliente (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<ClienteResponse> inativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(ClienteResponse.de(clienteService.inativarParaUsuario(idUsuario, id)));
    }

    @Operation(summary = "Reativa um cliente (apenas ADMIN)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<ClienteResponse> reativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(ClienteResponse.de(clienteService.reativarParaUsuario(idUsuario, id)));
    }
}
