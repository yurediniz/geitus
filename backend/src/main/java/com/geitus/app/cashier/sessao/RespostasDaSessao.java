package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.cashier.HorarioDoCaixa;
import com.geitus.app.cashier.NumerosDasVendas;
import com.geitus.app.cashier.configuracao.ConfiguracaoDoCaixaService;
import com.geitus.app.cashier.sessao.dto.MovimentoDeCaixaResponse;
import com.geitus.app.cashier.sessao.dto.SessaoDeCaixaResponse;
import com.geitus.app.cashier.sessao.dto.SessaoDeCaixaResponse.PontoDaSessao;
import com.geitus.app.cashier.sessao.dto.ValoresPorForma;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Monta a {@link SessaoDeCaixaResponse} para quem consulta, num lugar so,
 * para que o modo cego valha em todas as rotas (docs/modules/caixa.md, 3.6 e
 * 7): com o fechamento cego ligado e a sessao {@code ABERTA}, o OPERADOR nao
 * recebe o esperado de nenhuma forma (docs/modules/pdv.md, 3.9). Depois da
 * contagem, o esperado e a fotografia gravada e todos o veem.
 *
 * <p>Nos movimentos vale a mesma regra: com a sessao aberta e o modo cego, o
 * OPERADOR so recebe o valor do que ele mesmo lancou na gaveta; o lancamento
 * de outra pessoa (um suprimento do ADMIN, por exemplo) e os recebimentos e
 * estornos das vendas saem sem o valor, para o esperado nao ser deduzido pela
 * soma.
 *
 * <p>Exige a transacao de quem chama (le movimentos, contagens, nomes e o
 * ponto).
 */
@Component
class RespostasDaSessao {

    private final MovimentoDeCaixaRepository movimentoRepository;
    private final ContagemDeCaixaPorFormaRepository contagemRepository;
    private final UsuarioRepository usuarioRepository;
    private final ConfiguracaoDoCaixaService configuracaoService;
    private final ObjectProvider<NumerosDasVendas> numerosDasVendas;
    private final Clock relogio;

    RespostasDaSessao(MovimentoDeCaixaRepository movimentoRepository,
            ContagemDeCaixaPorFormaRepository contagemRepository, UsuarioRepository usuarioRepository,
            ConfiguracaoDoCaixaService configuracaoService, ObjectProvider<NumerosDasVendas> numerosDasVendas,
            Clock relogio) {
        this.movimentoRepository = movimentoRepository;
        this.contagemRepository = contagemRepository;
        this.usuarioRepository = usuarioRepository;
        this.configuracaoService = configuracaoService;
        this.numerosDasVendas = numerosDasVendas;
        this.relogio = relogio;
    }

    /** A sessao com os movimentos (detalhe, atual e respostas das operacoes). */
    SessaoDeCaixaResponse completa(SessaoDeCaixa sessao, UsuarioAutenticado quemVe) {
        List<MovimentoDeCaixa> movimentos = movimentoRepository
                .findByEmpresaIdAndSessaoCaixaIdOrderByCriadoEmDescIdDesc(sessao.getEmpresaId(), sessao.getId());
        Set<Long> usuarios = usuariosDa(sessao);
        movimentos.forEach(movimento -> usuarios.add(movimento.getUsuarioId()));
        Map<Long, String> nomes = nomes(usuarios);
        Map<Long, Long> numeros = numerosDasVendas(sessao.getEmpresaId(), movimentos);
        ModoDaEmpresa modo = new ModoDaEmpresa(() -> configuracaoService.fechamentoCego(sessao.getEmpresaId()));
        boolean escondeValores = escondeOEsperado(sessao, quemVe, modo);
        List<MovimentoDeCaixaResponse> respostasDosMovimentos = movimentos.stream()
                .map(movimento -> resposta(movimento, nomes, numeros, escondeValores
                        && (movimento.getTipo().daVenda() || !movimento.getUsuarioId().equals(quemVe.usuarioId()))))
                .toList();
        List<ContagemDeCaixaPorForma> contagens = sessao.contada()
                ? contagemRepository.findByEmpresaIdAndSessaoCaixaId(sessao.getEmpresaId(), sessao.getId())
                : List.of();
        return resposta(sessao, quemVe, nomes, modo, new FormasDaSessao(EsperadoPorForma.deMovimentos(movimentos),
                contagens), respostasDosMovimentos);
    }

