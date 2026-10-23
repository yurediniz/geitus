package com.geitus.app.catalog.balanca;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.catalog.TamanhoDoCodigoNaEtiqueta;
import com.geitus.app.catalog.balanca.dto.ConfiguracaoEtiquetaRequest;
import com.geitus.app.catalog.balanca.dto.ConfiguracaoEtiquetaResponse;
import com.geitus.app.catalog.balanca.dto.ProdutoAfetadoResponse;
import com.geitus.app.catalog.balanca.dto.SalvarEtiquetaResponse;
import com.geitus.app.catalog.balanca.dto.TesteEtiquetaRequest;
import com.geitus.app.catalog.balanca.dto.TesteEtiquetaResponse;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Regras da etiqueta de balanca (docs/modules/produtos-codigo-e-balanca.md, 3
 * e 8): a configuracao por empresa (ou o padrao), o salvamento com o aviso dos
 * produtos com codigo grande demais e o teste de etiqueta.
 *
 * <p>Como nos demais services, a API publica recebe o {@code idUsuario} do JWT e
 * resolve a empresa internamente (DEC-016): a configuracao e o produto do teste
 * sao sempre os da empresa do usuario. Tambem implementa o
 * {@link TamanhoDoCodigoNaEtiqueta} que o cadastro de produto usa.
 */
@Service
public class EtiquetaBalancaService implements TamanhoDoCodigoNaEtiqueta {

    static final String MENSAGEM_FORA_DO_FORMATO = "Este número não é uma etiqueta neste formato.";
    static final String MENSAGEM_PRODUTO_NAO_CADASTRADO = "Produto %d não cadastrado";
    static final String MENSAGEM_PRODUTO_ENCONTRADO = "Produto %d · %s · %s";

    private static final Locale PORTUGUES_DO_BRASIL = Locale.of("pt", "BR");
    private static final int CASAS_DO_REAL = 2;

    private static final Logger LOG = LoggerFactory.getLogger(EtiquetaBalancaService.class);

    private final ConfiguracaoEtiquetaRepository configuracaoRepository;
    private final ProdutoRepository produtoRepository;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;

