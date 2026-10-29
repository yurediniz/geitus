package com.geitus.app.catalog;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geitus.app.catalog.dto.HistoricoPrecoResponse;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.dto.SkuSugestaoResponse;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
import com.geitus.app.shared.paginacao.PaginaResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Endpoints do modulo Produtos.
 *
 * <p>Controller fino: valida a entrada (Bean Validation) e delega toda a
 * regra de negocio ao {@link ProdutoService}. Todo endpoint recebe apenas
 * {@code idUsuario} (extraido do JWT via {@code @AuthenticationPrincipal}) —
 * nunca um identificador de empresa vindo de path, query ou corpo da
 * requisicao. A empresa manipulada e sempre resolvida pelo service a partir
 * do usuario autenticado (DEC-016), o mesmo padrao usado em
 * {@code EmpresaController}/{@code EmpresaService}.
 *
 * <p>O {@code {id}} das rotas e o UUID publico do produto (DEC-019); UUID
 * malformado responde 400 pelo handler global. RBAC (DEC-025) no
 * {@code SecurityConfig}: escrita, exclusao e sugestao de SKU exigem ADMIN;
 * leitura (inclusive o historico de precos) fica com qualquer autenticado.
 * Fase B5: as sugestoes de marca e fornecedor em texto sairam (viraram os
 * cadastros {@code /api/marcas} e {@code /api/fornecedores}).
 */
@RestController
@RequestMapping("/api/produtos")
@Tag(name = "Produtos", description = "Cadastro e consulta de produtos da empresa do usuario autenticado")
public class ProdutoController {

    private static final String PAGINA_PADRAO = "0";
    private static final String TAMANHO_PADRAO_HISTORICO = "20";

    private final ProdutoService produtoService;

    public ProdutoController(ProdutoService produtoService) {
        this.produtoService = produtoService;
    }

