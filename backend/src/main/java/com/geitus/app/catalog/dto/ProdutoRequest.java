package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.geitus.app.shared.json.InteiroSemCasasDecimais;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para cadastro ou atualizacao de um produto.
 *
 * <p>Nao inclui {@code empresaId} nem {@code ativo}: a empresa e sempre
 * derivada do usuario autenticado (nunca informada pelo cliente) e o status
 * do produto e gerenciado apenas pelos endpoints dedicados de inativar e
 * reativar.
 *
 * <p>Unidade de venda e categoria sao referenciadas pelo UUID publico do cadastro correspondente (docs/modules/categorias-e-unidades.md,
 * 5.2); o service confirma que pertencem a empresa do usuario (404 se nao).
 *
 * <p>Os tamanhos maximos e a precisao numerica espelham as colunas das
 * migrations V3/V4/V6/V7 ({@code nome VARCHAR(150)}, {@code nome_curto VARCHAR(30)},
 * {@code descricao VARCHAR(1000)},
 * {@code sku}/{@code produto_codigos_barras.codigo VARCHAR(50)},
 * {@code preco_venda}/{@code custo}/{@code preco_minimo NUMERIC(12,2)},
 * {@code estoque_minimo}/{@code estoque_maximo}/{@code ponto_reposicao NUMERIC(12,3)}). O {@code @Digits} garante um 400
 * amigavel em vez de um erro de banco quando o cliente envia casas a mais.
 *
 * <p>{@code codigosBarras} e a lista completa (0 a 20). No PATCH, uma lista
 * substitui a lista inteira ({@code []} remove todos) e o campo ausente ou
 * {@code null} MANTEM os codigos atuais; no cadastro, {@code null} e "sem
 * codigos". Normalizacao, formato, repeticao e unicidade na empresa ficam no
 * service (spec 4.3).
 *
 * <p>Fase C (docs/modules/produtos-precos.md, 5): {@code promocao} e
 * {@code atacado} nulos ou ausentes significam "sem promocao" e "sem atacado",
 * como os demais opcionais (a excecao de {@code codigosBarras} nao vale aqui).
 * Os blocos sao validados em cascata ({@code @Valid}), com os erros nas chaves
 * aninhadas ({@code promocao.preco}, {@code atacado.quantidadeMinima}...).
 *
 * <p>Fase D (docs/modules/produtos-estoque.md, 5): {@code controlaEstoque} e
 * obrigatorio no POST e no PATCH. {@code estoqueInicial} so vale no POST (no
 * PATCH, 400): vira a primeira entrada de estoque. O saldo nunca e editado por
 * aqui; muda so por movimentos ({@code /api/produtos/{id}/estoque/ajustes}).
 *
 * <p>Fase B3 (docs/modules/produtos-embalagens.md, 7): {@code embalagens} e a
 * lista completa, com o mesmo comportamento de {@code codigosBarras} (no PATCH,
 * ausente mantem as atuais). A antiga unidade de compra + fator virou a
 * embalagem "de compra".
 *
 * <p>Fase B2 (docs/modules/produtos-codigo-e-balanca.md, 2 e 8): {@code codigo}
 * e o codigo do produto (inteiro de 1 a 999999, opcional; no JSON, numero — o
 * frontend remove os zeros a esquerda) e {@code vendidoBalanca} ({@code null} =
 * {@code false}) exige o codigo. O {@code numero} de registro NUNCA e aceito:
 * nao existe neste DTO, entao um {@code "numero"} no JSON e ignorado.
 */
