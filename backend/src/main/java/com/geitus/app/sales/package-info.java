/**
 * Modulo PDV do Geitus (etapa 11; docs/modules/pdv.md, DEC-042).
 *
 * <p>O carrinho vive no navegador; o servidor resolve cada leitura, calcula o
 * carrinho e grava a venda inteira, de forma atomica e idempotente, ao
 * finalizar. Subpacotes:
 * <ul>
 *   <li>{@code sales.carrinho} — regras puras (interpretacao do codigo, a
 *       {@code CalculadoraDaVenda} e a conferencia do estoque) e a montagem do
 *       carrinho na empresa do usuario, com as rotas de itens e de calculo;</li>
 *   <li>{@code sales.venda} — finalizacao, consulta e cancelamento;</li>
 *   <li>{@code sales.configuracao} — "Vender sem estoque" e o desconto maximo
 *       do operador.</li>
 * </ul>
 *
 * <p>Dependencias: {@code catalog} (produto, preco, embalagem, etiqueta),
 * {@code inventory} ({@code EstoqueDaVenda}), {@code cashier}
 * ({@code RecebimentosDoCaixa}, {@code SessoesParaVendas}), {@code customer} e
 * {@code iam}. Nada depende deste pacote: o caixa so declara
 * {@code NumerosDasVendas}, implementada aqui.
 *
 * <p>Isolamento (DEC-016): empresa, usuario e perfil sempre do banco
 * ({@code ResolvedorDoUsuarioAutenticado}); produto, embalagem, cliente e venda
 * buscados na empresa do usuario; o custo nunca sai nas respostas. Excecoes
 * ({@link com.geitus.app.sales.ErroDaVenda}) mapeadas no
 * {@code GlobalExceptionHandler}.
 */
package com.geitus.app.sales;