    @Operation(summary = "Lista os produtos da empresa do usuario autenticado, paginada",
            description = "Busca sem diferenciar maiusculas nem acentos por nome, nome curto, SKU e marca (cada "
                    + "palavra, ate 5, em qualquer ordem) ou por parte de qualquer codigo de barras; um termo so "
                    + "de digitos tambem encontra o produto pelo numero ou pelo codigo do produto, sem zeros a "
                    + "esquerda (\"0542\" = 542). Filtros "
                    + "combinados com E; categoria de outra empresa ou inexistente devolve pagina vazia. Valor "
                    + "invalido em status, estoque, ordem, promocao, pagina ou tamanho responde 400. Pagina alem "
                    + "do fim devolve itens vazio com o totalItens real.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping
    public ResponseEntity<PaginaResponse<ProdutoResponse>> listar(
            @AuthenticationPrincipal Long idUsuario,
            @Parameter(description = "Termo de busca (texto, parte de um codigo de barras, ou numero/codigo do "
                    + "produto quando so de digitos), ate 200 caracteres",
                    schema = @Schema(maxLength = ParametrosDaListagem.TAMANHO_MAXIMO_DA_BUSCA))
            @RequestParam(required = false) String busca,
            @Parameter(description = "Status dos produtos",
                    schema = @Schema(allowableValues = { "ativos", "inativos", "todos" }, defaultValue = "ativos"))
            @RequestParam(required = false) String status,
            @Parameter(description = "UUID da categoria; inclui as subcategorias")
            @RequestParam(required = false) UUID categoria,
            @Parameter(description = "Situacoes do estoque, combinadas com OU (parametro repetido ou separado "
                    + "por virgula): negativo, zerado, baixo, reposicao, regular ou alto; so produtos que "
                    + "controlam estoque",
                    array = @ArraySchema(schema = @Schema(allowableValues = { "negativo", "zerado", "baixo",
                            "reposicao", "regular", "alto" })))
            @RequestParam(required = false) List<String> estoque,
            @Parameter(description = "true: so produtos com promocao vigente hoje",
                    schema = @Schema(allowableValues = { "true", "false" }, defaultValue = "false"))
            @RequestParam(required = false) String promocao,
            @Parameter(description = "Ordenacao; o prefixo - inverte a direcao",
                    schema = @Schema(allowableValues = { "nome", "-nome", "preco", "-preco", "margem", "-margem",
                            "estoque", "-estoque", "recentes", "atualizados" }, defaultValue = "nome"))
            @RequestParam(required = false) String ordem,
            @Parameter(description = "Pagina, a partir de 0", schema = @Schema(type = "integer", defaultValue = "0",
                    minimum = "0"))
            @RequestParam(required = false) Integer pagina,
            @Parameter(description = "Itens por pagina, de 1 a 100", schema = @Schema(type = "integer",
                    defaultValue = "25", minimum = "1", maximum = "100"))
            @RequestParam(required = false) Integer tamanho) {
        ParametrosDaListagem parametros = ParametrosDaListagem.daRequisicao(busca, status, categoria, estoque,
                promocao, ordem, pagina, tamanho);
        return ResponseEntity.ok(produtoService.listarParaUsuario(idUsuario, parametros));
    }

    @Operation(summary = "Sugere o proximo SKU no padrao P + 6 digitos (ADMIN)",
            description = "Nao reserva o SKU: a unicidade e conferida ao salvar.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/sku/sugestao")
    public ResponseEntity<SkuSugestaoResponse> sugerirSku(@AuthenticationPrincipal Long idUsuario) {
        return ResponseEntity.ok(new SkuSugestaoResponse(produtoService.sugerirSkuParaUsuario(idUsuario)));
    }

    @Operation(summary = "Busca um produto pelo UUID, limitado a empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/{id}")
    public ResponseEntity<ProdutoResponse> buscarPorId(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(produtoService.buscarPorIdParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Historico de custo e preco de venda do produto, do mais recente para o mais antigo",
            description = "Paginado: pagina a partir de 0; tamanho de 1 a 100 (padrao 20). Produto de outra "
                    + "empresa responde 404.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @GetMapping("/{id}/historico-precos")
    public ResponseEntity<PaginaResponse<HistoricoPrecoResponse>> historicoDePrecos(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Parameter(description = "Pagina, a partir de 0")
            @RequestParam(defaultValue = PAGINA_PADRAO) int pagina,
            @Parameter(description = "Itens por pagina, de 1 a 100")
            @RequestParam(defaultValue = TAMANHO_PADRAO_HISTORICO) int tamanho) {
        return ResponseEntity.ok(produtoService.historicoDePrecosParaUsuario(idUsuario, id, pagina, tamanho));
    }

    @Operation(summary = "Cadastra um novo produto na empresa do usuario autenticado",
            description = "Com estoqueInicial (exige controlaEstoque), registra a primeira entrada de estoque "
                    + "na mesma transacao. O numero de registro e gerado aqui (1, 2, 3... por empresa) e nunca "
                    + "muda. codigo repetido na empresa responde 409 (campo codigo); vendidoBalanca sem codigo ou "
                    + "com codigo maior que a etiqueta de balanca, 400.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PostMapping
    public ResponseEntity<ProdutoResponse> cadastrar(
            @AuthenticationPrincipal Long idUsuario,
            @Valid @RequestBody ProdutoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(produtoService.cadastrarParaUsuario(idUsuario, request));
    }

    @Operation(summary = "Atualiza um produto da empresa do usuario autenticado",
            description = "Substitui a lista inteira de codigos de barras pela informada. estoqueInicial nao e "
                    + "aceito (400: use o ajuste de estoque); produto com movimentacao de estoque nao troca a "
                    + "unidade de venda (400). O numero de registro nunca muda (numero no corpo e ignorado); "
                    + "as regras de codigo e vendidoBalanca sao as do cadastro. Como os demais opcionais, codigo "
                    + "e vendidoBalanca ausentes sao gravados como nulo e false (diferente de codigosBarras, que "
                    + "ausente mantem a lista atual).",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}")
    public ResponseEntity<ProdutoResponse> atualizar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id,
            @Valid @RequestBody ProdutoRequest request) {
        return ResponseEntity.ok(produtoService.atualizarDadosBasicosParaUsuario(idUsuario, id, request));
    }

    @Operation(summary = "Inativa um produto da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/inativar")
    public ResponseEntity<ProdutoResponse> inativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(produtoService.inativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Reativa um produto da empresa do usuario autenticado",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PatchMapping("/{id}/reativar")
    public ResponseEntity<ProdutoResponse> reativar(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        return ResponseEntity.ok(produtoService.reativarParaUsuario(idUsuario, id));
    }

    @Operation(summary = "Exclui um produto sem movimentacao de estoque (ADMIN)",
            description = "Permitido sem movimentos ou quando o unico movimento e o estoque inicial do cadastro "
                    + "(apagado junto com o saldo); 409 com qualquer outro movimento. Os codigos de barras e o "
                    + "historico de precos sao excluidos junto.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(
            @AuthenticationPrincipal Long idUsuario,
            @PathVariable UUID id) {
        produtoService.excluirParaUsuario(idUsuario, id);
        return ResponseEntity.noContent().build();
    }
}