    /** As sessoes sem os movimentos (itens do historico), com tres consultas a mais qualquer que seja a pagina. */
    List<SessaoDeCaixaResponse> resumos(List<SessaoDeCaixa> sessoes, UsuarioAutenticado quemVe) {
        if (sessoes.isEmpty()) {
            return List.of();
        }
        Set<Long> usuarios = new HashSet<>();
        sessoes.forEach(sessao -> usuarios.addAll(usuariosDa(sessao)));
        Map<Long, String> nomes = nomes(usuarios);
        Long empresaId = quemVe.empresaId();
        List<Long> ids = sessoes.stream().map(SessaoDeCaixa::getId).toList();
        Map<Long, Map<FormaDePagamento, BigDecimal>> esperados = EsperadoPorForma.dasSessoes(movimentoRepository,
                empresaId, ids);
        Map<Long, List<ContagemDeCaixaPorForma>> contagens = contagemRepository
                .findByEmpresaIdAndSessaoCaixaIdIn(empresaId, ids).stream()
                .collect(Collectors.groupingBy(ContagemDeCaixaPorForma::getSessaoCaixaId));
        ModoDaEmpresa modo = new ModoDaEmpresa(() -> configuracaoService.fechamentoCego(empresaId));
        return sessoes.stream()
                .map(sessao -> resposta(sessao, quemVe, nomes, modo, new FormasDaSessao(
                        esperados.getOrDefault(sessao.getId(), Map.of()),
                        contagens.getOrDefault(sessao.getId(), List.of())), null))
                .toList();
    }

    /** Nome do usuario, inclusive o inativado; {@code null} se nao existir. */
    String nomeDoUsuario(Long usuarioId) {
        return usuarioRepository.findById(usuarioId).map(Usuario::getNome).orElse(null);
    }

