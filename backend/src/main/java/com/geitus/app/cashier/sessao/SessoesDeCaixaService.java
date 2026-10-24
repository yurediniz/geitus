package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
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
import com.geitus.app.cashier.configuracao.ConfiguracaoDoCaixaService;
import com.geitus.app.cashier.ponto.PontoDeCaixa;
import com.geitus.app.cashier.ponto.PontoDeCaixaRepository;
import com.geitus.app.cashier.ponto.PontosDeCaixaService;
import com.geitus.app.cashier.sessao.ConsultaDeSessoes.Criterios;
import com.geitus.app.cashier.sessao.ConsultaDeSessoes.PaginaDeSessoes;
import com.geitus.app.cashier.sessao.MovimentoDeCaixa.Lancamento;
import com.geitus.app.cashier.sessao.SessaoDeCaixa.Registro;
import com.geitus.app.cashier.sessao.dto.AbrirCaixaRequest;
import com.geitus.app.cashier.sessao.dto.ContagemRequest;
import com.geitus.app.cashier.sessao.dto.FechamentoRequest;
import com.geitus.app.cashier.sessao.dto.MovimentoDeCaixaRequest;
import com.geitus.app.cashier.sessao.dto.SessaoDeCaixaResponse;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.shared.paginacao.PaginaResponse;
import com.geitus.app.shared.paginacao.Paginacao;

/**
 * Regras das sessoes de caixa (docs/modules/caixa.md, 3.2 a 3.8).
 *
 * <p>Lancamento, contagem e fechamento seguem sempre a mesma ordem: resolver
 * o usuario (empresa e perfil do banco), travar a sessao por
 * {@code (empresa, uuid)}, aplicar a regra do dono (OPERADOR em sessao de
 * outra pessoa responde 404, como recurso de outra empresa), conferir o
 * estado, calcular o esperado, validar e gravar. A trava poe em fila tudo o
 * que mexe na mesma sessao: o esperado lido nao muda ate o fim da transacao.
 *
 * <p>Idempotencia (spec 3.7): abertura e lancamentos pela chave, como no
 * {@code EstoqueService} (busca antes de gravar; a corrida que chega a
 * {@code uq_movimento_caixa_chave} e tratada como repeticao numa transacao
 * nova); contagem e fechamento pelo estado gravado. As corridas de abertura
 * que chegam aos indices parciais viram o 409 de ponto ocupado ou de usuario
 * com caixa, identificados pelo nome da constraint.
 */
@Service
public class SessoesDeCaixaService {

    static final String CAMPO_VALOR = "valor";
    static final String CAMPO_MOTIVO = "motivo";
    static final String CAMPO_TIPO = "tipo";
    static final String CAMPO_JUSTIFICATIVA = "justificativa";

    /** Maior valor de {@code NUMERIC(12,2)}: vale para cada valor e para o esperado resultante. */
    static final BigDecimal LIMITE_DO_CAIXA = new BigDecimal("9999999999.99");
    static final int TAMANHO_MAXIMO_DO_MOTIVO = 200;

    static final String MENSAGEM_PONTO_OCUPADO = "O %s já está aberto por %s.";
    static final String MENSAGEM_USUARIO_COM_CAIXA = "Você já tem um caixa aberto no %s.";
    static final String MENSAGEM_CHAVE_COM_OUTROS_DADOS = "Esta operação já foi registrada com outros dados.";
    static final String MENSAGEM_EM_CONFERENCIA = "O caixa está em conferência. Termine o fechamento.";
    static final String MENSAGEM_JA_FECHADO = "Este caixa já foi fechado.";
    static final String MENSAGEM_LIMITE_DO_CAIXA = "O valor passa do limite do caixa.";
    static final String MENSAGEM_SANGRIA_ACIMA = "A sangria passa do dinheiro na gaveta (%s).";
    static final String MENSAGEM_SANGRIA_ACIMA_NO_CEGO = "A sangria passa do dinheiro esperado na gaveta.";
    static final String MENSAGEM_TIPO_NAO_LANCAVEL = "Escolha sangria ou suprimento.";
    static final String MENSAGEM_MOTIVO_VAZIO = "Informe o motivo.";
    static final String MENSAGEM_MOTIVO_LONGO = "O motivo deve ter até 200 caracteres.";
    static final String MENSAGEM_JUSTIFICATIVA_NO_CEGO = "Informe a justificativa depois de ver a diferença.";
    static final String MENSAGEM_CONTAGEM_REGISTRADA = "A contagem deste caixa já foi registrada.";
    static final String MENSAGEM_CONTE_ANTES_DE_FECHAR = "Conte o dinheiro da gaveta antes de fechar o caixa.";

