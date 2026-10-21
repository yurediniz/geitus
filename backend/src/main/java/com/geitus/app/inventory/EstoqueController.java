package com.geitus.app.inventory;

import java.util.UUID;

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

import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.inventory.EstoqueService.ResultadoAjuste;
import com.geitus.app.inventory.dto.AjusteEstoqueRequest;
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints de estoque do produto (docs/modules/produtos-estoque.md, 5).
 *
 * <p>Controller fino: valida a entrada e delega ao {@link EstoqueService}. Recebe
 * so o {@code idUsuario} do JWT; a empresa e o usuario do movimento sao
 * resolvidos pelo service (DEC-016). O {@code {id}} e o UUID publico do produto
 * (DEC-019). RBAC no {@code SecurityConfig}: o ajuste cai na regra
 * {@code POST /api/produtos/**} (ADMIN) e a leitura dos movimentos na
 * {@code GET /api/produtos/**} (qualquer autenticado).
 */
@RestController
@RequestMapping("/api/produtos/{id}/estoque")
@Tag(name = "Estoque", description = "Saldo e movimentacoes de estoque dos produtos da empresa do usuario autenticado")
public class EstoqueController {

    private static final String PAGINA_PADRAO = "0";
    private static final String TAMANHO_PADRAO = "20";

    private final EstoqueService estoqueService;

    public EstoqueController(EstoqueService estoqueService) {
        this.estoqueService = estoqueService;
    }

    @Operation(summary = "Registra um ajuste de estoque do produto (ADMIN)",
            description = "Entrada, saida ou \"contar e ajustar para\" o saldo informado, com motivo. 201 quando "
                    + "grava; 200 com o movimento ja gravado quando a chave se repete com os mesmos dados; 409 "
                    + "quando a chave ja foi usada com outros dados; 400 para saldo insuficiente, fracao em "
                    + "unidade nao fracionada, motivo fora do tipo ou produto sem controle de estoque.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping("/ajustes")
    public ResponseEntity<MovimentoEstoqueResponse> ajustar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody AjusteEstoqueRequest request) {
        ResultadoAjuste resultado = estoqueService.ajustarParaUsuario(idUsuario, id, request);
        HttpStatus status = resultado.criado() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(resultado.movimento());
    }

    @Operation(summary = "Movimentos de estoque do produto, do mais recente para o mais antigo",
            description = "Paginado: pagina a partir de 0; tamanho de 1 a 100 (padrao 20). Produto de outra "
                    + "empresa responde 404.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/movimentos")
    public ResponseEntity<PaginaResponse<MovimentoEstoqueResponse>> movimentos(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Parameter(description = "Pagina, a partir de 0")
            @RequestParam(defaultValue = PAGINA_PADRAO) int pagina,
            @Parameter(description = "Itens por pagina, de 1 a 100")
            @RequestParam(defaultValue = TAMANHO_PADRAO) int tamanho) {
        return ResponseEntity.ok(estoqueService.movimentosParaUsuario(idUsuario, id, pagina, tamanho));
    }
}
