package com.geitus.app.inventory.dto;

import java.math.BigDecimal;
import java.util.UUID;

import com.geitus.app.inventory.MotivoMovimento;
import com.geitus.app.inventory.TipoMovimento;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Ajuste manual de estoque (docs/modules/produtos-estoque.md, 4.2 a 4.5 e 5).
 *
 * <p>Nao tem empresa nem usuario: os dois vem sempre do usuario autenticado. A
 * {@code quantidade} e a informada na tela: a quantidade da entrada ou da
 * saida, ou o saldo contado no ajuste. Precisao e limite espelham o
 * {@code NUMERIC(12,3)} da V9. A {@code chave} (UUID gerado ao abrir o modal)
 * torna o pedido idempotente. As regras que dependem do produto (fracao,
 * saldo, motivo do tipo, observacao em "Outro") ficam no service.
 */
@Schema(description = "Ajuste manual de estoque do produto")
public record AjusteEstoqueRequest(

        @Schema(description = "ENTRADA, SAIDA ou AJUSTE (contar e ajustar para o saldo informado)",
                example = "SAIDA")
        @NotNull(message = "Informe o tipo do movimento.")
        TipoMovimento tipo,

        @Schema(description = "Quantidade da entrada ou da saida (maior que zero), ou o saldo contado no ajuste "
                + "(zero ou mais). Ate 3 casas decimais; fracao so em unidade fracionada.", example = "2")
        @NotNull(message = "Informe a quantidade.")
        @DecimalMin(value = "0", message = "A quantidade não pode ser negativa.")
        @Digits(integer = 9, fraction = 3, message = "A quantidade deve ter no máximo 9 dígitos inteiros e 3 casas decimais.")
        BigDecimal quantidade,

        @Schema(description = "Motivo do tipo escolhido (ESTOQUE_INICIAL e VENDA sao do sistema)",
                example = "PERDA_AVARIA")
        @NotNull(message = "Informe o motivo.")
        MotivoMovimento motivo,

        @Schema(description = "Observacao (ate 200 caracteres); obrigatoria no motivo OUTRO",
                example = "Caixa amassada")
        @Size(max = 200, message = "A observação deve ter no máximo 200 caracteres.")
        String observacao,

        @Schema(description = "Chave de idempotencia (UUID gerado ao abrir o modal); repetir a chave devolve o "
                + "movimento ja gravado")
        @NotNull(message = "Informe a chave da operação.")
        UUID chave) {
}