    private static final String CONSTRAINT_DA_CHAVE = "uq_movimento_caixa_chave";
    private static final String CONSTRAINT_DO_PONTO = "uq_sessao_caixa_ponto_aberta";
    private static final String CONSTRAINT_DO_USUARIO = "uq_sessao_caixa_usuario_aberta";
    private static final int CASAS_DO_DINHEIRO = 2;

    private final SessaoDeCaixaRepository sessaoRepository;
    private final ConsultaDeSessoes consultaDeSessoes;
    private final MovimentoDeCaixaRepository movimentoRepository;
    private final PontosDeCaixaService pontosService;
    private final PontoDeCaixaRepository pontoRepository;
    private final ConfiguracaoDoCaixaService configuracaoService;
    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final RespostasDaSessao respostas;
    private final Clock relogio;
    private final TransactionTemplate transacao;

    public SessoesDeCaixaService(SessaoDeCaixaRepository sessaoRepository, ConsultaDeSessoes consultaDeSessoes,
            MovimentoDeCaixaRepository movimentoRepository, PontosDeCaixaService pontosService,
            PontoDeCaixaRepository pontoRepository, ConfiguracaoDoCaixaService configuracaoService,
            ResolvedorDoUsuarioAutenticado resolvedor, RespostasDaSessao respostas, Clock relogio,
            PlatformTransactionManager gerenciadorDeTransacoes) {
        this.sessaoRepository = sessaoRepository;
        this.consultaDeSessoes = consultaDeSessoes;
        this.movimentoRepository = movimentoRepository;
        this.pontosService = pontosService;
        this.pontoRepository = pontoRepository;
        this.configuracaoService = configuracaoService;
        this.resolvedor = resolvedor;
        this.respostas = respostas;
        this.relogio = relogio;
        this.transacao = new TransactionTemplate(gerenciadorDeTransacoes);
    }

    /** Sessao da resposta e se foi gravada agora ({@code true}, 201) ou ja existia pela chave (200). */
    public record ResultadoDaOperacao(SessaoDeCaixaResponse sessao, boolean criada) {
    }

    // ---------- Uso de outros modulos (PDV) ----------

    /** A sessao {@code ABERTA} aberta pelo usuario, onde a venda vai registrar os recebimentos (spec 9). */
    @Transactional(readOnly = true)
    public Optional<SessaoDeCaixa> sessaoAbertaDoUsuario(Long empresaId, Long usuarioId) {
        return sessaoRepository.emAndamentoDoUsuario(empresaId, usuarioId)
                .filter(sessao -> sessao.getStatus() == StatusDaSessao.ABERTA);
    }

    // ---------- Consultas ----------