@Schema(description = "Dados para cadastro ou atualizacao de um produto")
public record ProdutoRequest(

        @Schema(example = "Arroz 5kg")
        @NotBlank(message = "Nome é obrigatório.")
        @Size(max = 150, message = "Nome deve ter no máximo 150 caracteres.")
        String nome,

        @Schema(description = "Nome para cupom e PDV; vazio usa os 30 primeiros caracteres do nome",
                example = "Golden Frango 15kg")
        @Size(max = 30, message = "Nome curto deve ter no máximo 30 caracteres.")
        String nomeCurto,

        @Schema(example = "Arroz branco tipo 1, pacote de 5kg.")
        @Size(max = 1000, message = "Descrição deve ter no máximo 1000 caracteres.")
        String descricao,

        @Schema(description = "UUID da unidade de venda (obrigatoria)")
        @NotNull(message = "Unidade é obrigatória.")
        UUID unidadeId,

        @Schema(description = "UUID da categoria (opcional)")
        UUID categoriaId,

        @Schema(example = "25.90")
        @NotNull(message = "Preço de venda é obrigatório.")
        @DecimalMin(value = "0.0", message = "Preço de venda não pode ser negativo.")
        @Digits(integer = 10, fraction = 2, message = "Preço de venda deve ter no máximo 2 casas decimais.")
        BigDecimal precoVenda,

        @Schema(example = "18.00")
        @DecimalMin(value = "0.0", message = "Custo não pode ser negativo.")
        @Digits(integer = 10, fraction = 2, message = "Custo deve ter no máximo 2 casas decimais.")
        BigDecimal custo,

        @Schema(example = "2")
        @DecimalMin(value = "0.0", message = "Estoque mínimo não pode ser negativo.")
        @Digits(integer = 9, fraction = 3, message = "Estoque mínimo deve ter no máximo 3 casas decimais.")
        BigDecimal estoqueMinimo,

        @Schema(example = "50")
        @DecimalMin(value = "0.0", message = "Estoque máximo não pode ser negativo.")
        @Digits(integer = 9, fraction = 3, message = "Estoque máximo deve ter no máximo 3 casas decimais.")
        BigDecimal estoqueMaximo,

        @Schema(example = "10")
        @DecimalMin(value = "0.0", message = "Ponto de reposição não pode ser negativo.")
        @Digits(integer = 9, fraction = 3, message = "Ponto de reposição deve ter no máximo 3 casas decimais.")
        BigDecimal pontoReposicao,

        @Schema(example = "20.00")
        @DecimalMin(value = "0.0", message = "Preço mínimo não pode ser negativo.")
        @Digits(integer = 10, fraction = 2, message = "Preço mínimo deve ter no máximo 2 casas decimais.")
        BigDecimal precoMinimo,

        @Schema(description = "Codigos de barras na ordem (o primeiro e o principal). Lista informada substitui "
                + "a lista inteira ([] remove todos); no PATCH, ausente ou null mantem os codigos atuais; "
                + "no cadastro, ausente ou null = sem codigos",
                example = "[\"7891000315507\"]")
        @Size(max = 20, message = "Informe no máximo 20 códigos de barras.")
        List<@Size(max = 50, message = "Código de barras deve ter no máximo 50 caracteres.") String> codigosBarras,

        @Schema(description = "Embalagens na ordem (ate 10). Lista informada substitui a lista inteira ([] remove "
                + "todas; embalagem sem id e nova, embalagem ausente e removida com os codigos); no PATCH, ausente "
                + "ou null mantem as atuais; no cadastro, ausente ou null = sem embalagens")
        @Size(max = 10, message = "Informe no máximo 10 embalagens.")
        List<@NotNull(message = "Informe a embalagem.") @Valid EmbalagemRequest> embalagens,

        @Schema(example = "SKU-001")
        @Size(max = 50, message = "SKU deve ter no máximo 50 caracteres.")
        String sku,

        @Schema(description = "Codigo do produto (1 a 999999), unico na empresa; obrigatorio com vendidoBalanca. "
                + "Exibido sem zeros a esquerda", example = "542")
        @Min(value = 1, message = "O código do produto deve ter de 1 a 6 dígitos.")
        @Max(value = 999999, message = "O código do produto deve ter de 1 a 6 dígitos.")
        @JsonDeserialize(using = InteiroSemCasasDecimais.class)
        Integer codigo,

        @Schema(description = "Se o produto e vendido na balanca (exige codigo); null ou ausente = false",
                example = "false")
        Boolean vendidoBalanca,

        @Schema(description = "Promocao (preco, inicio e fim); null ou ausente = sem promocao")
        @Valid
        PromocaoRequest promocao,

        @Schema(description = "Atacado (preco e quantidade minima); null ou ausente = sem atacado")
        @Valid
        AtacadoRequest atacado,

        @Schema(description = "Se o produto controla estoque; desligar guarda o saldo e o historico",
                example = "true")
        @NotNull(message = "Informe se o produto controla estoque.")
        Boolean controlaEstoque,

        @Schema(description = "Estoque inicial (opcional, maior que zero), so no cadastro; registrado como a "
                + "primeira entrada. Fracao so em unidade fracionada.", example = "12")
        @Digits(integer = 9, fraction = 3, message = "O estoque inicial deve ter no máximo 9 dígitos inteiros e 3 casas decimais.")
        BigDecimal estoqueInicial) {
}
