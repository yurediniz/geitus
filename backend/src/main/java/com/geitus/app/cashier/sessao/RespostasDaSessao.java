package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;

import com.geitus.app.cashier.HorarioDoCaixa;
import com.geitus.app.cashier.configuracao.ConfiguracaoDoCaixaService;
import com.geitus.app.cashier.sessao.dto.MovimentoDeCaixaResponse;
import com.geitus.app.cashier.sessao.dto.SessaoDeCaixaResponse;
import com.geitus.app.cashier.sessao.dto.SessaoDeCaixaResponse.PontoDaSessao;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Monta a {@link SessaoDeCaixaResponse} para quem consulta, num lugar so,
 * para que o modo cego valha em todas as rotas (docs/modules/caixa.md, 3.6 e
 * 7): com o fechamento cego ligado e a sessao {@code ABERTA}, o OPERADOR nao
 * recebe o esperado. Depois da contagem, o esperado e a fotografia gravada e
 * todos o veem.
 *
 * <p>Nos movimentos vale a mesma regra: com a sessao aberta e o modo cego, o
 * OPERADOR so recebe o valor do que ele mesmo lancou; o lancamento de outra
 * pessoa (um suprimento do ADMIN, por exemplo) sai sem o valor, para o
 * esperado nao ser deduzido pela soma (spec 3.6).
 *
 * <p>Exige a transacao de quem chama (le movimentos, nomes e o ponto).
 */
@Component
class RespostasDaSessao {

    private static final int CASAS_DO_DINHEIRO = 2;

    private final MovimentoDeCaixaRepository movimentoRepository;
    private final UsuarioRepository usuarioRepository;
    private final ConfiguracaoDoCaixaService configuracaoService;
    private final Clock relogio;

    RespostasDaSessao(MovimentoDeCaixaRepository movimentoRepository, UsuarioRepository usuarioRepository,
            ConfiguracaoDoCaixaService configuracaoService, Clock relogio) {
        this.movimentoRepository = movimentoRepository;
        this.usuarioRepository = usuarioRepository;
        this.configuracaoService = configuracaoService;
        this.relogio = relogio;
    }

    /** A sessao com os movimentos (detalhe, atual e respostas das operacoes). */
    SessaoDeCaixaResponse completa(SessaoDeCaixa sessao, UsuarioAutenticado quemVe) {
        List<MovimentoDeCaixa> movimentos = movimentoRepository
                .findByEmpresaIdAndSessaoCaixaIdOrderByCriadoEmDescIdDesc(sessao.getEmpresaId(), sessao.getId());
        Set<Long> usuarios = usuariosDa(sessao);
        movimentos.forEach(movimento -> usuarios.add(movimento.getUsuarioId()));
        Map<Long, String> nomes = nomes(usuarios);
        ModoDaEmpresa modo = new ModoDaEmpresa(() -> configuracaoService.fechamentoCego(sessao.getEmpresaId()));
        boolean escondeValores = escondeOEsperado(sessao, quemVe, modo);
        List<MovimentoDeCaixaResponse> respostasDosMovimentos = movimentos.stream()
                .map(movimento -> resposta(movimento, nomes,
                        escondeValores && !movimento.getUsuarioId().equals(quemVe.usuarioId())))
                .toList();
        return resposta(sessao, quemVe, nomes, modo, () -> soma(movimentos), respostasDosMovimentos);
    }

    /** As sessoes sem os movimentos (itens do historico). */
    List<SessaoDeCaixaResponse> resumos(List<SessaoDeCaixa> sessoes, UsuarioAutenticado quemVe) {
        if (sessoes.isEmpty()) {
            return List.of();
        }
        Set<Long> usuarios = new HashSet<>();
        sessoes.forEach(sessao -> usuarios.addAll(usuariosDa(sessao)));
        Map<Long, String> nomes = nomes(usuarios);
        ModoDaEmpresa modo = new ModoDaEmpresa(() -> configuracaoService.fechamentoCego(quemVe.empresaId()));
        return sessoes.stream()
                .map(sessao -> resposta(sessao, quemVe, nomes, modo, () -> esperadoNoBanco(sessao), null))
                .toList();
    }

    /** Nome do usuario, inclusive o inativado; {@code null} se nao existir. */
    String nomeDoUsuario(Long usuarioId) {
        return usuarioRepository.findById(usuarioId).map(Usuario::getNome).orElse(null);
    }

