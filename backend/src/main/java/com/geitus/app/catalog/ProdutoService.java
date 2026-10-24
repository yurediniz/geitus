package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.hibernate.exception.ConstraintViolationException;
import org.postgresql.util.PSQLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.geitus.app.catalog.arvore.Arvore;
import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.dto.AtacadoRequest;
import com.geitus.app.catalog.dto.HistoricoPrecoResponse;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.dto.ReferenciasDoProduto;
import com.geitus.app.catalog.dto.PromocaoRequest;
import com.geitus.app.catalog.listagem.ConsultaDeProdutos;
import com.geitus.app.catalog.listagem.FiltroDeProdutos;
import com.geitus.app.catalog.listagem.PaginaDeIds;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
import com.geitus.app.catalog.marca.Marca;
import com.geitus.app.catalog.marca.MarcaService;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.shared.busca.TextoDeBusca;
import com.geitus.app.shared.numeracao.Numerador;
import com.geitus.app.shared.numeracao.TipoNumeracao;

/**
 * Regras de negocio do modulo Produtos.
 *
 * <p>Toda a regra de negocio fica concentrada aqui (arquitetura por camadas do
 * CLAUDE.md), consumida por um controller fino ({@code ProdutoController}).
 *
 * <p>O {@code empresaId} recebido pelos metodos internos representa SEMPRE a
 * empresa do usuario autenticado (nunca uma escolha livre do chamador) e e
 * usado para isolar consultas e alteracoes por tenant (DEC-016): um produto de
 * outra empresa nunca deve ser encontrado, atualizado, excluido ou vazado —
 * inclusive pelo nome, na mensagem de codigo de barras duplicado. O mesmo vale
 * para a unidade, a categoria e a marca informadas: sao buscadas dentro da
 * empresa e, se forem de outra, respondem 404.
 *
 * <p>A API publica do service e composta apenas pelos metodos {@code *ParaUsuario},
 * que recebem {@code idUsuario} (o id extraido do JWT) e resolvem a empresa
 * internamente, no mesmo padrao usado em {@code EmpresaService.buscarUsuarioAtivo}:
 * assim o controller nunca manipula {@code empresaId} diretamente. O produto e
 * identificado pelo UUID publico (DEC-019). Os metodos que recebem
 * {@code empresaId} sao de uso interno (package-private) e concentram a regra
 * de isolamento por tenant.
 *
 * <p>Fase B (docs/modules/produtos-identificacao-e-formulario.md, secao 4):
 * codigos de barras multiplos, nome curto, SKU sugerido e exclusao fisica
 * condicionada ao estoque (ver {@link #excluir}). As sugestoes de marca e
 * fornecedor em texto sairam na Fase B5 (viraram cadastros).
 *
 * <p>Fase C (docs/modules/produtos-precos.md, 4.3 e 4.4): promocao e atacado
 * validados contra o preco de venda, o preco minimo e a unidade de venda; a
 * situacao da promocao usa a data do {@link Clock} da aplicacao
 * ({@code America/Sao_Paulo}), lida uma vez por requisicao. O historico de
 * custo e preco de venda (4.6) e gravado na mesma transacao do produto, com o
 * usuario autenticado, so para o que realmente mudou.
 *
 * <p>Fase D (docs/modules/produtos-estoque.md, 4.1, 4.4, 4.6 a 4.8): o
 * produto liga ou desliga o controle de estoque; o estoque inicial do cadastro
 * vira a primeira entrada, na mesma transacao; a resposta traz o saldo e a
 * situacao; os niveis seguem minimo <= ponto <= maximo; produto movimentado nao
 * troca de unidade; e a exclusao so acontece sem movimentos ou so com o estoque
 * inicial. O estoque e consultado e escrito pelas interfaces
 * {@link UsoDoProdutoNoEstoque} e {@link RegistroDeEstoqueInicial}, implementadas
 * no pacote {@code inventory}: o catalogo nao depende dele.
 *
 * <p>Fase E (docs/modules/produtos-listagem.md): a listagem e paginada no
 * servidor, com busca sem acento, filtros e ordenacao feitos no banco pela
 * {@link ConsultaDeProdutos}.
 *
 * <p>Fase B5 (docs/modules/fornecedores-e-marcas.md, 3.3 e 5): a marca e um
 * item da arvore de marcas (como a categoria) e a lista de fornecedores, com o
 * da ultima compra, segue as regras do {@link FornecedoresDoProduto}; os nomes
 * dos fornecedores chegam pela {@link NomesDeFornecedores}, sem depender do
 * pacote {@code supplier}.
 *
 * <p>Fase B4 (docs/modules/produtos-custo-entrada.md, 3 e 4): o custo que muda
 * no cadastro ou na edicao marca a origem {@code EDICAO} no produto e no
 * historico; o mesmo custo nao mexe na origem. A resposta do detalhe traz a
 * ultima entrada por compra, e o historico traz a entrada ligada a cada linha
 * de custo, lida em lote.
 */
@Service
public class ProdutoService {

    static final String MENSAGEM_UNIDADE_OBRIGATORIA = "Unidade é obrigatória.";
    static final String MENSAGEM_CONTROLE_DE_ESTOQUE_OBRIGATORIO = "Informe se o produto controla estoque.";
    static final String MENSAGEM_ESTOQUE_INICIAL_SEM_CONTROLE =
            "Ligue o controle de estoque para informar o estoque inicial.";
    static final String MENSAGEM_ESTOQUE_INICIAL_SO_NO_CADASTRO =
            "O estoque inicial só pode ser informado no cadastro. Use Ajustar estoque.";
    static final String MENSAGEM_UNIDADE_DE_PRODUTO_MOVIMENTADO =
            "Não é possível trocar a unidade de um produto com movimentação de estoque.";
    static final String MENSAGEM_PONTO_MENOR_QUE_MINIMO =
            "O ponto de reposição não pode ser menor que o estoque mínimo.";
    static final String MENSAGEM_MAXIMO_MENOR_QUE_PONTO =
            "O estoque máximo não pode ser menor que o ponto de reposição.";
    static final String MENSAGEM_UNIDADE_INATIVA = "Esta unidade está inativa. Escolha uma unidade ativa.";
    static final String MENSAGEM_CATEGORIA_INATIVA = "Esta categoria está inativa. Escolha uma categoria ativa.";
    static final String MENSAGEM_MARCA_INATIVA = "Esta marca está inativa. Escolha uma marca ativa.";
    static final String MENSAGEM_SKU_DUPLICADO = "Já existe um produto com este SKU nesta empresa.";

    static final String MENSAGEM_CODIGO_DO_PRODUTO_FORA_DO_INTERVALO =
            "O código do produto deve ter de 1 a 6 dígitos.";
    static final String MENSAGEM_BALANCA_SEM_CODIGO = "Informe o código do produto para vendê-lo na balança.";
    static final String MENSAGEM_CODIGO_MAIOR_QUE_A_ETIQUETA =
            "Este código tem mais dígitos do que a etiqueta da balança comporta (%d).";
    static final String MENSAGEM_CODIGO_DO_PRODUTO_EM_USO = "Este código já está em uso no produto %s.";
    /** So na corrida em que o outro produto mudou de codigo antes da releitura (o nome ja nao existe). */
    static final String MENSAGEM_CODIGO_DO_PRODUTO_EM_USO_SEM_NOME = "Este código já está em uso em outro produto.";

    static final String MENSAGEM_LIMITE_DE_CODIGOS = "Informe no máximo 20 códigos de barras.";
    static final String MENSAGEM_EXCLUSAO_BLOQUEADA =
            "Este produto já teve movimentação de estoque e não pode ser excluído. Inative-o.";

