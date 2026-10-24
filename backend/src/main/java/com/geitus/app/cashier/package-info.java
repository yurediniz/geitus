/**
 * Modulo Caixa do Geitus (etapa 10; docs/modules/caixa.md, DEC-041).
 *
 * <p>O caixa controla o dinheiro da gaveta de um ponto de caixa durante uma
 * sessao: fundo de troco na abertura, sangrias e suprimentos no meio do dia e
 * a contagem no fechamento, cego ou com o esperado visivel.
 *
 * <p>Subpacotes:
 * <ul>
 *   <li>{@code cashier.ponto} — pontos de caixa ("Caixa 1", "Caixa 2"), com o
 *       "Caixa 1" garantido na primeira consulta de quem nunca teve ponto;</li>
 *   <li>{@code cashier.configuracao} — modo de fechamento (cego por padrao);</li>
 *   <li>{@code cashier.sessao} — sessoes, movimentos imutaveis, contagem e
 *       fechamento. O esperado e sempre a soma dos movimentos; o fechamento e
 *       uma fotografia gravada na sessao.</li>
 * </ul>
 *
 * <p>PDV (etapa 11, DEC-042): os movimentos tem forma de pagamento; a venda
 * entra por {@link com.geitus.app.cashier.RecebimentosDoCaixa} (trava da
 * sessao, recebimentos e estornos) e le as sessoes por
 * {@link com.geitus.app.cashier.SessoesParaVendas}, ambas implementadas aqui;
 * o numero da venda nos movimentos vem de
 * {@link com.geitus.app.cashier.NumerosDasVendas}, implementada pelo PDV. O
 * caixa nao depende do {@code sales}.
 *
 * <p>Dependencias: {@code iam} (usuario autenticado) e {@code company}
 * (empresa). O pacote de ponto nao depende do de sessao: le a situacao dos
 * pontos pela interface {@code SessoesAbertasPorPonto}.
 *
 * <p>Isolamento (DEC-016): empresa e usuario sempre do JWT, resolvidos pelo
 * {@code ResolvedorDoUsuarioAutenticado}; recurso de outra empresa e sessao de
 * outra pessoa para o OPERADOR respondem 404. Horarios em {@code TIMESTAMPTZ},
 * do {@code Clock} unico, e nas respostas no fuso {@code America/Sao_Paulo}.
 *
 * <p>Excecoes mapeadas no {@code GlobalExceptionHandler}:
 * {@link com.geitus.app.cashier.CaixaNaoEncontradoException} (404),
 * {@link com.geitus.app.cashier.CaixaConflitoException} (409) e
 * {@link com.geitus.app.cashier.DadosDoCaixaInvalidosException} (400).
 */
package com.geitus.app.cashier;
