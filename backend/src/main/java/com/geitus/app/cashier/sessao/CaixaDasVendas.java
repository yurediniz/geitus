package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.cashier.CaixaConflitoException;
import com.geitus.app.cashier.DadosDoCaixaInvalidosException;
import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.cashier.RecebimentosDoCaixa;
import com.geitus.app.cashier.SessoesParaVendas;
import com.geitus.app.iam.UsuarioAutenticado;

/**
 * Implementacao, no caixa, das interfaces que o PDV usa
 * ({@link RecebimentosDoCaixa} e {@link SessoesParaVendas};
 * docs/modules/pdv.md, 3.6, 3.8 e 3.9). O caixa so conhece o id da venda.
 *
 * <p>As escritas exigem a transacao de quem chama ({@code MANDATORY}) e a
 * sessao ja travada por um dos metodos de trava: o esperado lido aqui nao muda
 * ate o fim da transacao.
 */
@Component
class CaixaDasVendas implements RecebimentosDoCaixa, SessoesParaVendas {

    static final String MENSAGEM_SEM_CAIXA = "Abra o caixa para vender.";
    static final String MENSAGEM_EM_CONFERENCIA = "Termine o fechamento do caixa antes de vender.";
    static final String MENSAGEM_GAVETA_INSUFICIENTE = "Não há dinheiro suficiente na gaveta para devolver (%s).";
    static final String MENSAGEM_GAVETA_INSUFICIENTE_NO_CEGO =
            "Não há dinheiro suficiente na gaveta para devolver.";
    static final String CAMPO_PAGAMENTOS = "pagamentos";

    private final SessaoDeCaixaRepository sessaoRepository;
    private final MovimentoDeCaixaRepository movimentoRepository;
    private final Clock relogio;

    CaixaDasVendas(SessaoDeCaixaRepository sessaoRepository, MovimentoDeCaixaRepository movimentoRepository,
            Clock relogio) {
        this.sessaoRepository = sessaoRepository;
        this.movimentoRepository = movimentoRepository;
        this.relogio = relogio;
    }

    // ---------- RecebimentosDoCaixa ----------

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public SessaoAbertaParaVenda travarSessaoParaVenda(UsuarioAutenticado usuario) {
        SessaoDeCaixa sessao = sessaoRepository.travarEmAndamentoDoUsuario(usuario.empresaId(), usuario.usuarioId())
                .orElseThrow(() -> new CaixaConflitoException(MENSAGEM_SEM_CAIXA));
        if (sessao.getStatus() != StatusDaSessao.ABERTA) {
            throw new CaixaConflitoException(MENSAGEM_EM_CONFERENCIA);
        }
        return new SessaoAbertaParaVenda(sessao.getId(), sessao.getUuid(), sessao.getPonto().getNome());
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void registrarRecebimentos(Long empresaId, Long sessaoId, Long vendaId, Long usuarioId,
            Map<FormaDePagamento, BigDecimal> recebidos) {
        Map<FormaDePagamento, BigDecimal> esperados = EsperadoPorForma.daSessao(movimentoRepository, empresaId,
                sessaoId);
        OffsetDateTime agora = agora();
        recebidos.forEach((forma, valor) -> {
            if (valor.signum() <= 0) {
                return;
            }
            BigDecimal depois = esperados.getOrDefault(forma, BigDecimal.ZERO).add(valor);
            if (depois.compareTo(SessoesDeCaixaService.LIMITE_DO_CAIXA) > 0) {
                throw new DadosDoCaixaInvalidosException(SessoesDeCaixaService.MENSAGEM_LIMITE_DO_CAIXA,
                        CAMPO_PAGAMENTOS);
            }
            movimentoRepository.saveAndFlush(MovimentoDeCaixa.daVenda(empresaId, sessaoId,
                    new MovimentoDeCaixa.DaVenda(TipoDeMovimentoDeCaixa.RECEBIMENTO, forma, valor, vendaId),
                    usuarioId, agora));
        });
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public SessaoDaVenda travarSessaoDaVenda(Long empresaId, Long sessaoId) {
        SessaoDeCaixa sessao = sessaoRepository.travarPorId(empresaId, sessaoId)
                .orElseThrow(() -> new IllegalStateException("Venda sem sessao de caixa."));
        return new SessaoDaVenda(sessao.getStatus(), sessao.getAbertaPor());
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void registrarEstornos(Long empresaId, Long sessaoId, Long vendaId, Long usuarioId,
            boolean escondeValor) {
        List<MovimentoDeCaixa> recebimentos = movimentoRepository.findByEmpresaIdAndVendaIdAndTipo(empresaId,
                vendaId, TipoDeMovimentoDeCaixa.RECEBIMENTO);
        BigDecimal dinheiro = recebimentos.stream()
                .filter(recebimento -> recebimento.getForma() == FormaDePagamento.DINHEIRO)
                .map(MovimentoDeCaixa::getValor)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (dinheiro.signum() > 0) {
            BigDecimal naGaveta = EsperadoPorForma.dinheiro(movimentoRepository, empresaId, sessaoId);
            if (dinheiro.compareTo(naGaveta) > 0) {
                throw new CaixaConflitoException(escondeValor
                        ? MENSAGEM_GAVETA_INSUFICIENTE_NO_CEGO
                        : MENSAGEM_GAVETA_INSUFICIENTE.formatted(Reais.formatar(naGaveta)));
            }
        }
        OffsetDateTime agora = agora();
        for (MovimentoDeCaixa recebimento : recebimentos) {
            movimentoRepository.saveAndFlush(MovimentoDeCaixa.daVenda(empresaId, sessaoId,
                    new MovimentoDeCaixa.DaVenda(TipoDeMovimentoDeCaixa.ESTORNO, recebimento.getForma(),
                            recebimento.getValor(), vendaId), usuarioId, agora));
        }
    }

    // ---------- SessoesParaVendas ----------

    @Override
    @Transactional(readOnly = true)
    public Optional<SessaoParaVenda> atualDoUsuario(UsuarioAutenticado usuario) {
        return sessaoRepository.emAndamentoDoUsuario(usuario.empresaId(), usuario.usuarioId())
                .map(CaixaDasVendas::paraVenda);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SessaoParaVenda> porUuid(Long empresaId, UUID sessaoId) {
        return sessaoRepository.findByEmpresaIdAndUuid(empresaId, sessaoId).map(CaixaDasVendas::paraVenda);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, SessaoParaVenda> porIds(Long empresaId, Collection<Long> sessaoIds) {
        if (sessaoIds.isEmpty()) {
            return Map.of();
        }
        return sessaoRepository.comPontoPorIds(empresaId, sessaoIds).stream()
                .map(CaixaDasVendas::paraVenda)
                .collect(Collectors.toMap(SessaoParaVenda::id, Function.identity()));
    }

    private static SessaoParaVenda paraVenda(SessaoDeCaixa sessao) {
        return new SessaoParaVenda(sessao.getId(), sessao.getUuid(), sessao.getPonto().getNome(), sessao.getStatus(),
                sessao.getAbertaPor());
    }

    private OffsetDateTime agora() {
        return OffsetDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
    }
}