    /** A sessao ABERTA ou EM_CONFERENCIA aberta pelo usuario; vazio quando nao ha (204). */
    @Transactional(readOnly = true)
    public Optional<SessaoDeCaixaResponse> atualParaUsuario(Long idUsuario) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        return sessaoRepository.emAndamentoDoUsuario(usuario.empresaId(), usuario.usuarioId())
                .map(sessao -> respostas.completa(sessao, usuario));
    }

    @Transactional(readOnly = true)
    public SessaoDeCaixaResponse detalheParaUsuario(Long idUsuario, UUID sessaoId) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        SessaoDeCaixa sessao = sessaoRepository.findByEmpresaIdAndUuid(usuario.empresaId(), sessaoId)
                .filter(encontrada -> podeVer(usuario, encontrada))
                .orElseThrow(CaixaNaoEncontradoException::sessao);
        return respostas.completa(sessao, usuario);
    }

    /** Historico paginado: o ADMIN ve todas as sessoes da empresa; o OPERADOR, so as que abriu. */
    @Transactional(readOnly = true)
    public PaginaResponse<SessaoDeCaixaResponse> historicoParaUsuario(Long idUsuario, FiltroDeSessoes filtro,
            int pagina, int tamanho) {
        Paginacao.validar(pagina, tamanho);
        filtro.validar();
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        Long empresaId = usuario.empresaId();
        Long pontoId = null;
        if (filtro.pontoId() != null) {
            Optional<PontoDeCaixa> ponto = pontoRepository.findByEmpresaIdAndUuid(empresaId, filtro.pontoId());
            if (ponto.isEmpty()) {
                return new PaginaResponse<>(List.of(), pagina, tamanho, 0);
            }
            pontoId = ponto.get().getId();
        }
        ZoneId fuso = relogio.getZone();
        PaginaDeSessoes sessoes = consultaDeSessoes.buscar(new Criterios(empresaId,
                usuario.ehAdmin() ? null : usuario.usuarioId(), pontoId, filtro.status(), filtro.inicio(fuso),
                filtro.fim(fuso)), pagina, tamanho);
        return new PaginaResponse<>(respostas.resumos(sessoes.sessoes(), usuario), pagina, tamanho, sessoes.total());
    }

    // ---------- Abertura (spec 3.2) ----------

    public ResultadoDaOperacao abrirParaUsuario(Long idUsuario, AbrirCaixaRequest request) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        try {
            return transacao.execute(status -> abrir(usuario, request));
        } catch (DataIntegrityViolationException violacao) {
            return transacao.execute(status -> conflitoNaAbertura(usuario, request, violacao));
        }
    }

    private ResultadoDaOperacao abrir(UsuarioAutenticado usuario, AbrirCaixaRequest request) {
        Optional<ResultadoDaOperacao> repetida = aberturaRepetida(usuario, request);
        if (repetida.isPresent()) {
            return repetida.get();
        }
        PontoDeCaixa ponto = pontosService.buscarAtivoParaAbrir(usuario.empresaId(), request.pontoId());
        // Com a trava do ponto, um pedido simultaneo com a mesma chave neste ponto ja confirmou.
        repetida = aberturaRepetida(usuario, request);
        if (repetida.isPresent()) {
            return repetida.get();
        }
        sessaoRepository.emAndamentoDoUsuario(usuario.empresaId(), usuario.usuarioId()).ifPresent(propria -> {
            throw usuarioComCaixa(propria);
        });
        sessaoRepository.emAndamentoDoPonto(usuario.empresaId(), ponto.getId()).ifPresent(outra -> {
            throw pontoOcupado(outra);
        });
        BigDecimal fundo = emReais(request.fundoTroco());
        OffsetDateTime agora = agora();
        SessaoDeCaixa sessao = sessaoRepository.saveAndFlush(new SessaoDeCaixa(ponto, usuario.usuarioId(), fundo,
                agora));
        movimentoRepository.saveAndFlush(new MovimentoDeCaixa(sessao,
                new Lancamento(TipoDeMovimentoDeCaixa.ABERTURA, fundo, null, request.chave()), usuario.usuarioId(),
                agora));
        return new ResultadoDaOperacao(respostas.completa(sessao, usuario), true);
    }

    /** A abertura ja gravada com a chave, se houver; 409 se ela nao for este mesmo pedido. */
    private Optional<ResultadoDaOperacao> aberturaRepetida(UsuarioAutenticado usuario, AbrirCaixaRequest request) {
        return movimentoRepository.findByEmpresaIdAndChaveIdempotencia(usuario.empresaId(), request.chave())
                .map(gravado -> {
                    SessaoDeCaixa sessao = sessaoDoMovimento(usuario, gravado);
                    boolean mesmoPedido = gravado.getTipo() == TipoDeMovimentoDeCaixa.ABERTURA
                            && sessao.getPonto().getUuid().equals(request.pontoId())
                            && sessao.abertaPor(usuario.usuarioId())
                            && gravado.getValor().compareTo(request.fundoTroco()) == 0;
                    if (!mesmoPedido) {
                        throw new CaixaConflitoException(MENSAGEM_CHAVE_COM_OUTROS_DADOS);
                    }
                    return new ResultadoDaOperacao(respostas.completa(sessao, usuario), false);
                });
    }

    /**
     * A abertura perdeu uma corrida no banco (a transacao foi desfeita): a
     * chave repetida vira repeticao; os indices parciais viram o 409 com quem
     * ganhou. Outra violacao sobe como esta.
     */
    private ResultadoDaOperacao conflitoNaAbertura(UsuarioAutenticado usuario, AbrirCaixaRequest request,
            DataIntegrityViolationException violacao) {
        Long empresaId = usuario.empresaId();
        if (ViolacaoDeConstraint.violou(violacao, CONSTRAINT_DA_CHAVE)) {
            return aberturaRepetida(usuario, request).orElseThrow(() -> violacao);
        }
        if (ViolacaoDeConstraint.violou(violacao, CONSTRAINT_DO_USUARIO)) {
            throw sessaoRepository.emAndamentoDoUsuario(empresaId, usuario.usuarioId())
                    .map(this::usuarioComCaixa)
                    .orElseThrow(() -> violacao);
        }
        if (ViolacaoDeConstraint.violou(violacao, CONSTRAINT_DO_PONTO)) {
            throw pontoRepository.findByEmpresaIdAndUuid(empresaId, request.pontoId())
                    .flatMap(ponto -> sessaoRepository.emAndamentoDoPonto(empresaId, ponto.getId()))
                    .map(this::pontoOcupado)
                    .orElseThrow(() -> violacao);
        }
        throw violacao;
    }

    private CaixaConflitoException pontoOcupado(SessaoDeCaixa sessao) {
        return new CaixaConflitoException(MENSAGEM_PONTO_OCUPADO.formatted(sessao.getPonto().getNome(),
                respostas.nomeDoUsuario(sessao.getAbertaPor())), "pontoId");
    }

    private CaixaConflitoException usuarioComCaixa(SessaoDeCaixa sessao) {
        return new CaixaConflitoException(MENSAGEM_USUARIO_COM_CAIXA.formatted(sessao.getPonto().getNome()));
    }

    // ---------- Sangria e suprimento (spec 3.3) ----------

    public ResultadoDaOperacao lancarParaUsuario(Long idUsuario, UUID sessaoId, MovimentoDeCaixaRequest request) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        Lancamento lancamento = lancamentoValidado(request);
        try {
            return transacao.execute(status -> lancar(usuario, sessaoId, lancamento));
        } catch (DataIntegrityViolationException violacao) {
            if (!ViolacaoDeConstraint.violou(violacao, CONSTRAINT_DA_CHAVE)) {
                throw violacao;
            }
            return transacao.execute(status -> lancamentoRepetido(usuario, travarDoUsuario(usuario, sessaoId),
                    lancamento).orElseThrow(() -> violacao));
        }
    }

    private ResultadoDaOperacao lancar(UsuarioAutenticado usuario, UUID sessaoId, Lancamento lancamento) {
        SessaoDeCaixa sessao = travarDoUsuario(usuario, sessaoId);
        Optional<ResultadoDaOperacao> repetido = lancamentoRepetido(usuario, sessao, lancamento);
        if (repetido.isPresent()) {
            return repetido.get();
        }
        garantirAberta(sessao);
        BigDecimal esperado = esperado(sessao);
        BigDecimal depois = esperado.add(lancamento.tipo().comSinal(lancamento.valor()));
        if (depois.signum() < 0) {
            throw sangriaAcimaDaGaveta(usuario, esperado);
        }
        if (depois.compareTo(LIMITE_DO_CAIXA) > 0) {
            throw new DadosDoCaixaInvalidosException(MENSAGEM_LIMITE_DO_CAIXA, CAMPO_VALOR);
        }
        movimentoRepository.saveAndFlush(new MovimentoDeCaixa(sessao, lancamento, usuario.usuarioId(), agora()));
        return new ResultadoDaOperacao(respostas.completa(sessao, usuario), true);
    }

    /** Tipo lancavel, motivo aparado (1 a 200) e valor na escala do dinheiro. */
    private static Lancamento lancamentoValidado(MovimentoDeCaixaRequest request) {
        if (!request.tipo().lancavel()) {
            throw new DadosDoCaixaInvalidosException(MENSAGEM_TIPO_NAO_LANCAVEL, CAMPO_TIPO);
        }
        String motivo = request.motivo().strip();
        if (motivo.isEmpty()) {
            throw new DadosDoCaixaInvalidosException(MENSAGEM_MOTIVO_VAZIO, CAMPO_MOTIVO);
        }
        if (motivo.length() > TAMANHO_MAXIMO_DO_MOTIVO) {
            throw new DadosDoCaixaInvalidosException(MENSAGEM_MOTIVO_LONGO, CAMPO_MOTIVO);
        }
        return new Lancamento(request.tipo(), emReais(request.valor()), motivo, request.chave());
    }

    /** O movimento ja gravado com a chave, se houver; 409 se ele nao for este mesmo pedido. */
    private Optional<ResultadoDaOperacao> lancamentoRepetido(UsuarioAutenticado usuario, SessaoDeCaixa sessao,
            Lancamento lancamento) {
        return movimentoRepository.findByEmpresaIdAndChaveIdempotencia(usuario.empresaId(), lancamento.chave())
                .map(gravado -> {
                    if (!gravado.mesmoLancamento(sessao.getId(), lancamento)) {
                        throw new CaixaConflitoException(MENSAGEM_CHAVE_COM_OUTROS_DADOS);
                    }
                    return new ResultadoDaOperacao(respostas.completa(sessao, usuario), false);
                });
    }

    /** O valor da gaveta so aparece para o ADMIN ou no modo nao cego (spec 3.3 e 3.6). */
    private CaixaConflitoException sangriaAcimaDaGaveta(UsuarioAutenticado usuario, BigDecimal esperado) {
        boolean podeVerOEsperado = usuario.ehAdmin() || !configuracaoService.fechamentoCego(usuario.empresaId());
        String mensagem = podeVerOEsperado
                ? MENSAGEM_SANGRIA_ACIMA.formatted(Reais.formatar(esperado))
                : MENSAGEM_SANGRIA_ACIMA_NO_CEGO;
        return new CaixaConflitoException(mensagem, CAMPO_VALOR);
    }

    // ---------- Contagem e fechamento (spec 3.4) ----------

    /**
     * Grava a contagem uma vez. Repetir com o mesmo valor devolve o resultado
     * gravado (a rede caiu depois da contagem, Review Focus 1); outro valor,
     * 409. No modo cego a justificativa so vem depois, no fechamento, com ou
     * sem diferenca: aceitar so quando ha diferenca revelaria o esperado.
     */
    @Transactional
    public SessaoDeCaixaResponse contarParaUsuario(Long idUsuario, UUID sessaoId, ContagemRequest request) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        SessaoDeCaixa sessao = travarDoUsuario(usuario, sessaoId);
        BigDecimal contado = emReais(request.valorContado());
        if (sessao.contada()) {
            if (sessao.getValorContado().compareTo(contado) != 0) {
                throw new CaixaConflitoException(MENSAGEM_CONTAGEM_REGISTRADA, "valorContado");
            }
            return respostas.completa(sessao, usuario);
        }
        boolean cego = configuracaoService.fechamentoCego(usuario.empresaId());
        String justificativa = textoOuNulo(request.justificativa());
        if (cego && justificativa != null) {
            throw new DadosDoCaixaInvalidosException(MENSAGEM_JUSTIFICATIVA_NO_CEGO, CAMPO_JUSTIFICATIVA);
        }
        Registro registro = new Registro(usuario.usuarioId(), agora());
        sessao.registrarContagem(esperado(sessao), contado, cego, registro);
        if (sessao.getStatus() == StatusDaSessao.EM_CONFERENCIA && justificativa != null) {
            sessao.fechar(justificativa, registro);
        }
        return respostas.completa(sessaoRepository.saveAndFlush(sessao), usuario);
    }

    /** So em conferencia; repetir com a mesma justificativa numa sessao fechada devolve 200. */
    @Transactional
    public SessaoDeCaixaResponse fecharParaUsuario(Long idUsuario, UUID sessaoId, FechamentoRequest request) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        SessaoDeCaixa sessao = travarDoUsuario(usuario, sessaoId);
        String justificativa = request.justificativa().strip();
        switch (sessao.getStatus()) {
            case ABERTA -> throw new CaixaConflitoException(MENSAGEM_CONTE_ANTES_DE_FECHAR);
            case FECHADA -> {
                if (!justificativa.equals(sessao.getJustificativa())) {
                    throw new CaixaConflitoException(MENSAGEM_JA_FECHADO);
                }
                return respostas.completa(sessao, usuario);
            }
            case EM_CONFERENCIA -> sessao.fechar(justificativa, new Registro(usuario.usuarioId(), agora()));
        }
        return respostas.completa(sessaoRepository.saveAndFlush(sessao), usuario);
    }

    // ---------- Apoio ----------

    /** Trava a sessao da empresa e aplica a regra do dono: OPERADOR em sessao de outra pessoa, 404. */
    private SessaoDeCaixa travarDoUsuario(UsuarioAutenticado usuario, UUID sessaoId) {
        return sessaoRepository.travarPorUuid(usuario.empresaId(), sessaoId)
                .filter(sessao -> podeVer(usuario, sessao))
                .orElseThrow(CaixaNaoEncontradoException::sessao);
    }

    private static boolean podeVer(UsuarioAutenticado usuario, SessaoDeCaixa sessao) {
        return usuario.ehAdmin() || sessao.abertaPor(usuario.usuarioId());
    }

    private SessaoDeCaixa sessaoDoMovimento(UsuarioAutenticado usuario, MovimentoDeCaixa movimento) {
        return sessaoRepository.findByEmpresaIdAndId(usuario.empresaId(), movimento.getSessaoCaixaId())
                .orElseThrow(() -> new IllegalStateException("Movimento de caixa sem sessao."));
    }

    private static void garantirAberta(SessaoDeCaixa sessao) {
        switch (sessao.getStatus()) {
            case ABERTA -> {
                // Recebe lancamentos.
            }
            case EM_CONFERENCIA -> throw new CaixaConflitoException(MENSAGEM_EM_CONFERENCIA);
            case FECHADA -> throw new CaixaConflitoException(MENSAGEM_JA_FECHADO);
        }
    }

    /** Esperado na gaveta, lido com a sessao travada. */
    private BigDecimal esperado(SessaoDeCaixa sessao) {
        return movimentoRepository.esperado(sessao.getEmpresaId(), sessao.getId())
                .setScale(CASAS_DO_DINHEIRO, RoundingMode.UNNECESSARY);
    }

    /** Valor ja validado com ate 2 casas ({@code @Digits}): nunca arredonda. */
    private static BigDecimal emReais(BigDecimal valor) {
        return valor.setScale(CASAS_DO_DINHEIRO, RoundingMode.UNNECESSARY);
    }

    private static String textoOuNulo(String texto) {
        if (texto == null || texto.isBlank()) {
            return null;
        }
        return texto.strip();
    }

    private OffsetDateTime agora() {
        return OffsetDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
    }
}