    public EtiquetaBalancaService(ConfiguracaoEtiquetaRepository configuracaoRepository,
            ProdutoRepository produtoRepository, EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository) {
        this.configuracaoRepository = configuracaoRepository;
        this.produtoRepository = produtoRepository;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    /** A configuracao gravada da empresa, ou o padrao com {@code padrao: true}. */
    @Transactional(readOnly = true)
    public ConfiguracaoEtiquetaResponse buscarParaUsuario(Long idUsuario) {
        return configuracaoRepository.findByEmpresa_Id(resolverEmpresaId(idUsuario))
                .map(gravada -> ConfiguracaoEtiquetaResponse.de(gravada.configuracao(), false))
                .orElseGet(() -> ConfiguracaoEtiquetaResponse.de(ConfiguracaoEtiqueta.padrao(), true));
    }

    /**
     * Valida (400) e grava a configuracao da empresa, criando a linha na
     * primeira vez. Devolve tambem os produtos "Vendidos na balanca" cujo
     * codigo nao cabe no novo tamanho: o aviso nao bloqueia (spec 3.3), e
     * esses produtos so voltam a salvar com um codigo menor (Review Focus 3).
     *
     * <p><b>Rastro provisorio</b> ate existir a auditoria: log {@code INFO} so
     * com identificadores (usuario e empresa) e o formato salvo, como o da
     * exclusao de produto. O {@code saveAndFlush} vem antes do log, para so
     * registrar o que o banco aceitou.
     */
    @Transactional
    public SalvarEtiquetaResponse salvarParaUsuario(Long idUsuario, ConfiguracaoEtiquetaRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        ConfiguracaoEtiqueta configuracao = request.paraConfiguracao();

        ConfiguracaoEtiquetaBalanca gravada = configuracaoRepository.findByEmpresa_Id(empresaId)
                .map(existente -> existente.aplicar(configuracao))
                .orElseGet(() -> new ConfiguracaoEtiquetaBalanca(empresaRepository.getReferenceById(empresaId),
                        configuracao));
        configuracaoRepository.saveAndFlush(gravada);
        LOG.info("Etiqueta de balanca salva: usuario={} empresa={} formato={}", idUsuario, empresaId,
                configuracao.descricaoCompacta());

        return new SalvarEtiquetaResponse(ConfiguracaoEtiquetaResponse.de(gravada.configuracao(), false),
                produtosComCodigoGrandeDemais(empresaId, configuracao.digitosCodigo()));
    }

    /**
     * Le {@code codigoLido} com a configuracao da TELA (validada, 400) e
     * procura o produto pelo codigo lido na empresa do usuario.
     */
    @Transactional(readOnly = true)
    public TesteEtiquetaResponse testarParaUsuario(Long idUsuario, TesteEtiquetaRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        ConfiguracaoEtiqueta configuracao = request.configuracao().paraConfiguracao();

        Optional<LeituraEtiqueta> leitura = LeitorEtiquetaBalanca.ler(request.codigoLido().strip(), configuracao);
        if (leitura.isEmpty()) {
            return new TesteEtiquetaResponse(null, null, MENSAGEM_FORA_DO_FORMATO);
        }
        LeituraEtiqueta lida = leitura.get();
        TesteEtiquetaResponse.Leitura resposta = TesteEtiquetaResponse.Leitura.de(lida);
        return produtoRepository.findByEmpresa_IdAndCodigo(empresaId, lida.codigoProduto())
                .map(produto -> new TesteEtiquetaResponse(resposta, TesteEtiquetaResponse.ProdutoDaEtiqueta.de(produto),
                        mensagemDoProdutoEncontrado(lida, produto)))
                .orElseGet(() -> new TesteEtiquetaResponse(resposta, null,
                        MENSAGEM_PRODUTO_NAO_CADASTRADO.formatted(lida.codigoProduto())));
    }

    // ---------- Uso interno ----------

    /**
     * Configuracao da empresa, ou o padrao se ela ainda nao salvou a sua.
     *
     * <p>Chamado de dentro de outra transacao (o cadastro do produto, via
     * {@link #digitosCodigo}), a leitura ENTRA na transacao de quem chama, de
     * proposito: o produto e validado com a configuracao vista na mesma
     * transacao, e o {@code readOnly} so vale quando este metodo abre a
     * transacao.
     */
    @Transactional(readOnly = true)
    public ConfiguracaoEtiqueta configuracaoDaEmpresa(Long empresaId) {
        return configuracaoRepository.findByEmpresa_Id(empresaId)
                .map(ConfiguracaoEtiquetaBalanca::configuracao)
                .orElseGet(ConfiguracaoEtiqueta::padrao);
    }

    /**
     * Digitos do codigo na etiqueta da empresa, para o cadastro do produto. A
     * chamada e interna ({@link #configuracaoDaEmpresa} sem passar pelo proxy):
     * a leitura roda na transacao do cadastro, de proposito (ver la).
     */
    @Override
    public int digitosCodigo(Long empresaId) {
        return configuracaoDaEmpresa(empresaId).digitosCodigo();
    }

    /** Com {@code digitosCodigo} digitos, o maior codigo e 10^digitos - 1; dali para cima nao cabe. */
    private List<ProdutoAfetadoResponse> produtosComCodigoGrandeDemais(Long empresaId, int digitosCodigo) {
        int menorCodigoQueNaoCabe = BigDecimal.ONE.scaleByPowerOfTen(digitosCodigo).intValueExact();
        return produtoRepository.vendidosNaBalancaComCodigoAPartirDe(empresaId, menorCodigoQueNaoCabe).stream()
                .map(ProdutoAfetadoResponse::de)
                .toList();
    }

    /** "Produto 542 · Açúcar a granel · R$ 10,00" (valor) ou "... · 0,750 kg" (peso). */
    private static String mensagemDoProdutoEncontrado(LeituraEtiqueta leitura, Produto produto) {
        return MENSAGEM_PRODUTO_ENCONTRADO.formatted(leitura.codigoProduto(), produto.getNome(),
                informacaoFormatada(leitura));
    }

    private static String informacaoFormatada(LeituraEtiqueta leitura) {
        return switch (leitura.tipo()) {
            case VALOR -> "R$ " + numeroFormatado(leitura.valor().setScale(CASAS_DO_REAL, RoundingMode.HALF_UP));
            case PESO -> numeroFormatado(leitura.valor()) + " kg";
        };
    }

    /** Numero com virgula decimal e ponto de milhar (pt-BR), com as casas do proprio valor. */
    private static String numeroFormatado(BigDecimal valor) {
        NumberFormat formato = NumberFormat.getNumberInstance(PORTUGUES_DO_BRASIL);
        formato.setMinimumFractionDigits(valor.scale());
        formato.setMaximumFractionDigits(valor.scale());
        return formato.format(valor);
    }

    private Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }
}
