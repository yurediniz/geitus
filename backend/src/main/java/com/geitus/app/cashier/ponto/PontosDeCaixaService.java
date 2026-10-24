package com.geitus.app.cashier.ponto;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.geitus.app.cashier.CaixaConflitoException;
import com.geitus.app.cashier.CaixaNaoEncontradoException;
import com.geitus.app.cashier.DadosDoCaixaInvalidosException;
import com.geitus.app.cashier.ViolacaoDeConstraint;
import com.geitus.app.cashier.ponto.dto.PontoDeCaixaRequest;
import com.geitus.app.cashier.ponto.dto.PontoDeCaixaResponse;
import com.geitus.app.cashier.ponto.dto.SituacaoDoPontoResponse;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;

/**
 * Regras dos pontos de caixa (docs/modules/caixa.md, 3.1).
 *
 * <p>A empresa vem sempre do usuario do JWT (DEC-016); ponto de outra empresa
 * responde 404. O perfil ADMIN da escrita e exigido no {@code SecurityConfig}.
 * As alteracoes travam a linha do ponto, a mesma trava da abertura de caixa:
 * inativar nao cruza com uma abertura no mesmo ponto.
 */
@Service
public class PontosDeCaixaService {

    static final String CAMPO_NOME = "nome";
    static final String NOME_DO_PRIMEIRO_PONTO = "Caixa 1";
    static final int TAMANHO_MAXIMO_DO_NOME = 40;
    static final int LIMITE_DE_PONTOS = 50;

    static final String MENSAGEM_NOME_VAZIO = "Informe o nome do ponto de caixa.";
    static final String MENSAGEM_NOME_LONGO = "O nome do ponto de caixa deve ter até 40 caracteres.";
    static final String MENSAGEM_NOME_REPETIDO = "Já existe um ponto de caixa com este nome.";
    static final String MENSAGEM_LIMITE = "A empresa já tem o limite de 50 pontos de caixa.";
    static final String MENSAGEM_FECHE_ANTES_DE_INATIVAR = "Feche o caixa deste ponto antes de inativá-lo.";
    public static final String MENSAGEM_PONTO_INATIVO = "Este ponto de caixa está inativo.";

    private static final String CONSTRAINT_DO_NOME = "uq_ponto_caixa_nome";

    private final PontoDeCaixaRepository pontoRepository;
    private final SessoesAbertasPorPonto sessoesAbertas;
    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final Clock relogio;
    private final TransactionTemplate transacao;
    private final TransactionTemplate transacaoDeLeitura;

    public PontosDeCaixaService(PontoDeCaixaRepository pontoRepository, SessoesAbertasPorPonto sessoesAbertas,
            ResolvedorDoUsuarioAutenticado resolvedor, Clock relogio,
            PlatformTransactionManager gerenciadorDeTransacoes) {
        this.pontoRepository = pontoRepository;
        this.sessoesAbertas = sessoesAbertas;
        this.resolvedor = resolvedor;
        this.relogio = relogio;
        this.transacao = new TransactionTemplate(gerenciadorDeTransacoes);
        this.transacaoDeLeitura = new TransactionTemplate(gerenciadorDeTransacoes);
        this.transacaoDeLeitura.setReadOnly(true);
    }

    // ---------- API publica (empresa sempre do usuario do JWT) ----------