    static final String MENSAGEM_PRECO_PROMOCIONAL_OBRIGATORIO = "Informe o preço promocional.";
    static final String MENSAGEM_INICIO_PROMOCAO_OBRIGATORIO = "Informe o início da promoção.";
    static final String MENSAGEM_FIM_PROMOCAO_OBRIGATORIO = "Informe o fim da promoção.";
    static final String MENSAGEM_FIM_ANTES_DO_INICIO = "O fim da promoção não pode ser antes do início.";
    static final String MENSAGEM_PRECO_ATACADO_OBRIGATORIO = "Informe o preço de atacado.";
    static final String MENSAGEM_QUANTIDADE_ATACADO_OBRIGATORIA = "Informe a quantidade mínima do atacado.";
    static final String MENSAGEM_QUANTIDADE_ATACADO_ATE_UM = "A quantidade mínima do atacado deve ser maior que 1.";
    static final String MENSAGEM_QUANTIDADE_ATACADO_CASAS =
            "A quantidade mínima do atacado deve ter no máximo 3 casas decimais.";

    /** Campos do {@code ProdutoRequest} devolvidos em {@code campos} nos erros de regra (contrato aditivo). */
    static final String CAMPO_SKU = "sku";
    static final String CAMPO_CODIGO_DO_PRODUTO = "codigo";
    static final String CAMPO_CODIGOS_BARRAS = "codigosBarras";
    static final String CAMPO_PROMOCAO_PRECO = "promocao.preco";
    static final String CAMPO_PROMOCAO_INICIO = "promocao.inicio";
    static final String CAMPO_PROMOCAO_FIM = "promocao.fim";
    static final String CAMPO_ATACADO_PRECO = "atacado.preco";
    static final String CAMPO_ATACADO_QUANTIDADE_MINIMA = "atacado.quantidadeMinima";
    static final String CAMPO_UNIDADE = "unidadeId";
    static final String CAMPO_CONTROLA_ESTOQUE = "controlaEstoque";
    static final String CAMPO_ESTOQUE_INICIAL = "estoqueInicial";
    static final String CAMPO_PONTO_REPOSICAO = "pontoReposicao";
    static final String CAMPO_ESTOQUE_MAXIMO = "estoqueMaximo";

    static final int MAXIMO_CODIGOS_POR_PRODUTO = 20;
    /** Casas decimais da quantidade minima do atacado ({@code NUMERIC(12,3)}, V8). */
    static final int CASAS_QUANTIDADE_ATACADO = 3;
    /** Intervalo do codigo do produto (V11, {@code ck_produto_codigo_intervalo}). */
    static final int MENOR_CODIGO_DO_PRODUTO = 1;
    static final int MAIOR_CODIGO_DO_PRODUTO = 999_999;
    /** Indice unico parcial do codigo do produto por empresa (V11). */
    static final String CONSTRAINT_CODIGO_DO_PRODUTO = "uq_produto_empresa_codigo";
    /** Unicidade do codigo de barras na empresa, entre unidade e embalagens (V7 e V12). */
    static final String CONSTRAINT_CODIGO_DE_BARRAS = "uq_codigo_barras_empresa";
    /** So na corrida em que o outro dono mudou antes da releitura. */
    static final String MENSAGEM_CODIGO_DE_BARRAS_EM_USO_SEM_NOME =
            "Este código de barras já está em uso em outro produto.";

    /** SKU no padrao da sugestao automatica: {@code P} + 6 ou mais digitos (spec 4.2). */
    private static final Pattern SKU_NO_PADRAO = Pattern.compile("P([0-9]{6,})");
    private static final String PREFIXO_SKU_SUGERIDO = "P";
    private static final String FORMATO_NUMERO_SKU_SUGERIDO = "%06d";

    private static final Logger LOG = LoggerFactory.getLogger(ProdutoService.class);

    private final ProdutoRepository produtoRepository;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final UnidadeMedidaService unidadeService;
    private final CategoriaService categoriaService;
    private final MarcaService marcaService;
    private final HistoricoPrecoRepository historicoPrecoRepository;
    private final HistoricoDePrecos historicoDePrecos;
    private final ValidadorDeCodigosDeBarras validadorDeCodigos;
    private final EmbalagensDoProduto embalagensDoProduto;
    private final FornecedoresDoProduto fornecedoresDoProduto;
    private final NomesDeFornecedores nomesDeFornecedores;
    private final UsoDoProdutoNoEstoque usoNoEstoque;
    private final RegistroDeEstoqueInicial registroDeEstoqueInicial;
    private final ConsultaDeProdutos consultaDeProdutos;
    private final Numerador numerador;
    private final TamanhoDoCodigoNaEtiqueta tamanhoDoCodigoNaEtiqueta;
    private final Clock relogio;

    public ProdutoService(ProdutoRepository produtoRepository, EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository, UnidadeMedidaService unidadeService,
            CategoriaService categoriaService, MarcaService marcaService,
            HistoricoPrecoRepository historicoPrecoRepository,
            HistoricoDePrecos historicoDePrecos, ValidadorDeCodigosDeBarras validadorDeCodigos,
            EmbalagensDoProduto embalagensDoProduto, FornecedoresDoProduto fornecedoresDoProduto,
            NomesDeFornecedores nomesDeFornecedores, UsoDoProdutoNoEstoque usoNoEstoque,
            RegistroDeEstoqueInicial registroDeEstoqueInicial,
            ConsultaDeProdutos consultaDeProdutos, Numerador numerador,
            TamanhoDoCodigoNaEtiqueta tamanhoDoCodigoNaEtiqueta, Clock relogio) {
        this.produtoRepository = produtoRepository;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.unidadeService = unidadeService;
        this.categoriaService = categoriaService;
        this.marcaService = marcaService;
        this.historicoPrecoRepository = historicoPrecoRepository;
        this.historicoDePrecos = historicoDePrecos;
        this.validadorDeCodigos = validadorDeCodigos;
        this.embalagensDoProduto = embalagensDoProduto;
        this.fornecedoresDoProduto = fornecedoresDoProduto;
        this.nomesDeFornecedores = nomesDeFornecedores;
        this.usoNoEstoque = usoNoEstoque;
        this.registroDeEstoqueInicial = registroDeEstoqueInicial;
        this.consultaDeProdutos = consultaDeProdutos;
        this.numerador = numerador;
        this.tamanhoDoCodigoNaEtiqueta = tamanhoDoCodigoNaEtiqueta;
        this.relogio = relogio;
    }

    /**
     * Cadastra o produto e registra no historico o preco de venda e o custo
     * iniciais (valor anterior nulo), atribuidos a {@code idUsuario}. Com
     * {@code estoqueInicial}, registra tambem a primeira entrada de estoque, na
     * mesma transacao: se o cadastro falhar, nada fica gravado. O numero de
     * registro (Fase B2) e reservado so depois das validacoes, na mesma
     * transacao: um cadastro que falha nao consome numero. As embalagens (Fase
     * B3) sao validadas antes e gravadas junto, com o preco proprio de cada uma
     * no historico.
     */
    Produto cadastrar(Long idUsuario, Long empresaId, ProdutoRequest request) {
        validarCampos(request);
        List<CodigoBarrasValidado> codigos = validarCodigos(empresaId, request.codigosBarras(), null);
        String sku = normalizarOuNulo(request.sku());
        garantirSkuDisponivelParaNovoProduto(empresaId, sku);
        validarCodigoDoProduto(empresaId, request, null);
        Vinculos vinculos = resolverVinculos(empresaId, request, null);
        validarPromocaoEAtacado(request, vinculos.unidade());
        validarEstoqueInicial(request, vinculos.unidade());
        PlanoDeEmbalagens embalagens = embalagensDoProduto.planejar(empresaId, null, vinculos.unidade(),
                request.precoMinimo(), request.embalagens(), textos(codigos));
        PlanoDeFornecedores fornecedores = fornecedoresDoProduto.planejar(empresaId, null, request.fornecedorIds(),
                request.fornecedorUltimaCompraId());

        Empresa empresa = empresaRepository.findById(empresaId)
                .orElseThrow(() -> new RegraDeNegocioException("Empresa informada não encontrada."));

        long numero = numerador.proximo(empresaId, TipoNumeracao.PRODUTO);
        Produto produto = new Produto(empresa, numero, dadosDoProduto(request, vinculos, sku), agora());
        Produto gravado = gravar(produto, () -> aplicarCodigosEEmbalagens(produto, codigos, embalagens));
        registrarHistorico(gravado, idUsuario, null, null, embalagens);
        if (request.estoqueInicial() != null) {
            registroDeEstoqueInicial.registrar(gravado, request.estoqueInicial(), idUsuario);
        }
        // Fase B5: a ligacao precisa do produto gravado, e o da ultima compra precisa da ligacao.
        fornecedoresDoProduto.aplicar(gravado, fornecedores);
        produtoRepository.flush();
        return gravado;
    }

