package com.geitus.app.cashier;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

import com.geitus.app.cashier.sessao.StatusDaSessao;
import com.geitus.app.iam.UsuarioAutenticado;

/**
 * O que o PDV grava no caixa (docs/modules/pdv.md, 3.6, 3.8 e 5.1): a trava da
 * sessao, os recebimentos da venda e os estornos do cancelamento. Declarada
 * aqui e implementada no proprio {@code cashier}, para que o caixa nao conheca
 * a venda alem do id.
 *
 * <p>Todos os metodos exigem a transacao de quem chama e a sessao travada por
 * {@link #travarSessaoParaVenda} ou {@link #travarSessaoDaVenda} antes de
 * gravar (o gatilho da V16 so aceita movimento em sessao aberta). Ordem das
 * travas (DT-032): a sessao primeiro, depois os produtos em ordem de id.
 */
public interface RecebimentosDoCaixa {

    /** A sessao aberta onde a venda vai entrar. */
    record SessaoAbertaParaVenda(Long sessaoId, UUID sessaoUuid, String pontoNome) {
    }

    /** A sessao de uma venda ja gravada, para o cancelamento. */
    record SessaoDaVenda(StatusDaSessao status, Long abertaPor) {
    }

    /**
     * Trava ({@code FOR UPDATE}) a sessao em andamento aberta pelo usuario.
     *
     * @throws CaixaConflitoException 409 "Abra o caixa para vender." sem sessao
     *         ou "Termine o fechamento do caixa antes de vender." em conferencia
     */
    SessaoAbertaParaVenda travarSessaoParaVenda(UsuarioAutenticado usuario);

    /** Um movimento {@code RECEBIMENTO} por forma com valor &gt; 0, ligado a venda. */
    void registrarRecebimentos(Long empresaId, Long sessaoId, Long vendaId, Long usuarioId,
            Map<FormaDePagamento, BigDecimal> recebidos);

    /** Trava ({@code FOR UPDATE}) a sessao da venda e devolve a situacao e o dono. */
    SessaoDaVenda travarSessaoDaVenda(Long empresaId, Long sessaoId);

    /**
     * Um movimento {@code ESTORNO} para cada {@code RECEBIMENTO} gravado da
     * venda, na mesma forma e com o mesmo valor (nada e recalculado; o gatilho
     * da V17 confere o mesmo).
     *
     * @param escondeValor OPERADOR no modo cego: a mensagem sai sem o valor
     * @throws CaixaConflitoException 409 quando o dinheiro a devolver passa do
     *         dinheiro esperado na gaveta
     */
    void registrarEstornos(Long empresaId, Long sessaoId, Long vendaId, Long usuarioId, boolean escondeValor);
}