    /**
     * Pontos da empresa com a situacao e o ultimo fundo de troco. Antes, a
     * empresa que nunca teve ponto ganha o "Caixa 1", numa transacao propria.
     */
    public List<PontoDeCaixaResponse> listarParaUsuario(Long idUsuario, Boolean ativo) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        garantirPrimeiroPonto(empresaId);
        return transacaoDeLeitura.execute(status -> {
            Map<Long, SituacaoDoPonto> situacoes = sessoesAbertas.situacoes(empresaId);
            Map<Long, BigDecimal> ultimosFundos = sessoesAbertas.ultimosFundos(empresaId);
            return pontoRepository.listar(empresaId, ativo).stream()
                    .map(ponto -> resposta(ponto, situacoes, ultimosFundos))
                    .toList();
        });
    }

    @Transactional
    public PontoDeCaixaResponse cadastrarParaUsuario(Long idUsuario, PontoDeCaixaRequest request) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        String nome = nomeValidado(request.nome());
        if (pontoRepository.countByEmpresaId(empresaId) >= LIMITE_DE_PONTOS) {
            throw new CaixaConflitoException(MENSAGEM_LIMITE);
        }
        garantirNomeLivre(empresaId, nome, null);
        PontoDeCaixa ponto = gravar(new PontoDeCaixa(empresaId, nome, agora()));
        return respostaDe(ponto);
    }

    @Transactional
    public PontoDeCaixaResponse renomearParaUsuario(Long idUsuario, UUID pontoId, PontoDeCaixaRequest request) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        String nome = nomeValidado(request.nome());
        PontoDeCaixa ponto = travar(empresaId, pontoId);
        garantirNomeLivre(empresaId, nome, ponto.getId());
        ponto.renomear(nome, agora());
        return respostaDe(gravar(ponto));
    }

    /** So sem sessao aberta ou em conferencia no ponto (409). */
    @Transactional
    public PontoDeCaixaResponse inativarParaUsuario(Long idUsuario, UUID pontoId) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        PontoDeCaixa ponto = travar(empresaId, pontoId);
        if (sessoesAbertas.temSessaoAberta(empresaId, ponto.getId())) {
            throw new CaixaConflitoException(MENSAGEM_FECHE_ANTES_DE_INATIVAR);
        }
        ponto.inativar(agora());
        return respostaDe(gravar(ponto));
    }

    @Transactional
    public PontoDeCaixaResponse reativarParaUsuario(Long idUsuario, UUID pontoId) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        PontoDeCaixa ponto = travar(empresaId, pontoId);
        ponto.reativar(agora());
        return respostaDe(gravar(ponto));
    }

    // ---------- Uso do modulo (abertura de caixa) ----------

    /**
     * O ponto travado para abrir caixa, na transacao de quem chama: 404 se nao
     * existe na empresa e 409 se esta inativo. A trava poe em fila a abertura
     * e a inativacao do mesmo ponto.
     */
    @Transactional
    public PontoDeCaixa buscarAtivoParaAbrir(Long empresaId, UUID pontoId) {
        PontoDeCaixa ponto = travar(empresaId, pontoId);
        if (!ponto.isAtivo()) {
            throw new CaixaConflitoException(MENSAGEM_PONTO_INATIVO, "pontoId");
        }
        return ponto;
    }

    // ---------- "Caixa 1" automatico ----------

    /**
     * Cria o "Caixa 1" para a empresa que nunca teve ponto (nem inativo). Duas
     * consultas ao mesmo tempo correm para a mesma insercao: a perdedora cai
     * em {@code uq_ponto_caixa_nome} e e tratada como "ja existe".
     */
    private void garantirPrimeiroPonto(Long empresaId) {
        if (pontoRepository.existsByEmpresaId(empresaId)) {
            return;
        }
        try {
            transacao.executeWithoutResult(status ->
                    pontoRepository.saveAndFlush(new PontoDeCaixa(empresaId, NOME_DO_PRIMEIRO_PONTO, agora())));
        } catch (DataIntegrityViolationException violacao) {
            if (!ViolacaoDeConstraint.violou(violacao, CONSTRAINT_DO_NOME)) {
                throw violacao;
            }
        }
    }

    // ---------- Apoio ----------

    private PontoDeCaixa travar(Long empresaId, UUID pontoId) {
        return pontoRepository.travarPorUuid(empresaId, pontoId).orElseThrow(CaixaNaoEncontradoException::ponto);
    }

    private static String nomeValidado(String nome) {
        String aparado = nome == null ? "" : nome.strip();
        if (aparado.isEmpty()) {
            throw new DadosDoCaixaInvalidosException(MENSAGEM_NOME_VAZIO, CAMPO_NOME);
        }
        if (aparado.length() > TAMANHO_MAXIMO_DO_NOME) {
            throw new DadosDoCaixaInvalidosException(MENSAGEM_NOME_LONGO, CAMPO_NOME);
        }
        return aparado;
    }

    /** 409 no campo {@code nome} se outro ponto da empresa ja usa o nome (sem diferenciar maiusculas). */
    private void garantirNomeLivre(Long empresaId, String nome, Long pontoAtualId) {
        pontoRepository.buscarPorNome(empresaId, nome)
                .filter(outro -> !outro.getId().equals(pontoAtualId))
                .ifPresent(outro -> {
                    throw new CaixaConflitoException(MENSAGEM_NOME_REPETIDO, CAMPO_NOME);
                });
    }

    /** Grava ja conferindo a unicidade no banco: a corrida de dois nomes iguais vira o mesmo 409. */
    private PontoDeCaixa gravar(PontoDeCaixa ponto) {
        try {
            return pontoRepository.saveAndFlush(ponto);
        } catch (DataIntegrityViolationException violacao) {
            if (ViolacaoDeConstraint.violou(violacao, CONSTRAINT_DO_NOME)) {
                throw new CaixaConflitoException(MENSAGEM_NOME_REPETIDO, CAMPO_NOME);
            }
            throw violacao;
        }
    }

    private PontoDeCaixaResponse respostaDe(PontoDeCaixa ponto) {
        Long empresaId = ponto.getEmpresaId();
        return resposta(ponto, sessoesAbertas.situacoes(empresaId), sessoesAbertas.ultimosFundos(empresaId));
    }

    private PontoDeCaixaResponse resposta(PontoDeCaixa ponto, Map<Long, SituacaoDoPonto> situacoes,
            Map<Long, BigDecimal> ultimosFundos) {
        return new PontoDeCaixaResponse(ponto.getUuid(), ponto.getNome(), ponto.isAtivo(),
                ultimosFundos.get(ponto.getId()), SituacaoDoPontoResponse.de(situacoes.get(ponto.getId()), relogio));
    }

    private OffsetDateTime agora() {
        return OffsetDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
    }
}