    /**
     * Atualiza o cadastro. {@code codigosBarras} {@code null} (campo ausente no
     * PATCH) mantem os codigos atuais, sem validar nem tocar na lista; uma
     * lista — inclusive {@code []}, que remove todos — substitui a lista inteira.
     * {@code embalagens} segue a mesma regra (Fase B3); ausente, as atuais sao
     * conferidas de novo contra a unidade de venda e o preco minimo do request.
     * Mudancas de custo, preco de venda e preco das embalagens vao para o
     * historico com {@code idUsuario}.
     */
    Produto atualizarDadosBasicos(Long idUsuario, Long empresaId, UUID produtoId, ProdutoRequest request) {
        // Trava a linha antes de ler custo e preco anteriores: edicoes concorrentes
        // nao podem gravar o mesmo valor_anterior no historico (ver ProdutoRepository).
        Produto produto = produtoRepository.buscarPorUuidParaAtualizar(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);

        if (request.estoqueInicial() != null) {
            throw new RegraDeNegocioException(MENSAGEM_ESTOQUE_INICIAL_SO_NO_CADASTRO, CAMPO_ESTOQUE_INICIAL);
        }
        validarCampos(request);
        Optional<List<CodigoBarrasValidado>> codigos = Optional.ofNullable(request.codigosBarras())
                .map(informados -> validarCodigos(empresaId, informados, produto));
        String sku = normalizarOuNulo(request.sku());
        garantirSkuDisponivelParaProdutoExistente(empresaId, produto.getId(), sku);
        validarCodigoDoProduto(empresaId, request, produto.getId());
        Vinculos vinculos = resolverVinculos(empresaId, request, produto);
        exigirUnidadeMantidaSeMovimentado(produto, vinculos.unidade());
        validarPromocaoEAtacado(request, vinculos.unidade());
        List<String> codigosFinaisDaUnidade = codigos.map(ProdutoService::textos)
                .orElseGet(() -> ListaDeCodigosDeBarras.textos(produto.getCodigosBarras()));
        PlanoDeEmbalagens embalagens = embalagensDoProduto.planejar(empresaId, produto, vinculos.unidade(),
                request.precoMinimo(), request.embalagens(), codigosFinaisDaUnidade);
        PlanoDeFornecedores fornecedores = fornecedoresDoProduto.planejar(empresaId, produto,
                request.fornecedorIds(), request.fornecedorUltimaCompraId());

        BigDecimal custoAnterior = produto.getCusto();
        BigDecimal precoAnterior = produto.getPrecoVenda();
        produto.atualizarDadosBasicos(dadosDoProduto(request, vinculos, sku), agora());
        Produto gravado = gravar(produto, () -> aplicarCodigosEEmbalagens(produto, codigos.orElse(null),
                embalagens));
        registrarHistorico(gravado, idUsuario, custoAnterior, precoAnterior, embalagens);
        fornecedoresDoProduto.aplicar(gravado, fornecedores);
        return gravado;
    }

    /**
     * Aplica os codigos da unidade ({@code null} = manter) e as embalagens em
     * duas fases (Fase B3, Review Focus 1 e 2): primeiro saem os codigos e as
     * embalagens removidos e a marca "de compra" que muda de embalagem, com
     * {@code flush}; depois entram os novos. Assim um codigo que muda de lista
     * no mesmo salvamento nunca viola {@code uq_codigo_barras_empresa} (o
     * Hibernate insere antes de apagar). No cadastro o produto ainda nao existe
     * no banco e nao ha o que apagar: o {@code flush} intermediario nao roda.
     */
    private void aplicarCodigosEEmbalagens(Produto produto, List<CodigoBarrasValidado> codigosDaUnidade,
            PlanoDeEmbalagens embalagens) {
        if (codigosDaUnidade != null) {
            produto.removerCodigosForaDe(new HashSet<>(textos(codigosDaUnidade)));
        }
        embalagensDoProduto.aplicarRemocoes(produto, embalagens);
        if (produto.getId() != null) {
            produtoRepository.flush();
        }
        if (codigosDaUnidade != null) {
            produto.substituirCodigos(codigosDaUnidade);
        }
        embalagensDoProduto.aplicarInclusoes(produto, embalagens);
        if (embalagens.alteraEmbalagens()) {
            produto.registrarAlteracaoDasEmbalagens();
        }
    }

    /**
     * Momento do cadastro ou da edicao, que a entidade usa na origem do custo
     * (Fase B4), na precisao do TIMESTAMP do PostgreSQL.
     */
    private LocalDateTime agora() {
        return LocalDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
    }

    /** Custo e preco de venda (anteriores nulos no cadastro) e o preco proprio de cada embalagem. */
    private void registrarHistorico(Produto produto, Long idUsuario, BigDecimal custoAnterior,
            BigDecimal precoAnterior, PlanoDeEmbalagens embalagens) {
        historicoDePrecos.registrarCustoEPrecoDeVenda(produto, idUsuario, custoAnterior, precoAnterior);
        for (PlanoDeEmbalagens.AlteracaoDePreco alteracao : embalagens.alteracoesDePreco()) {
            historicoDePrecos.registrarPrecoDaEmbalagemSeMudou(produto, idUsuario, alteracao.rotulo(),
                    alteracao.anterior(), alteracao.novo());
        }
    }

    private static List<String> textos(List<CodigoBarrasValidado> codigos) {
        return codigos.stream().map(CodigoBarrasValidado::codigo).toList();
    }

    /**
     * Inativar e reativar travam a linha (como a edicao): uma edicao
     * concorrente nao e sobrescrita pelo estado lido antes dela (lost update).
     */
    Produto inativar(Long empresaId, UUID produtoId) {
        Produto produto = buscarParaAtualizar(empresaId, produtoId);
        produto.inativar();
        return produtoRepository.save(produto);
    }

    Produto reativar(Long empresaId, UUID produtoId) {
        Produto produto = buscarParaAtualizar(empresaId, produtoId);
        produto.ativar();
        return produtoRepository.save(produto);
    }

