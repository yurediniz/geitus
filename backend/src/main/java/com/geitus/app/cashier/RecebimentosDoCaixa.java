package com.geitus.app.cashier;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.geitus.app.cashier.sessao.StatusDaSessao;
import com.geitus.app.iam.UsuarioAutenticado;

/**
 * O que o PDV grava no caixa (docs/modules/pdv.md): a trava da
 * sessao, os recebimentos da venda, os estornos do cancelamento e os
 * reembolsos da devolucao (estoque.md, secao 6.2). Declarada
 * aqui e implementada no proprio {@code cashier}, para que o caixa nao conheca
 * a venda alem do id.
 *
 * <p>Todos os metodos exigem a transacao de quem chama e a sessao travada por
 * {@link #travarSessaoParaVenda}, {@link #travarSessaoParaDevolucao} ou
 * {@link #travarSessaoDaVenda} antes de
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

    /** O reembolso de uma devolucao numa forma (valor na escala do dinheiro). */
    record Reembolso(FormaDePagamento forma, BigDecimal valor) {
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

    /**
     * Trava ({@code FOR UPDATE}) a sessao em andamento aberta por quem devolve
     * (o reembolso sai dela, que pode nao ser a da venda).
     *
     * @throws CaixaConflitoException 409 "Abra o caixa para devolver." sem sessao
     *         ou "Termine o fechamento do caixa antes de devolver." em conferencia
     */
    SessaoAbertaParaVenda travarSessaoParaDevolucao(UsuarioAutenticado usuario);

    /** O ja reembolsado da venda por forma (todas as devolucoes); a forma sem reembolso fica fora. */
    Map<FormaDePagamento, BigDecimal> reembolsadoPorForma(Long empresaId, Long vendaId);

    /**
     * Um movimento {@code DEVOLUCAO} por forma com valor &gt; 0, ligado a venda e
     * a devolucao, na sessao de quem devolve. No debito, no credito e no PIX o
     * estorno e feito na maquininha ou no banco e so registrado aqui: o
     * esperado dessas formas pode ficar negativo.
     *
     * @throws CaixaConflitoException 409 quando o dinheiro a devolver passa do
     *         dinheiro esperado na gaveta
     */
    void registrarReembolsos(Long empresaId, Long sessaoId, Long vendaId, Long devolucaoId, Long usuarioId,
            List<Reembolso> reembolsos);

    /** Os reembolsos de cada devolucao (id interno), na ordem das formas; numa consulta. */
    Map<Long, List<Reembolso>> reembolsosDasDevolucoes(Long empresaId, Collection<Long> devolucaoIds);
}