    private SessaoDeCaixaResponse resposta(SessaoDeCaixa sessao, UsuarioAutenticado quemVe, Map<Long, String> nomes,
            ModoDaEmpresa modo, Supplier<BigDecimal> esperadoAtual, List<MovimentoDeCaixaResponse> movimentos) {
        boolean cego = modoDaSessao(sessao, modo);
        BigDecimal dinheiroNaGaveta = dinheiroNaGaveta(sessao, escondeOEsperado(sessao, quemVe, modo),
                esperadoAtual);
        boolean podeOperar = sessao.getStatus().emAndamento()
                && (quemVe.ehAdmin() || sessao.abertaPor(quemVe.usuarioId()));
        return new SessaoDeCaixaResponse(sessao.getUuid(),
                new PontoDaSessao(sessao.getPonto().getUuid(), sessao.getPonto().getNome()),
                sessao.getStatus(), nomes.get(sessao.getAbertaPor()), noFuso(sessao.getAbertaEm()),
                sessao.getFundoTroco(), dinheiroNaGaveta, cego, sessao.getValorEsperado(),
                sessao.getValorContado(), sessao.getDiferenca(), nomeOuNulo(nomes, sessao.getContadaPor()),
                noFuso(sessao.getContadaEm()), sessao.getJustificativa(), nomeOuNulo(nomes, sessao.getFechadaPor()),
                noFuso(sessao.getFechadaEm()), movimentos, podeOperar);
    }

    /** Com a sessao {@code ABERTA}, o modo atual da empresa; depois da contagem, o modo gravado. */
    private static boolean modoDaSessao(SessaoDeCaixa sessao, ModoDaEmpresa modo) {
        return sessao.getStatus() == StatusDaSessao.ABERTA
                ? modo.cego()
                : Boolean.TRUE.equals(sessao.getFechamentoCego());
    }

    /** OPERADOR, sessao ainda sem contagem e modo cego: o esperado nao pode sair nem ser deduzido. */
    private static boolean escondeOEsperado(SessaoDeCaixa sessao, UsuarioAutenticado quemVe, ModoDaEmpresa modo) {
        return !sessao.contada() && !quemVe.ehAdmin() && modoDaSessao(sessao, modo);
    }

    /**
     * Aberta: o esperado atual, ou {@code null} quando escondido. Contada: a
     * fotografia gravada (depois dela nao entra mais movimento).
     */
    private static BigDecimal dinheiroNaGaveta(SessaoDeCaixa sessao, boolean escondido,
            Supplier<BigDecimal> esperadoAtual) {
        if (sessao.contada()) {
            return sessao.getValorEsperado();
        }
        return escondido ? null : esperadoAtual.get();
    }

    private BigDecimal esperadoNoBanco(SessaoDeCaixa sessao) {
        return movimentoRepository.esperado(sessao.getEmpresaId(), sessao.getId())
                .setScale(CASAS_DO_DINHEIRO, RoundingMode.UNNECESSARY);
    }

    private static BigDecimal soma(List<MovimentoDeCaixa> movimentos) {
        return movimentos.stream()
                .map(movimento -> movimento.getTipo().comSinal(movimento.getValor()))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(CASAS_DO_DINHEIRO, RoundingMode.UNNECESSARY);
    }

    /** {@code semValor}: lancamento de outra pessoa visto pelo OPERADOR no modo cego, com a sessao aberta. */
    private MovimentoDeCaixaResponse resposta(MovimentoDeCaixa movimento, Map<Long, String> nomes,
            boolean semValor) {
        return new MovimentoDeCaixaResponse(movimento.getUuid(), movimento.getTipo(),
                semValor ? null : movimento.getValor(),
                movimento.getMotivo(), nomes.get(movimento.getUsuarioId()), noFuso(movimento.getCriadoEm()));
    }

    private static Set<Long> usuariosDa(SessaoDeCaixa sessao) {
        Set<Long> usuarios = new HashSet<>();
        usuarios.add(sessao.getAbertaPor());
        usuarios.add(sessao.getContadaPor());
        usuarios.add(sessao.getFechadaPor());
        usuarios.remove(null);
        return usuarios;
    }

    private Map<Long, String> nomes(Collection<Long> usuarios) {
        Map<Long, String> nomes = new HashMap<>();
        usuarioRepository.findAllById(usuarios).forEach(usuario -> nomes.put(usuario.getId(), usuario.getNome()));
        return nomes;
    }

    private static String nomeOuNulo(Map<Long, String> nomes, Long usuarioId) {
        return usuarioId == null ? null : nomes.get(usuarioId);
    }

    private OffsetDateTime noFuso(OffsetDateTime horario) {
        return HorarioDoCaixa.noFuso(relogio, horario);
    }

    /** O modo de fechamento atual da empresa, lido uma vez e so se alguma sessao aberta precisar. */
    private static final class ModoDaEmpresa {

        private final Supplier<Boolean> leitura;
        private Boolean cego;

        ModoDaEmpresa(Supplier<Boolean> leitura) {
            this.leitura = leitura;
        }

        boolean cego() {
            if (cego == null) {
                cego = Objects.requireNonNull(leitura.get());
            }
            return cego;
        }
    }
}