    private SessaoDeCaixaResponse resposta(SessaoDeCaixa sessao, UsuarioAutenticado quemVe, Map<Long, String> nomes,
            ModoDaEmpresa modo, FormasDaSessao formas, List<MovimentoDeCaixaResponse> movimentos) {
        boolean cego = modoDaSessao(sessao, modo);
        boolean escondido = escondeOEsperado(sessao, quemVe, modo);
        BigDecimal dinheiroNaGaveta = dinheiroNaGaveta(sessao, escondido, formas);
        boolean podeOperar = sessao.getStatus().emAndamento()
                && (quemVe.ehAdmin() || sessao.abertaPor(quemVe.usuarioId()));
        List<FormaDePagamento> formasDaContagem = formas.daContagem(sessao);
        return new SessaoDeCaixaResponse(sessao.getUuid(),
                new PontoDaSessao(sessao.getPonto().getUuid(), sessao.getPonto().getNome()),
                sessao.getStatus(), nomes.get(sessao.getAbertaPor()), noFuso(sessao.getAbertaEm()),
                sessao.getFundoTroco(), dinheiroNaGaveta, cego, sessao.getValorEsperado(),
                sessao.getValorContado(), sessao.getDiferenca(), nomeOuNulo(nomes, sessao.getContadaPor()),
                noFuso(sessao.getContadaEm()), sessao.getJustificativa(), nomeOuNulo(nomes, sessao.getFechadaPor()),
                noFuso(sessao.getFechadaEm()), formasDaContagem, formas.valores(sessao, formasDaContagem, escondido),
                movimentos, podeOperar);
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
     * Aberta: o esperado atual em dinheiro, ou {@code null} quando escondido.
     * Contada: a fotografia gravada (depois dela nao entra mais movimento).
     */
    private static BigDecimal dinheiroNaGaveta(SessaoDeCaixa sessao, boolean escondido, FormasDaSessao formas) {
        if (sessao.contada()) {
            return sessao.getValorEsperado();
        }
        return escondido ? null : formas.esperadoAtual(FormaDePagamento.DINHEIRO);
    }

    /** {@code semValor}: visto pelo OPERADOR no modo cego, com a sessao aberta (lancamento de outra pessoa ou de venda). */
    private MovimentoDeCaixaResponse resposta(MovimentoDeCaixa movimento, Map<Long, String> nomes,
            Map<Long, Long> numeros, boolean semValor) {
        Long vendaNumero = movimento.getVendaId() == null ? null : numeros.get(movimento.getVendaId());
        return new MovimentoDeCaixaResponse(movimento.getUuid(), movimento.getTipo(), movimento.getForma(),
                semValor ? null : movimento.getValor(), movimento.getMotivo(), nomes.get(movimento.getUsuarioId()),
                noFuso(movimento.getCriadoEm()), vendaNumero);
    }

    /** Numero das vendas dos recebimentos e estornos, numa consulta; sem PDV, vazio. */
    private Map<Long, Long> numerosDasVendas(Long empresaId, List<MovimentoDeCaixa> movimentos) {
        Set<Long> vendas = movimentos.stream()
                .map(MovimentoDeCaixa::getVendaId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        NumerosDasVendas numeros = numerosDasVendas.getIfAvailable();
        if (vendas.isEmpty() || numeros == null) {
            return Map.of();
        }
        return numeros.porIds(empresaId, vendas);
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

    /**
     * Esperado atual por forma (dos movimentos) e as contagens gravadas da
     * sessao: dai saem as formas da contagem e os valores de cada uma.
     */
    private record FormasDaSessao(Map<FormaDePagamento, BigDecimal> esperadosAtuais,
            List<ContagemDeCaixaPorForma> contagens) {

        /**
         * Dinheiro sempre; as outras, as com movimento (aberta) ou as contadas
         * (depois da contagem nao entra movimento, entao sao as mesmas).
         */
        List<FormaDePagamento> daContagem(SessaoDeCaixa sessao) {
            Set<FormaDePagamento> formas = EnumSet.of(FormaDePagamento.DINHEIRO);
            if (sessao.contada()) {
                contagens.forEach(contagem -> formas.add(contagem.getForma()));
            } else {
                formas.addAll(esperadosAtuais.keySet());
            }
            return new ArrayList<>(formas);
        }

        List<ValoresPorForma> valores(SessaoDeCaixa sessao, List<FormaDePagamento> formas, boolean escondido) {
            if (sessao.contada()) {
                Map<FormaDePagamento, ContagemDeCaixaPorForma> porForma = new EnumMap<>(FormaDePagamento.class);
                contagens.forEach(contagem -> porForma.put(contagem.getForma(), contagem));
                return formas.stream().map(forma -> contada(sessao, forma, porForma.get(forma))).toList();
            }
            return formas.stream()
                    .map(forma -> new ValoresPorForma(forma, escondido ? null : esperadoAtual(forma), null, null))
                    .toList();
        }

        BigDecimal esperadoAtual(FormaDePagamento forma) {
            return esperadosAtuais.getOrDefault(forma, BigDecimal.ZERO.setScale(2));
        }

        private static ValoresPorForma contada(SessaoDeCaixa sessao, FormaDePagamento forma,
                ContagemDeCaixaPorForma contagem) {
            if (forma == FormaDePagamento.DINHEIRO) {
                return new ValoresPorForma(forma, sessao.getValorEsperado(), sessao.getValorContado(),
                        sessao.getDiferenca());
            }
            return new ValoresPorForma(forma, contagem.getValorEsperado(), contagem.getValorContado(),
                    contagem.getDiferenca());
        }
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
