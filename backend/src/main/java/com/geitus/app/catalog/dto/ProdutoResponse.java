package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import com.geitus.app.catalog.MargemEMarkup;
import com.geitus.app.catalog.PrecoAplicado;
import com.geitus.app.catalog.PrecoDeVenda;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ResumoDeEstoque;
import com.geitus.app.catalog.SituacaoEstoque;
import com.geitus.app.catalog.categoria.CategoriaArvore;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de um {@link Produto}.
 *
 * <p>O {@code id} e o UUID publico do produto (DEC-019): nenhum id numerico
 * interno sai na resposta (nem do produto nem dos codigos de barras).
 *
 * <p>Nao inclui {@code empresaId} nem a empresa: a empresa e implicita ao
 * usuario autenticado (ele so enxerga produtos da propria empresa), entao nao
 * ha necessidade de expor esse dado na resposta. A entidade JPA nunca deve ser
 * exposta diretamente na API (ver CLAUDE.md).
 *
 * <p>Unidade de venda e categoria saem como resumos com o
 * UUID publico ({@link UnidadeResumo}, {@link CategoriaResumo}); o caminho da
 * categoria vem da {@link CategoriaArvore} da empresa, montada uma vez por
 * requisicao pelo service (nao uma vez por produto).
 *
 * <p>{@code margem} e {@code markup} sao derivados (nao tem coluna): calculados
 * a partir de {@code precoVenda} e {@code custo}, alinhados ao principio
 * "calcular automaticamente" do CLAUDE.md. Ambos ficam {@code null} quando o
 * custo (ou o preco, para a margem) nao permite o calculo.
 *
 * <p>Fase C: {@code promocao} (com a situacao calculada para {@code hoje}) e
 * {@code atacado} saem {@code null} quando nao existem; {@code emPromocao} e
 * {@code true} so com a promocao vigente.
 *
 * <p>Fase D (docs/modules/produtos-estoque.md, 5): {@code estoqueAtual} e o
 * saldo guardado, mesmo com o controle desligado; {@code situacaoEstoque} e
 * calculada e vem {@code null} sem controle.
 *
 * <p>Fase B3 (docs/modules/produtos-embalagens.md, 7): {@code embalagens} na
 * ordem, com o preco efetivo na data de {@code hoje}; {@code codigosBarras}
 * continua so com os codigos da unidade de venda.
 *
 * <p>Fase B2 (docs/modules/produtos-codigo-e-balanca.md, 8): {@code numero}
 * (numero de registro na empresa), {@code codigo} (sem zeros a esquerda, ou
 * {@code null}) e {@code vendidoBalanca}.
 */