    /**
     * Exclusao fisica (spec 4.5, DEC-030; Fase D, 4.7): so sem movimentos de
     * estoque ou so com o estoque inicial do cadastro, que e apagado junto com
     * a linha de saldo; senao 409. Os codigos de barras e o historico de precos
     * saem junto (cascade).
     *
     * <p>Trava a linha do produto, a mesma trava do ajuste de estoque: um ajuste
     * simultaneo espera e depois nao encontra o produto (404), ou conclui antes
     * e a exclusao ve o movimento (409). Se ainda assim o banco recusar o
     * {@code DELETE} pela FK RESTRICT dos movimentos, a resposta e o mesmo 409,
     * nunca 500 (Review Focus 2).
     *
     * <p><b>Rastro provisorio</b> ate existir a auditoria (divida tecnica): log
     * {@code INFO} so com identificadores — usuario, empresa e UUID publico do
     * produto — e a quantidade do estoque inicial apagado, nunca nome, SKU ou
     * outro dado do cadastro. O {@code flush} executa o {@code DELETE} antes do
     * log, para o rastro so ser registrado depois de o banco aceitar a exclusao.
     */
    void excluir(Long idUsuario, Long empresaId, UUID produtoId) {
        Produto produto = produtoRepository.buscarPorUuidParaAtualizar(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
        ResumoDeEstoque estoque = resumoDeEstoque(produto);
        if (!estoque.permiteExcluir()) {
            throw new ProdutoConflitoException(MENSAGEM_EXCLUSAO_BLOQUEADA);
        }
        if (estoque.temMovimentos()) {
            registroDeEstoqueInicial.removerParaExclusao(empresaId, produto.getId());
        }
        apagar(produto);
        registrarExclusao(idUsuario, empresaId, produtoId, estoque);
    }

    private void apagar(Produto produto) {
        try {
            // Fase B5: o JPA apaga as ligacoes com fornecedores antes do produto; a da ultima compra
            // so sai depois de o campo ser limpo e gravado (FK imediata da V14).
            if (produto.getFornecedorUltimaCompraId() != null) {
                produto.definirFornecedorDaUltimaCompra(null);
                produtoRepository.flush();
            }
            produtoRepository.delete(produto);
            produtoRepository.flush();
        } catch (DataIntegrityViolationException movimentadoNoMeioTempo) {
            throw new ProdutoConflitoException(MENSAGEM_EXCLUSAO_BLOQUEADA);
        }
    }

    private static void registrarExclusao(Long idUsuario, Long empresaId, UUID produtoId, ResumoDeEstoque estoque) {
        if (estoque.temMovimentos()) {
            LOG.info("Produto excluido: usuario={} empresa={} produto={} estoqueInicial={}", idUsuario, empresaId,
                    produtoId, estoque.saldo().stripTrailingZeros().toPlainString());
            return;
        }
        LOG.info("Produto excluido: usuario={} empresa={} produto={}", idUsuario, empresaId, produtoId);
    }

    /**
     * Resumo de estoque do produto (saldo e movimentos), que decide tanto o
     * {@code DELETE} quanto o {@code podeExcluir} da resposta. Quando vendas
     * existirem, a verificacao delas entra junto desta.
     */
    private ResumoDeEstoque resumoDeEstoque(Produto produto) {
        return usoNoEstoque.resumos(produto.getEmpresaId(), Collections.singletonList(produto.getId()))
                .getOrDefault(produto.getId(), ResumoDeEstoque.VAZIO);
    }

    /** Produto da empresa com trava de escrita (ver {@link ProdutoRepository#buscarPorUuidParaAtualizar}). */
    private Produto buscarParaAtualizar(Long empresaId, UUID produtoId) {
        return produtoRepository.buscarPorUuidParaAtualizar(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
    }

    Produto buscarPorId(Long empresaId, UUID produtoId) {
        return produtoRepository.findByUuidAndEmpresa_Id(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
    }

    /**
     * Proximo SKU no padrao {@code P} + 6 digitos (spec 4.2): o maior numero
     * entre os SKUs da empresa que seguem exatamente o padrao, mais 1. SKUs
     * fora do padrao sao ignorados; passando de 999999 o numero cresce. Nao
     * reserva: a unicidade e conferida ao salvar.
     */
    String sugerirSku(Long empresaId) {
        BigInteger maiorNumero = produtoRepository.skusNoPadrao(empresaId).stream()
                .map(SKU_NO_PADRAO::matcher)
                .filter(Matcher::matches)
                .map(numero -> new BigInteger(numero.group(1)))
                .max(Comparator.naturalOrder())
                .orElse(BigInteger.ZERO);
        return PREFIXO_SKU_SUGERIDO
                + String.format(Locale.ROOT, FORMATO_NUMERO_SKU_SUGERIDO, maiorNumero.add(BigInteger.ONE));
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    @Transactional
    public ProdutoResponse cadastrarParaUsuario(Long idUsuario, ProdutoRequest request) {
        return responder(cadastrar(idUsuario, resolverEmpresaId(idUsuario), request));
    }

    @Transactional
    public ProdutoResponse atualizarDadosBasicosParaUsuario(Long idUsuario, UUID produtoId, ProdutoRequest request) {
        return responderAposGravar(atualizarDadosBasicos(idUsuario, resolverEmpresaId(idUsuario), produtoId,
                request));
    }

    @Transactional
    public ProdutoResponse inativarParaUsuario(Long idUsuario, UUID produtoId) {
        return responderAposGravar(inativar(resolverEmpresaId(idUsuario), produtoId));
    }

    @Transactional
    public ProdutoResponse reativarParaUsuario(Long idUsuario, UUID produtoId) {
        return responderAposGravar(reativar(resolverEmpresaId(idUsuario), produtoId));
    }

    @Transactional
    public void excluirParaUsuario(Long idUsuario, UUID produtoId) {
        excluir(idUsuario, resolverEmpresaId(idUsuario), produtoId);
    }

    @Transactional(readOnly = true)
    public ProdutoResponse buscarPorIdParaUsuario(Long idUsuario, UUID produtoId) {
        return responder(buscarPorId(resolverEmpresaId(idUsuario), produtoId));
    }

    /**
     * Listagem paginada (docs/modules/produtos-listagem.md, 4 e 5), em duas
     * etapas: a {@link ConsultaDeProdutos} filtra, ordena e recorta a pagina
     * no banco (ids e total); depois os produtos desses ids sao carregados com
     * as relacoes e devolvidos NA MESMA ORDEM. As arvores de categorias (que
     * tambem resolve o filtro de categoria) e de marcas sao montadas uma vez e
     * o estoque vem em lote: o numero de comandos SQL nao depende do tamanho da
     * pagina.
     * Pagina alem do fim devolve {@code itens} vazio com o total real.
     */
    @Transactional(readOnly = true)
    public PaginaResponse<ProdutoResponse> listarParaUsuario(Long idUsuario, ParametrosDaListagem parametros) {
        Long empresaId = resolverEmpresaId(idUsuario);
        CategoriaArvore arvore = categoriaService.arvoreDaEmpresa(empresaId);
        LocalDate hoje = SituacaoPromocao.hoje(relogio);
        PaginaDeIds pagina = consultaDeProdutos.buscar(filtroDaListagem(empresaId, parametros, arvore, hoje),
                parametros.ordem(), parametros.pagina(), parametros.tamanho());
        return new PaginaResponse<>(itensDaPagina(empresaId, pagina.ids(), arvore, hoje), parametros.pagina(),
                parametros.tamanho(), pagina.total());
    }

    /**
     * Filtro da consulta: o termo vira as palavras normalizadas, o termo de
     * codigo (sem nenhum espaco Unicode; so espacos = sem busca, Review Focus 1)
     * e, se for so de digitos, o termo numerico sem zeros a esquerda (numero e
     * codigo do produto, Fase B2); a categoria vira ela e as descendentes.
     */
    private static FiltroDeProdutos filtroDaListagem(Long empresaId, ParametrosDaListagem parametros,
            CategoriaArvore arvore, LocalDate hoje) {
        return new FiltroDeProdutos(empresaId, TextoDeBusca.palavras(parametros.busca()),
                TextoDeBusca.termoDeCodigo(parametros.busca()), TextoDeBusca.termoNumerico(parametros.busca()),
                parametros.status(),
                categoriasDoFiltro(arvore, parametros.categoria()), parametros.estoque(), parametros.emPromocao(),
                hoje);
    }

    /**
     * {@code null} sem filtro; categoria fora da arvore da empresa (de outra
     * empresa ou excluida) vira conjunto vazio: lista vazia, sem revelar nada.
     */
    private static Set<Long> categoriasDoFiltro(CategoriaArvore arvore, UUID categoria) {
        if (categoria == null) {
            return null;
        }
        return arvore.buscarPeloUuid(categoria)
                .map(encontrada -> arvore.idsDaSubarvore(encontrada.getId()))
                .orElse(Set.of());
    }

    /**
     * Etapa 2: produtos dos ids com as relacoes, na ordem dos ids. Um id que
     * sumiu entre as etapas (produto excluido no meio) fica fora da pagina.
     */
    private List<ProdutoResponse> itensDaPagina(Long empresaId, List<Long> ids, CategoriaArvore categorias,
            LocalDate hoje) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, Produto> porId = produtoRepository.buscarComRelacoesPorIds(empresaId, ids).stream()
                .collect(Collectors.toMap(Produto::getId, Function.identity()));
        // Fase B3: inicializam as embalagens e os codigos delas nos produtos ja
        // carregados (duas consultas, qualquer que seja o tamanho da pagina).
        produtoRepository.carregarEmbalagens(empresaId, ids);
        produtoRepository.carregarCodigosDasEmbalagens(empresaId, ids);
        // Fase B5: as ligacoes com fornecedores (uma consulta) e os nomes deles (outra).
        produtoRepository.carregarFornecedores(empresaId, ids);
        Set<Long> fornecedorIds = porId.values().stream()
                .flatMap(produto -> produto.idsDosFornecedores().stream())
                .collect(Collectors.toSet());
        ReferenciasDoProduto referencias = new ReferenciasDoProduto(categorias, marcaService.arvoreDaEmpresa(empresaId),
                nomesDeFornecedores.porIds(empresaId, fornecedorIds));
        Map<Long, ResumoDeEstoque> estoques = usoNoEstoque.resumos(empresaId, ids);
        return ids.stream()
                .map(porId::get)
                .filter(Objects::nonNull)
                .map(produto -> responder(produto, referencias, hoje,
                        estoques.getOrDefault(produto.getId(), ResumoDeEstoque.VAZIO), null))
                .toList();
    }

    /**
     * Historico de custo e preco de venda do produto, do mais recente para o
     * mais antigo (spec 5). Leitura para qualquer autenticado; produto de
     * outra empresa responde 404 (DEC-016); pagina ou tamanho fora dos
     * limites, 400. Fase B4: as entradas por compra ligadas as linhas de custo
     * da pagina vem em uma consulta so.
     */
    @Transactional(readOnly = true)
    public PaginaResponse<HistoricoPrecoResponse> historicoDePrecosParaUsuario(Long idUsuario, UUID produtoId,
            int pagina, int tamanho) {
        Paginacao.validar(pagina, tamanho);
        Long empresaId = resolverEmpresaId(idUsuario);
        Produto produto = buscarPorId(empresaId, produtoId);
        Page<LinhaDoHistoricoDePreco> linhas = historicoPrecoRepository.historicoDoProduto(empresaId,
                produto.getId(), PageRequest.of(pagina, tamanho));
        Map<Long, EntradaDeCompra> entradas = usoNoEstoque.entradasDeCompra(empresaId, linhas.stream()
                .map(LinhaDoHistoricoDePreco::movimentoId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        return PaginaResponse.de(linhas.map(linha -> linha.resposta(entradas)));
    }

    @Transactional(readOnly = true)
    public String sugerirSkuParaUsuario(Long idUsuario) {
        return sugerirSku(resolverEmpresaId(idUsuario));
    }

    // ---------- Codigos de barras (spec 4.3) ----------

    /**
     * Codigos da unidade de venda (ate {@value #MAXIMO_CODIGOS_POR_PRODUTO}),
     * pelas regras do {@link ValidadorDeCodigosDeBarras}. Um codigo que o
     * produto ja tem mantem o formato gravado (Review Focus 1 da Fase B).
     * {@code produtoAtual} e {@code null} no cadastro.
     */
    private List<CodigoBarrasValidado> validarCodigos(Long empresaId, List<String> informados, Produto produtoAtual) {
        Map<String, FormatoCodigoBarras> gravados = EmbalagensDoProduto.formatosGravados(produtoAtual);
        return validadorDeCodigos.validar(empresaId, informados, MAXIMO_CODIGOS_POR_PRODUTO,
                MENSAGEM_LIMITE_DE_CODIGOS, CAMPO_CODIGOS_BARRAS, gravados,
                produtoAtual == null ? null : produtoAtual.getId());
    }

    // ---------- Codigo do produto e balanca (docs/modules/produtos-codigo-e-balanca.md, 2) ----------

    /**
     * Regras do codigo do produto, nesta ordem: de 1 a 999999 (400); "Vendido
     * na balanca" exige o codigo (400); na balanca, o codigo cabe nos digitos
     * da etiqueta da empresa (400, mesmo sem mudar o codigo: Review Focus 3);
     * unico na empresa, fora o proprio produto na edicao (409 com o nome).
     * {@code produtoAtualId} e {@code null} no cadastro. Nada e consultado para
     * o produto sem codigo e fora da balanca (Review Focus 5).
     */
    private void validarCodigoDoProduto(Long empresaId, ProdutoRequest request, Long produtoAtualId) {
        Integer codigo = request.codigo();
        if (codigo != null && (codigo < MENOR_CODIGO_DO_PRODUTO || codigo > MAIOR_CODIGO_DO_PRODUTO)) {
            throw new RegraDeNegocioException(MENSAGEM_CODIGO_DO_PRODUTO_FORA_DO_INTERVALO, CAMPO_CODIGO_DO_PRODUTO);
        }
        if (vendidoNaBalanca(request)) {
            exigirCodigoQueCabeNaEtiqueta(empresaId, codigo);
        }
        if (codigo != null) {
            produtoRepository.nomeDoProdutoComCodigo(empresaId, codigo, produtoAtualId).ifPresent(nome -> {
                throw codigoEmUso(nome);
            });
        }
    }

    private void exigirCodigoQueCabeNaEtiqueta(Long empresaId, Integer codigo) {
        if (codigo == null) {
            throw new RegraDeNegocioException(MENSAGEM_BALANCA_SEM_CODIGO, CAMPO_CODIGO_DO_PRODUTO);
        }
        int digitosNaEtiqueta = tamanhoDoCodigoNaEtiqueta.digitosCodigo(empresaId);
        if (String.valueOf(codigo).length() > digitosNaEtiqueta) {
            throw new RegraDeNegocioException(MENSAGEM_CODIGO_MAIOR_QUE_A_ETIQUETA.formatted(digitosNaEtiqueta),
                    CAMPO_CODIGO_DO_PRODUTO);
        }
    }

    private static ProdutoConflitoException codigoEmUso(String nomeDoOutroProduto) {
        return new ProdutoConflitoException(MENSAGEM_CODIGO_DO_PRODUTO_EM_USO.formatted(nomeDoOutroProduto),
                CAMPO_CODIGO_DO_PRODUTO);
    }

    /**
     * Aplica {@code alteracoes} (codigos e embalagens, que podem dar
     * {@code flush}), grava o produto e aplica no banco ja aqui ({@code flush}),
     * para que uma corrida vire o mesmo 409 da checagem, com o nome do outro
     * produto: a recusa de {@code uq_produto_empresa_codigo} (outro produto
     * gravou o mesmo codigo do produto depois da checagem) ou de
     * {@code uq_codigo_barras_empresa} (o mesmo para um codigo de barras, da
     * unidade ou de uma embalagem, Fase B3). A transacao atual foi abortada
     * pelo PostgreSQL, entao o dono e lido numa transacao nova. Com
     * embalagens, a unicidade adiada de unidade e quantidade e conferida aqui
     * mesmo ({@code SET CONSTRAINTS ... IMMEDIATE}), e nao no commit. Qualquer
     * outra violacao segue como esta (409 generico do
     * {@code GlobalExceptionHandler}).
     */
    private Produto gravar(Produto produto, Runnable alteracoes) {
        try {
            alteracoes.run();
            Produto gravado = produtoRepository.save(produto);
            produtoRepository.flush();
            if (!produto.getEmbalagens().isEmpty()) {
                produtoRepository.conferirUnicidadeDasEmbalagensAgora();
            }
            return gravado;
        } catch (DataIntegrityViolationException violacao) {
            if (violou(violacao, CONSTRAINT_CODIGO_DO_PRODUTO)) {
                throw codigoDoProdutoEmUsoNaCorrida(produto);
            }
            if (violou(violacao, CONSTRAINT_CODIGO_DE_BARRAS)) {
                throw codigoDeBarrasEmUsoNaCorrida(produto);
            }
            throw violacao;
        }
    }

    private ProdutoConflitoException codigoDoProdutoEmUsoNaCorrida(Produto produto) {
        return produtoRepository.nomeDoProdutoComCodigoEmNovaTransacao(produto.getEmpresaId(),
                        produto.getCodigo(), produto.getId())
                .map(ProdutoService::codigoEmUso)
                .orElseGet(() -> new ProdutoConflitoException(MENSAGEM_CODIGO_DO_PRODUTO_EM_USO_SEM_NOME,
                        CAMPO_CODIGO_DO_PRODUTO));
    }

    /**
     * O primeiro codigo de barras do produto (os da unidade, depois os de cada
     * embalagem, na ordem) que outro produto gravou primeiro, com o campo da
     * lista dele; sem dono encontrado (o outro mudou no meio tempo), 409 sem
     * nome.
     */
    private ProdutoConflitoException codigoDeBarrasEmUsoNaCorrida(Produto produto) {
        Map<String, String> campoPorCodigo = new LinkedHashMap<>();
        produto.getCodigosBarras().forEach(codigo -> campoPorCodigo.put(codigo.getCodigo(), CAMPO_CODIGOS_BARRAS));
        List<ProdutoEmbalagem> embalagens = produto.getEmbalagens();
        for (int indice = 0; indice < embalagens.size(); indice++) {
            String campo = EmbalagensDoProduto.campo(indice, CAMPO_CODIGOS_BARRAS);
            embalagens.get(indice).getCodigosBarras()
                    .forEach(codigo -> campoPorCodigo.put(codigo.getCodigo(), campo));
        }
        if (campoPorCodigo.isEmpty()) {
            return new ProdutoConflitoException(MENSAGEM_CODIGO_DE_BARRAS_EM_USO_SEM_NOME);
        }
        Map<String, CodigoDeBarrasEmUso> emUso = produtoRepository
                .codigosEmUsoEmNovaTransacao(produto.getEmpresaId(), campoPorCodigo.keySet(), produto.getId())
                .stream()
                .collect(Collectors.toMap(CodigoDeBarrasEmUso::codigo, Function.identity(),
                        (primeiro, outro) -> primeiro));
        return campoPorCodigo.entrySet().stream()
                .filter(codigo -> emUso.containsKey(codigo.getKey()))
                .findFirst()
                .map(codigo -> new ProdutoConflitoException(emUso.get(codigo.getKey()).mensagem(), codigo.getValue()))
                .orElseGet(() -> new ProdutoConflitoException(MENSAGEM_CODIGO_DE_BARRAS_EM_USO_SEM_NOME,
                        CAMPO_CODIGOS_BARRAS));
    }

    /**
     * Se a violacao veio da constraint informada. O nome vem do campo
     * "constraint" que o PostgreSQL envia no erro ({@link PSQLException}), que
     * nao depende do idioma das mensagens do servidor; so sem ele vale o nome
     * que o Hibernate extraiu do texto da mensagem.
     */
    private static boolean violou(DataIntegrityViolationException violacao, String constraint) {
        String nomeDoServidor = null;
        String nomeDoHibernate = null;
        for (Throwable causa = violacao; causa != null; causa = causa.getCause()) {
            if (causa instanceof PSQLException doServidor && doServidor.getServerErrorMessage() != null) {
                nomeDoServidor = doServidor.getServerErrorMessage().getConstraint();
            }
            if (causa instanceof ConstraintViolationException doHibernate && nomeDoHibernate == null) {
                nomeDoHibernate = doHibernate.getConstraintName();
            }
        }
        String nome = nomeDoServidor != null ? nomeDoServidor : nomeDoHibernate;
        return constraint.equalsIgnoreCase(nome);
    }

    // ---------- Unidade e categoria ----------

    /** Cadastros vinculados ao produto, ja resolvidos e validados dentro da empresa. */
    private record Vinculos(UnidadeMedida unidade, Categoria categoria, Marca marca) {
    }

    /**
     * Resolve unidade e categoria pelo UUID dentro da empresa (404 se de outra
     * empresa) e aplica as regras da spec 5.1. {@code produtoAtual} e
     * {@code null} no cadastro; na edicao, permite manter uma
     * unidade/categoria que foi inativada depois (Review Focus 4).
     */
    private Vinculos resolverVinculos(Long empresaId, ProdutoRequest request, Produto produtoAtual) {
        if (request.unidadeId() == null) {
            // Defesa alem do Bean Validation, para chamadas sem @Valid.
            throw new RegraDeNegocioException(MENSAGEM_UNIDADE_OBRIGATORIA);
        }
        UnidadeMedida unidade = unidadeService.buscarDaEmpresa(empresaId, request.unidadeId());
        exigirUnidadeAtivaOuAtual(unidade, produtoAtual == null ? null : produtoAtual.getUnidade(),
                MENSAGEM_UNIDADE_INATIVA);
        Categoria categoria = buscarCategoriaOpcional(empresaId, request.categoriaId());
        exigirCategoriaSelecionavelOuAtual(empresaId, categoria,
                produtoAtual == null ? null : produtoAtual.getCategoria());
        Marca marca = buscarMarcaOpcional(empresaId, request.marcaId());
        exigirMarcaSelecionavelOuAtual(empresaId, marca, produtoAtual == null ? null : produtoAtual.getMarca());
        return new Vinculos(unidade, categoria, marca);
    }

    private Categoria buscarCategoriaOpcional(Long empresaId, UUID categoriaId) {
        return categoriaId == null ? null : categoriaService.buscarDaEmpresa(empresaId, categoriaId);
    }

    private Marca buscarMarcaOpcional(Long empresaId, UUID marcaId) {
        return marcaId == null ? null : marcaService.buscarDaEmpresa(empresaId, marcaId);
    }

    /**
     * Unidade inativa so e aceita se ja for a do produto (edicao sem trocar).
     */
    private static void exigirUnidadeAtivaOuAtual(UnidadeMedida escolhida, UnidadeMedida atual,
            String mensagemSeInativa) {
        if (escolhida != null && !escolhida.isAtivo() && !mesmoRegistro(escolhida.getId(), atual)) {
            throw new RegraDeNegocioException(mensagemSeInativa);
        }
    }

    /**
     * Categoria nao selecionavel (inativa ou sob ancestral inativo) so e
     * aceita se ja for a do produto. A arvore so e montada quando precisa.
     */
    private void exigirCategoriaSelecionavelOuAtual(Long empresaId, Categoria escolhida, Categoria atual) {
        if (escolhida == null || mesmoRegistro(escolhida.getId(), atual)) {
            return;
        }
        if (!categoriaService.arvoreDaEmpresa(empresaId).selecionavel(escolhida.getId())) {
            throw new RegraDeNegocioException(MENSAGEM_CATEGORIA_INATIVA);
        }
    }

    /**
     * Fase B5 (spec 3.3): como a categoria, a marca nao selecionavel (inativa
     * ou sob ancestral inativo) so e aceita se ja for a do produto.
     */
    private void exigirMarcaSelecionavelOuAtual(Long empresaId, Marca escolhida, Marca atual) {
        if (escolhida == null || (atual != null && Objects.equals(atual.getId(), escolhida.getId()))) {
            return;
        }
        if (!marcaService.arvoreDaEmpresa(empresaId).selecionavel(escolhida.getId())) {
            throw new RegraDeNegocioException(MENSAGEM_MARCA_INATIVA);
        }
    }

    private static boolean mesmoRegistro(Long idEscolhido, UnidadeMedida atual) {
        return atual != null && Objects.equals(atual.getId(), idEscolhido);
    }

    private static boolean mesmoRegistro(Long idEscolhido, Categoria atual) {
        return atual != null && Objects.equals(atual.getId(), idEscolhido);
    }

    // ---------- Promocao e atacado (docs/modules/produtos-precos.md, 4.3 e 4.4) ----------

    /**
     * Preco especial (promocional ou de atacado) e as mensagens dele: maior que
     * zero, menor que o preco de venda e nao abaixo do preco minimo.
     */
    private enum PrecoEspecial {
        PROMOCIONAL("Preço promocional", CAMPO_PROMOCAO_PRECO),
        ATACADO("Preço de atacado", CAMPO_ATACADO_PRECO);

        private final String nome;
        private final String campo;

        PrecoEspecial(String nome, String campo) {
            this.nome = nome;
            this.campo = campo;
        }

        void validar(BigDecimal preco, BigDecimal precoVenda, BigDecimal precoMinimo) {
            if (preco.signum() <= 0) {
                throw new RegraDeNegocioException(nome + " deve ser maior que zero.", campo);
            }
            if (preco.compareTo(precoVenda) >= 0) {
                throw new RegraDeNegocioException(nome + " deve ser menor que o preço de venda.", campo);
            }
            if (precoMinimo != null && preco.compareTo(precoMinimo) < 0) {
                throw new RegraDeNegocioException(nome + " não pode ser menor que o preço mínimo.", campo);
            }
        }
    }

    /**
     * Valida os blocos opcionais de promocao e atacado (nulo = sem o bloco).
     * Roda depois de {@code resolverVinculos}, porque a fracao da quantidade
     * minima depende da unidade de venda resolvida. As comparacoes sao com o
     * preco de venda DO REQUEST: baixar o preco de venda ate a promocao gravada
     * (que o formulario reenvia) da 400 em {@code promocao.preco}.
     *
     * <p>Promocao encerrada ou com datas no passado e aceita: nao se valida
     * "fim >= hoje", para nao bloquear a edicao de outros campos (spec 4.3).
     */
    private static void validarPromocaoEAtacado(ProdutoRequest request, UnidadeMedida unidade) {
        if (request.promocao() != null) {
            validarPromocao(request.promocao(), request.precoVenda(), request.precoMinimo());
        }
        if (request.atacado() != null) {
            validarAtacado(request.atacado(), request.precoVenda(), request.precoMinimo(), unidade);
        }
    }

    /** Ordem: completa -> periodo -> preco > 0 -> menor que a venda -> nao abaixo do minimo. */
    private static void validarPromocao(PromocaoRequest promocao, BigDecimal precoVenda, BigDecimal precoMinimo) {
        exigirInformado(promocao.preco(), MENSAGEM_PRECO_PROMOCIONAL_OBRIGATORIO, CAMPO_PROMOCAO_PRECO);
        exigirInformado(promocao.inicio(), MENSAGEM_INICIO_PROMOCAO_OBRIGATORIO, CAMPO_PROMOCAO_INICIO);
        exigirInformado(promocao.fim(), MENSAGEM_FIM_PROMOCAO_OBRIGATORIO, CAMPO_PROMOCAO_FIM);
        if (promocao.fim().isBefore(promocao.inicio())) {
            throw new RegraDeNegocioException(MENSAGEM_FIM_ANTES_DO_INICIO, CAMPO_PROMOCAO_FIM);
        }
        PrecoEspecial.PROMOCIONAL.validar(promocao.preco(), precoVenda, precoMinimo);
    }

    /**
     * Ordem: completo -> preco (> 0, menor que a venda, nao abaixo do minimo)
     * -> quantidade > 1 -> fracao conforme a unidade de venda -> ate 3 casas
     * (defesa alem do Bean Validation, para chamadas sem {@code @Valid}).
     */
    private static void validarAtacado(AtacadoRequest atacado, BigDecimal precoVenda, BigDecimal precoMinimo,
            UnidadeMedida unidade) {
        exigirInformado(atacado.preco(), MENSAGEM_PRECO_ATACADO_OBRIGATORIO, CAMPO_ATACADO_PRECO);
        exigirInformado(atacado.quantidadeMinima(), MENSAGEM_QUANTIDADE_ATACADO_OBRIGATORIA,
                CAMPO_ATACADO_QUANTIDADE_MINIMA);
        PrecoEspecial.ATACADO.validar(atacado.preco(), precoVenda, precoMinimo);
        BigDecimal quantidadeMinima = atacado.quantidadeMinima();
        if (quantidadeMinima.compareTo(BigDecimal.ONE) <= 0) {
            throw new RegraDeNegocioException(MENSAGEM_QUANTIDADE_ATACADO_ATE_UM, CAMPO_ATACADO_QUANTIDADE_MINIMA);
        }
        if (!UnidadeMedida.quantidadeValida(unidade.isFracionada(), quantidadeMinima)) {
            throw new RegraDeNegocioException(UnidadeMedida.mensagemSemFracao(unidade.getSigla()),
                    CAMPO_ATACADO_QUANTIDADE_MINIMA);
        }
        if (quantidadeMinima.stripTrailingZeros().scale() > CASAS_QUANTIDADE_ATACADO) {
            throw new RegraDeNegocioException(MENSAGEM_QUANTIDADE_ATACADO_CASAS, CAMPO_ATACADO_QUANTIDADE_MINIMA);
        }
    }

    // ---------- Estoque (docs/modules/produtos-estoque.md, 4.4 e 4.8) ----------

    /**
     * Estoque inicial do cadastro (opcional): exige o controle de estoque
     * ligado e segue as regras de quantidade (maior que zero, ate 3 casas,
     * fracao so em unidade fracionada).
     */
    private static void validarEstoqueInicial(ProdutoRequest request, UnidadeMedida unidade) {
        BigDecimal estoqueInicial = request.estoqueInicial();
        if (estoqueInicial == null) {
            return;
        }
        if (!request.controlaEstoque()) {
            throw new RegraDeNegocioException(MENSAGEM_ESTOQUE_INICIAL_SEM_CONTROLE, CAMPO_ESTOQUE_INICIAL);
        }
        QuantidadeDeEstoque.validarPositiva(estoqueInicial, unidade, CAMPO_ESTOQUE_INICIAL);
    }

    /**
     * Produto com movimentos de estoque nao troca a unidade de venda: as
     * quantidades gravadas perderiam o significado. So consulta o estoque se a
     * unidade mudou.
     */
    private void exigirUnidadeMantidaSeMovimentado(Produto produto, UnidadeMedida unidadeEscolhida) {
        if (mesmoRegistro(unidadeEscolhida.getId(), produto.getUnidade())) {
            return;
        }
        if (resumoDeEstoque(produto).temMovimentos()) {
            throw new RegraDeNegocioException(MENSAGEM_UNIDADE_DE_PRODUTO_MOVIMENTADO, CAMPO_UNIDADE);
        }
    }

    /** Campo obrigatorio do bloco (defesa alem do Bean Validation, para chamadas sem {@code @Valid}). */
    private static void exigirInformado(Object valor, String mensagem, String campo) {
        if (valor == null) {
            throw new RegraDeNegocioException(mensagem, campo);
        }
    }

    // ---------- Apoio ----------

    /**
     * Dados do cadastro a partir do request: textos aparados (vazio vira
     * {@code null}), vinculos resolvidos e promocao/atacado ausentes como nulos.
     */
    private static DadosProduto dadosDoProduto(ProdutoRequest request, Vinculos vinculos, String sku) {
        Optional<PromocaoRequest> promocao = Optional.ofNullable(request.promocao());
        Optional<AtacadoRequest> atacado = Optional.ofNullable(request.atacado());
        return new DadosProduto(request.nome().trim(), normalizarOuNulo(request.nomeCurto()),
                vinculos.marca(), normalizarOuNulo(request.descricao()), vinculos.unidade(), vinculos.categoria(),
                request.precoVenda(), request.custo(),
                request.precoMinimo(), request.estoqueMinimo(), request.estoqueMaximo(), request.pontoReposicao(),
                sku,
                promocao.map(PromocaoRequest::preco).orElse(null),
                promocao.map(PromocaoRequest::inicio).orElse(null),
                promocao.map(PromocaoRequest::fim).orElse(null),
                atacado.map(AtacadoRequest::preco).orElse(null),
                atacado.map(AtacadoRequest::quantidadeMinima).orElse(null),
                request.controlaEstoque(),
                request.codigo(),
                vendidoNaBalanca(request));
    }

    /** {@code vendidoBalanca} ausente no request vale {@code false} (spec 8). */
    private static boolean vendidoNaBalanca(ProdutoRequest request) {
        return Boolean.TRUE.equals(request.vendidoBalanca());
    }

    /**
     * Resposta de um produto; cada arvore so e carregada se o produto tiver
     * categoria ou marca, os nomes dos fornecedores numa consulta (nenhuma sem
     * fornecedor), e a ultima compra (Fase B4) so com a origem do custo
     * {@code ENTRADA_COMPRA}.
     */
    private ProdutoResponse responder(Produto produto) {
        Long empresaId = produto.getEmpresaId();
        CategoriaArvore categorias = produto.getCategoria() == null
                ? CategoriaArvore.de(List.of())
                : categoriaService.arvoreDaEmpresa(empresaId);
        Arvore<Marca> marcas = produto.getMarca() == null
                ? Arvore.de(List.of())
                : marcaService.arvoreDaEmpresa(empresaId);
        ReferenciasDoProduto referencias = new ReferenciasDoProduto(categorias, marcas,
                nomesDeFornecedores.porIds(empresaId, produto.idsDosFornecedores()));
        return responder(produto, referencias, SituacaoPromocao.hoje(relogio), resumoDeEstoque(produto),
                ultimaCompra(produto));
    }

    private EntradaDeCompra ultimaCompra(Produto produto) {
        if (produto.getCustoOrigem() != OrigemDoCusto.ENTRADA_COMPRA) {
            return null;
        }
        return usoNoEstoque.ultimaEntradaDeCompra(produto.getEmpresaId(), produto.getId()).orElse(null);
    }

    private static ProdutoResponse responder(Produto produto, ReferenciasDoProduto referencias, LocalDate hoje,
            ResumoDeEstoque estoque, EntradaDeCompra ultimaCompra) {
        return ProdutoResponse.de(produto, referencias, estoque.permiteExcluir(), hoje, estoque, ultimaCompra);
    }

    /**
     * Resposta depois de aplicar a alteracao no banco: o {@code flush} dispara o
     * {@code @PreUpdate} do produto, entao o {@code atualizadoEm} da resposta e
     * o mesmo que ficou gravado.
     */
    private ProdutoResponse responderAposGravar(Produto produto) {
        produtoRepository.flush();
        return responder(produto);
    }

    private Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }

    /**
     * Normaliza string em branco/vazia para {@code null} e apara as demais.
     * Evita gravar {@code ""}: a constraint UNIQUE(empresa_id, sku) do Postgres
     * trata multiplas strings vazias como conflitantes entre si (diferente de
     * NULL), e a V7 proibe nome curto vazio ou com espacos nas pontas.
     */
    private static String normalizarOuNulo(String valor) {
        return StringUtils.hasText(valor) ? valor.trim() : null;
    }

    private static void validarCampos(ProdutoRequest request) {
        if (request.controlaEstoque() == null) {
            // Defesa alem do Bean Validation, para chamadas sem @Valid.
            throw new RegraDeNegocioException(MENSAGEM_CONTROLE_DE_ESTOQUE_OBRIGATORIO, CAMPO_CONTROLA_ESTOQUE);
        }
        validarDadosBasicos(request.nome(), request.precoVenda(), request.custo(), request.estoqueMinimo());
        validarCamposCadastrais(request.precoVenda(), request.estoqueMinimo(), request.estoqueMaximo(),
                request.pontoReposicao(), request.precoMinimo());
    }

    private static void validarDadosBasicos(String nome, BigDecimal precoVenda, BigDecimal custo,
            BigDecimal estoqueMinimo) {
        if (!StringUtils.hasText(nome)) {
            throw new RegraDeNegocioException("Nome do produto é obrigatório.");
        }
        if (precoVenda == null) {
            throw new RegraDeNegocioException("Preço de venda é obrigatório.");
        }
        if (precoVenda.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Preço de venda não pode ser negativo.");
        }
        if (custo != null && custo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Custo não pode ser negativo.");
        }
        if (estoqueMinimo != null && estoqueMinimo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Estoque mínimo não pode ser negativo.");
        }
    }

    /**
     * Valida os campos cadastrais do incremento (V4): nao-negativos dos novos
     * numericos e as regras cruzadas (preco minimo x preco de venda; estoque
     * maximo x estoque minimo). As regras cruzadas so sao aplicadas quando ambos
     * os lados estao informados. A violacao gera {@link RegraDeNegocioException}
     * (400), nunca deixa a constraint do banco falhar.
     */
    private static void validarCamposCadastrais(BigDecimal precoVenda, BigDecimal estoqueMinimo,
            BigDecimal estoqueMaximo, BigDecimal pontoReposicao, BigDecimal precoMinimo) {
        if (estoqueMaximo != null && estoqueMaximo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Estoque máximo não pode ser negativo.");
        }
        if (pontoReposicao != null && pontoReposicao.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Ponto de reposição não pode ser negativo.");
        }
        if (precoMinimo != null && precoMinimo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Preço mínimo não pode ser negativo.");
        }
        if (precoMinimo != null && precoVenda != null && precoMinimo.compareTo(precoVenda) > 0) {
            throw new RegraDeNegocioException("Preço mínimo não pode ser maior que o preço de venda.");
        }
        if (estoqueMaximo != null && estoqueMinimo != null && estoqueMaximo.compareTo(estoqueMinimo) < 0) {
            throw new RegraDeNegocioException("Estoque máximo não pode ser menor que o estoque mínimo.");
        }
        // Fase D (spec 4.6): minimo <= ponto de reposicao <= maximo, quando os dois lados existem.
        if (pontoReposicao != null && estoqueMinimo != null && pontoReposicao.compareTo(estoqueMinimo) < 0) {
            throw new RegraDeNegocioException(MENSAGEM_PONTO_MENOR_QUE_MINIMO, CAMPO_PONTO_REPOSICAO);
        }
        if (estoqueMaximo != null && pontoReposicao != null && estoqueMaximo.compareTo(pontoReposicao) < 0) {
            throw new RegraDeNegocioException(MENSAGEM_MAXIMO_MENOR_QUE_PONTO, CAMPO_ESTOQUE_MAXIMO);
        }
    }

    private void garantirSkuDisponivelParaNovoProduto(Long empresaId, String sku) {
        if (sku != null && produtoRepository.existsBySkuAndEmpresa_Id(sku, empresaId)) {
            throw new ProdutoConflitoException(MENSAGEM_SKU_DUPLICADO, CAMPO_SKU);
        }
    }

    private void garantirSkuDisponivelParaProdutoExistente(Long empresaId, Long produtoId, String sku) {
        if (sku != null && produtoRepository.existsBySkuAndEmpresa_IdAndIdNot(sku, empresaId, produtoId)) {
            throw new ProdutoConflitoException(MENSAGEM_SKU_DUPLICADO, CAMPO_SKU);
        }
    }
}
