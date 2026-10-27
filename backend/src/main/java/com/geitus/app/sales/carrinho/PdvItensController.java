package com.geitus.app.sales.carrinho;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.dto.ItemResolvidoResponse;
import com.geitus.app.sales.dto.LimitesDoCarrinho;
import com.geitus.app.sales.dto.ProdutoDoPdvResponse;
import com.geitus.app.shared.error.ApiError;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Leitura de codigo e busca por nome no PDV (docs/modules/pdv.md).
 * Controller fino: delega a {@link ResolucaoDeItens}. Uma rota, dois usos pelo
 * parametro: {@code ?codigo=} ou {@code ?busca=}, um ou outro. Os dois juntos,
 * ou nenhum, respondem 400. Texto longo demais e recusado (400), nunca
 * recortado.
 */
@RestController
@RequestMapping("/api/pdv/itens")
@Tag(name = "PDV", description = "Venda no balcao: itens, calculo, vendas e cancelamento")
public class PdvItensController {

    static final String MENSAGEM_PARAMETROS = "Informe o código ou o texto da busca.";
    static final String MENSAGEM_BUSCA_LONGA = "A busca deve ter até 100 caracteres.";
    private static final int TAMANHO_MAXIMO_DA_BUSCA = 100;

    private final ResolucaoDeItens resolucao;

    public PdvItensController(ResolucaoDeItens resolucao) {
        this.resolucao = resolucao;
    }

    @Operation(summary = "Resolve o codigo lido: etiqueta de balanca, codigo*quantidade, codigo do produto ou "
            + "codigo de barras", security = @SecurityRequirement(name = "bearer-jwt"))
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Item para o carrinho"),
            @ApiResponse(responseCode = "400", description = "Quantidade invalida ou codigo longo (campo codigo)",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Codigo nao encontrado",
                    content = @Content(schema = @Schema(implementation = ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Produto inativo ou estoque insuficiente com \"Vender "
                    + "sem estoque\" desligada", content = @Content(schema = @Schema(implementation = ApiError.class)))
    })
    @GetMapping(params = {"codigo", "!busca"})
    public ResponseEntity<ItemResolvidoResponse> resolver(@AuthenticationPrincipal Long idUsuario,
            @RequestParam String codigo) {
        exigirAte(codigo, LimitesDoCarrinho.TAMANHO_DO_CODIGO_LIDO, LimitesDoCarrinho.MENSAGEM_CODIGO_LIDO_LONGO,
                InterpretadorDeCodigo.CAMPO);
        return ResponseEntity.ok(resolucao.resolverParaUsuario(idUsuario, codigo));
    }

    @Operation(summary = "Busca ate 20 produtos ativos por nome, codigo ou codigo de barras",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping(params = {"busca", "!codigo"})
    public ResponseEntity<List<ProdutoDoPdvResponse>> buscar(@AuthenticationPrincipal Long idUsuario,
            @RequestParam String busca) {
        exigirAte(busca, TAMANHO_MAXIMO_DA_BUSCA, MENSAGEM_BUSCA_LONGA, "busca");
        return ResponseEntity.ok(resolucao.buscarParaUsuario(idUsuario, busca));
    }

    /** Sem {@code codigo} e sem {@code busca}, ou com os dois: 400. */
    @Operation(summary = "Pedido sem codigo nem busca, ou com os dois (400)",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<ItemResolvidoResponse> semParametroUnico() {
        throw new DadosDaVendaInvalidosException(MENSAGEM_PARAMETROS, null);
    }

    private static void exigirAte(String texto, int tamanhoMaximo, String mensagem, String campo) {
        if (texto.length() > tamanhoMaximo) {
            throw new DadosDaVendaInvalidosException(mensagem, campo);
        }
    }
}