@Schema(description = "Dados publicos de um produto")
public record ProdutoResponse(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        @Schema(description = "Numero de registro do produto na empresa (1, 2, 3...), gerado na criacao e imutavel",
                example = "15")
        Long numero,
        String nome,
        @Schema(description = "Nome curto informado; null se nao houver")
        String nomeCurto,
        @Schema(description = "Nome para cupom e PDV: o nome curto ou os 30 primeiros caracteres do nome")
        String nomeCurtoEfetivo,
        @Schema(description = "Categoria com o caminho na arvore; null se sem categoria")
        CategoriaResumo categoria,
        String marca,
        @Schema(description = "Fornecedor principal; null se nao houver")
        String fornecedor,
        @Schema(description = "Unidade de venda")
        UnidadeResumo unidade,
        String descricao,
        BigDecimal precoVenda,
        BigDecimal custo,
        BigDecimal precoMinimo,
        @Schema(description = "Promocao com a situacao na data de hoje; null se nao houver")
        PromocaoResponse promocao,
        @Schema(description = "Se a promocao esta vigente hoje")
        boolean emPromocao,
        @Schema(description = "Preco de atacado; null se nao houver")
        AtacadoResponse atacado,
        BigDecimal estoqueMinimo,
        BigDecimal estoqueMaximo,
        BigDecimal pontoReposicao,
        @Schema(description = "Se o produto controla estoque")
        boolean controlaEstoque,
        @Schema(description = "Saldo atual (derivado dos movimentos); guardado mesmo com o controle desligado",
                example = "12.000")
        BigDecimal estoqueAtual,
        @Schema(description = "NORMAL, BAIXO ou SEM_ESTOQUE; null sem controle de estoque")
        SituacaoEstoque situacaoEstoque,
        @Schema(description = "Codigos de barras na ordem (o primeiro e o principal)")
        List<CodigoBarrasResponse> codigosBarras,
        @Schema(description = "Embalagens na ordem, com o preco efetivo de hoje")
        List<EmbalagemResponse> embalagens,
        String sku,
        @Schema(description = "Codigo do produto (1 a 999999); null se nao houver", example = "542")
        Integer codigo,
        @Schema(description = "Se o produto e vendido na balanca")
        boolean vendidoBalanca,
        boolean ativo,
        @Schema(description = "Se o produto pode ser excluido: sem movimentacao de estoque ou so com o estoque "
                + "inicial do cadastro")
        boolean podeExcluir,
        @Schema(description = "Margem sobre a venda em %: (preco - custo) / preco * 100. Null se sem custo/preco.")
        BigDecimal margem,
        @Schema(description = "Marcacao sobre o custo em %: (preco - custo) / custo * 100. Null se sem custo.")
        BigDecimal markup,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    /**
     * Monta a resposta do produto. {@code arvore} e a arvore de categorias da
     * empresa do produto (so e consultada quando o produto tem categoria);
     * {@code podeExcluir} vem da regra centralizada no {@code ProdutoService};
     * {@code hoje} e a data do relogio da aplicacao (fuso de Sao Paulo), calculada
     * uma vez por requisicao, que decide a situacao da promocao; {@code estoque}
     * vem do pacote de estoque, em lote na listagem.
     */
    public static ProdutoResponse de(Produto produto, CategoriaArvore arvore, boolean podeExcluir,
            LocalDate hoje, ResumoDeEstoque estoque) {
        BigDecimal preco = produto.getPrecoVenda();
        BigDecimal custo = produto.getCusto();
        PromocaoResponse promocao = PromocaoResponse.deOuNulo(produto, hoje);
        return new ProdutoResponse(
                produto.getUuid(),
                produto.getNumero(),
                produto.getNome(),
                produto.getNomeCurto(),
                produto.nomeCurtoEfetivo(),
                CategoriaResumo.deOuNulo(produto.getCategoria(), arvore),
                produto.getMarca(),
                produto.getFornecedor(),
                UnidadeResumo.deOuNulo(produto.getUnidade()),
                produto.getDescricao(),
                preco,
                custo,
                produto.getPrecoMinimo(),
                promocao,
                promocao != null && promocao.vigente(),
                AtacadoResponse.deOuNulo(produto),
                produto.getEstoqueMinimo(),
                produto.getEstoqueMaximo(),
                produto.getPontoReposicao(),
                produto.isControlaEstoque(),
                estoque.saldo(),
                SituacaoEstoque.de(produto.isControlaEstoque(), estoque.saldo(), produto.getPontoReposicao(),
                        produto.getEstoqueMinimo()),
                produto.getCodigosBarras().stream().map(CodigoBarrasResponse::de).toList(),
                embalagens(produto, hoje),
                produto.getSku(),
                produto.getCodigo(),
                produto.isVendidoBalanca(),
                produto.isAtivo(),
                podeExcluir,
                MargemEMarkup.margem(preco, custo),
                MargemEMarkup.markup(preco, custo),
                produto.getCriadoEm(),
                produto.getAtualizadoEm());
    }

    /** Embalagens com o preco efetivo; o preco vigente da unidade e calculado uma vez por produto. */
    private static List<EmbalagemResponse> embalagens(Produto produto, LocalDate hoje) {
        if (produto.getEmbalagens().isEmpty()) {
            return List.of();
        }
        PrecoAplicado vigente = PrecoDeVenda.vigenteSemAtacado(produto, hoje);
        return produto.getEmbalagens().stream()
                .map(embalagem -> EmbalagemResponse.de(embalagem, produto.getCusto(), vigente))
                .toList();
    }
}
