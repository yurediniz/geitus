package com.geitus.app.sales.dto;

import com.geitus.app.sales.carrinho.CalculadoraDaVenda;

/**
 * Limites e mensagens de formato do carrinho, os mesmos no
 * {@code POST /api/pdv/calculo} e na finalizacao (constantes para as
 * anotacoes). O corpo aceita uma linha a mais que o limite da venda, para a
 * mensagem "A venda atingiu o limite de 300 itens." sair do calculo; acima
 * disso, 400 de formato.
 */
public final class LimitesDoCarrinho {

    public static final int MAXIMO_DE_LINHAS_NO_CORPO = CalculadoraDaVenda.LIMITE_DE_LINHAS + 1;
    public static final int MAXIMO_DE_PAGAMENTOS = 4;
    public static final int TAMANHO_DO_CODIGO_LIDO = 60;
    public static final int TAMANHO_DO_ROTULO = 60;

    public static final String MENSAGEM_ITENS_DEMAIS = CalculadoraDaVenda.MENSAGEM_LIMITE_DE_LINHAS;
    public static final String MENSAGEM_UMA_LINHA_POR_FORMA = "Use uma linha por forma de pagamento.";
    public static final String MENSAGEM_INFORME_OS_ITENS = "Informe os itens.";
    public static final String MENSAGEM_INFORME_O_ITEM = "Informe o item.";
    public static final String MENSAGEM_INFORME_O_PAGAMENTO = "Informe o pagamento.";
    public static final String MENSAGEM_VALOR =
            "Informe um valor com até 2 casas decimais e no máximo 9.999.999.999,99.";
    public static final String MENSAGEM_QUANTIDADE =
            "Informe a quantidade com até 3 casas decimais e no máximo 999.999.999.";
    public static final String MENSAGEM_CODIGO_LIDO_LONGO = "O código lido deve ter até 60 caracteres.";

    private LimitesDoCarrinho() {
        // Apenas constantes.
    }
}
