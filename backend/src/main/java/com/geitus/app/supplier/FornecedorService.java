package com.geitus.app.supplier;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.LigacaoDoProduto;
import com.geitus.app.catalog.Paginacao;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.ProdutosDoFornecedor;
import com.geitus.app.catalog.arvore.Arvore;
import com.geitus.app.catalog.dto.MarcaResumo;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoDoFornecedorResponse;
import com.geitus.app.catalog.listagem.PaginaDeIds;
import com.geitus.app.catalog.listagem.StatusFiltro;
import com.geitus.app.catalog.marca.Marca;
import com.geitus.app.catalog.marca.MarcaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.shared.numeracao.Numerador;
import com.geitus.app.shared.numeracao.TipoNumeracao;
import com.geitus.app.supplier.dto.FornecedorItemResponse;
import com.geitus.app.supplier.dto.FornecedorRequest;
import com.geitus.app.supplier.dto.FornecedorResponse;
import com.geitus.app.supplier.listagem.ConsultaDeFornecedores;
import com.geitus.app.supplier.listagem.FiltroDeFornecedores;

/**
 * Regras de negocio dos fornecedores (docs/modules/fornecedores-e-marcas.md, 4).
 *
 * <p>Mesmo desenho do {@code ClienteService}: os metodos {@code *ParaUsuario}
 * recebem o {@code idUsuario} do JWT e resolvem a empresa internamente
 * (DEC-016). Fornecedor, representante e marca de outra empresa sao tratados
 * como inexistentes (404).
 *
 * <p>Os dados chegam crus e passam pela {@link ValidacaoDoFornecedor} ANTES
 * de qualquer consulta: o documento com mascara e comparado ja so com
 * digitos. A unicidade do documento e conferida antes de gravar (409 com o
 * nome do outro fornecedor); o indice unico parcial da V14 e a rede contra a
 * corrida (409 generico no handler). O numero (sequencial por empresa) e
 * reservado so depois das validacoes, na mesma transacao.
 *
 * <p>Os produtos que o fornecedor vende e as entradas registradas com ele
 * chegam pelas interfaces {@link ProdutosDoFornecedor} (catalogo) e
 * {@link EntradasDoFornecedor} (estoque): este pacote nao conhece as tabelas
 * deles. Documento e telefones sao dados de contato: nada aqui e logado.
 */
@Service
public class FornecedorService {

    static final int MAXIMO_DE_MARCAS = 200;
    /** O mesmo limite da busca de produtos (ParametrosDaListagem). */
    static final int TAMANHO_MAXIMO_DA_BUSCA = 200;
    static final String MENSAGEM_BUSCA_LONGA = "A busca deve ter no máximo 200 caracteres.";
    static final String CAMPO_BUSCA = "busca";

    static final String MENSAGEM_DOCUMENTO_REPETIDO = "Já existe o fornecedor %s com este %s.";
    static final String MENSAGEM_EXCLUSAO_BLOQUEADA =
            "Não é possível excluir: o fornecedor tem %d produto(s) ligados e %d entrada(s) registradas. Inative-o.";
    static final String MENSAGEM_REPRESENTANTE_NAO_ENCONTRADO = "Representante não encontrado.";
    static final String MENSAGEM_MARCA_NAO_ENCONTRADA = "Marca não encontrada.";
    static final String MENSAGEM_MARCA_INATIVA = "Esta marca está inativa. Escolha uma marca ativa.";
    static final String MENSAGEM_MARCAS_DEMAIS = "Informe no máximo 200 marcas.";
    static final String MENSAGEM_FORNECEDOR_INATIVO = "Este fornecedor está inativo.";
    static final String CAMPO_MARCAS = "marcaIds";

    private final FornecedorRepository fornecedorRepository;
    private final ConsultaDeFornecedores consultaDeFornecedores;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final Numerador numerador;
    private final MarcaService marcaService;
    private final ProdutosDoFornecedor produtosDoFornecedor;
    private final EntradasDoFornecedor entradasDoFornecedor;

    public FornecedorService(FornecedorRepository fornecedorRepository, ConsultaDeFornecedores consultaDeFornecedores,
            EmpresaRepository empresaRepository, UsuarioRepository usuarioRepository, Numerador numerador,
            MarcaService marcaService, ProdutosDoFornecedor produtosDoFornecedor,
            EntradasDoFornecedor entradasDoFornecedor) {
        this.fornecedorRepository = fornecedorRepository;
        this.consultaDeFornecedores = consultaDeFornecedores;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.numerador = numerador;
        this.marcaService = marcaService;
        this.produtosDoFornecedor = produtosDoFornecedor;
        this.entradasDoFornecedor = entradasDoFornecedor;
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    /**
     * Listagem paginada por nome (spec 4.7), em duas etapas como a de
     * produtos: a {@link ConsultaDeFornecedores} filtra e recorta a pagina no
     * banco; depois os fornecedores da pagina vem com os representantes e as
     * contagens de produtos em lote. O numero de comandos SQL nao depende do
     * tamanho da pagina.
     */
    @Transactional(readOnly = true)
    public PaginaResponse<FornecedorItemResponse> listarParaUsuario(Long idUsuario, String busca, String status,
            int pagina, int tamanho) {
        if (busca != null && busca.length() > TAMANHO_MAXIMO_DA_BUSCA) {
            throw new RegraDeNegocioException(MENSAGEM_BUSCA_LONGA, CAMPO_BUSCA);
        }
        Paginacao.validar(pagina, tamanho);
        StatusFiltro statusFiltro = StatusFiltro.doParametro(status);
        Long empresaId = resolverEmpresaId(idUsuario);
        PaginaDeIds ids = consultaDeFornecedores.buscar(FiltroDeFornecedores.de(empresaId, busca, statusFiltro),
                pagina, tamanho);
        return new PaginaResponse<>(itensDaPagina(empresaId, ids.ids()), pagina, tamanho, ids.total());
    }

    @Transactional(readOnly = true)
    public FornecedorResponse buscarParaUsuario(Long idUsuario, UUID id) {
        return responder(buscarDaEmpresa(resolverEmpresaId(idUsuario), id));
    }

    @Transactional
    public FornecedorResponse cadastrarParaUsuario(Long idUsuario, FornecedorRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        DadosFornecedor dados = ValidacaoDoFornecedor.dados(request);
        List<DadosRepresentante> representantes = representantesDoRequest(request, null);
        Set<Long> marcaIds = marcasDoRequest(empresaId, request.marcaIds(), Set.of());
        garantirDocumentoDisponivel(empresaId, dados, null);

        Empresa empresa = empresaRepository.findById(empresaId).orElseThrow(CredenciaisInvalidasException::new);
        long numero = numerador.proximo(empresaId, TipoNumeracao.FORNECEDOR);
        Fornecedor fornecedor = new Fornecedor(empresa, numero, dados);
        fornecedor.substituirRepresentantes(representantes);
        fornecedor.substituirMarcas(marcaIds);
        return responder(fornecedorRepository.save(fornecedor));
    }

    /**
     * Atualiza o cadastro. {@code representantes} e {@code marcaIds} ausentes
     * mantem as listas atuais; uma lista (inclusive {@code []}) substitui a
     * inteira. Marca inativa ou sob ancestral inativo so continua se ja
     * estava ligada.
     */
    @Transactional
    public FornecedorResponse atualizarParaUsuario(Long idUsuario, UUID id, FornecedorRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        Fornecedor fornecedor = buscarParaAtualizar(empresaId, id);
        // Sem tipoPessoa no PATCH, vale o tipo atual (e nao o padrao PJ do cadastro).
        DadosFornecedor dados = ValidacaoDoFornecedor.dados(request, fornecedor.getTipoPessoa());
        List<DadosRepresentante> representantes = representantesDoRequest(request, fornecedor);
        Set<Long> marcaIds = request.marcaIds() == null ? null
                : marcasDoRequest(empresaId, request.marcaIds(), fornecedor.getMarcaIds());
        garantirDocumentoDisponivel(empresaId, dados, fornecedor.getId());

        fornecedor.atualizarDados(dados);
        if (representantes != null) {
            fornecedor.substituirRepresentantes(representantes);
        }
        if (marcaIds != null) {
            fornecedor.substituirMarcas(marcaIds);
        }
        return responderAposGravar(fornecedor);
    }

    @Transactional
    public FornecedorResponse inativarParaUsuario(Long idUsuario, UUID id) {
        Fornecedor fornecedor = buscarParaAtualizar(resolverEmpresaId(idUsuario), id);
        fornecedor.inativar();
        return responderAposGravar(fornecedor);
    }

    @Transactional
    public FornecedorResponse reativarParaUsuario(Long idUsuario, UUID id) {
        Fornecedor fornecedor = buscarParaAtualizar(resolverEmpresaId(idUsuario), id);
        fornecedor.ativar();
        return responderAposGravar(fornecedor);
    }

    /**
     * Exclusao fisica so sem produtos ligados e sem entradas registradas
     * (spec 4.5); representantes e marcas saem junto. Se um vinculo surgir
     * entre a contagem e o {@code DELETE}, a FK RESTRICT da V14 recusa e o
     * handler responde 409.
     */
    @Transactional
    public void excluirParaUsuario(Long idUsuario, UUID id) {
        Long empresaId = resolverEmpresaId(idUsuario);
        Fornecedor fornecedor = buscarParaAtualizar(empresaId, id);
        long produtos = produtosDoFornecedor.contar(empresaId, fornecedor.getId());
        long entradas = entradasDoFornecedor.contar(empresaId, fornecedor.getId());
        if (produtos > 0 || entradas > 0) {
            throw new FornecedorConflitoException(MENSAGEM_EXCLUSAO_BLOQUEADA.formatted(produtos, entradas));
        }
        fornecedorRepository.delete(fornecedor);
        fornecedorRepository.flush();
    }

    // ---------- Produtos que vende (spec 4.4) ----------

    @Transactional(readOnly = true)
    public PaginaResponse<ProdutoDoFornecedorResponse> produtosParaUsuario(Long idUsuario, UUID id, int pagina,
            int tamanho) {
        Paginacao.validar(pagina, tamanho);
        Long empresaId = resolverEmpresaId(idUsuario);
        Fornecedor fornecedor = buscarDaEmpresa(empresaId, id);
        return produtosDoFornecedor.pagina(empresaId, fornecedor.getId(), pagina, tamanho);
    }

    /**
     * Liga um produto da empresa ao fornecedor (a mesma lista do produto),
     * idempotente. O fornecedor inativo e conferido antes (400): ele nao ganha
     * produtos pela tela dele; os que ja estavam ligados continuam.
     */
    @Transactional
    public LigacaoDoProduto ligarProdutoParaUsuario(Long idUsuario, UUID id, UUID produtoId) {
        Long empresaId = resolverEmpresaId(idUsuario);
        Fornecedor fornecedor = buscarParaAtualizar(empresaId, id);
        if (!fornecedor.isAtivo()) {
            throw new DadosFornecedorInvalidosException(MENSAGEM_FORNECEDOR_INATIVO, null);
        }
        return produtosDoFornecedor.ligar(empresaId, fornecedor.getId(), produtoId);
    }

    /** Tira o produto do fornecedor; se ele era o da ultima compra, o campo do produto e limpo (Review Focus 1). */
    @Transactional
    public void desligarProdutoParaUsuario(Long idUsuario, UUID id, UUID produtoId) {
        Long empresaId = resolverEmpresaId(idUsuario);
        Fornecedor fornecedor = buscarParaAtualizar(empresaId, id);
        produtosDoFornecedor.desligar(empresaId, fornecedor.getId(), produtoId);
    }

    // ---------- Uso interno do pacote ----------

    /** Fornecedor da empresa pelo UUID publico; de outra empresa ou inexistente, 404. */
    Fornecedor buscarDaEmpresa(Long empresaId, UUID id) {
        return fornecedorRepository.findByUuidAndEmpresa_Id(id, empresaId)
                .orElseThrow(FornecedorNaoEncontradoException::new);
    }

    /** Como {@link #buscarDaEmpresa}, com a trava de escrita do fornecedor ate o fim da transacao. */
    Fornecedor buscarParaAtualizar(Long empresaId, UUID id) {
        return fornecedorRepository.buscarPorUuidParaAtualizar(id, empresaId)
                .orElseThrow(FornecedorNaoEncontradoException::new);
    }

    Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }

    // ---------- Listas do fornecedor ----------

    /**
     * Representantes do request ({@code null} = manter os atuais, so na
     * edicao). Um {@code id} que nao e deste fornecedor — de outro, de outra
     * empresa ou inexistente — e 404.
     */
    private static List<DadosRepresentante> representantesDoRequest(FornecedorRequest request,
            Fornecedor fornecedorAtual) {
        if (request.representantes() == null) {
            return fornecedorAtual == null ? List.of() : null;
        }
        List<DadosRepresentante> representantes = ValidacaoDoFornecedor.representantes(request.representantes());
        boolean idDesconhecido = representantes.stream()
                .map(DadosRepresentante::id)
                .filter(Objects::nonNull)
                .anyMatch(id -> fornecedorAtual == null || !fornecedorAtual.temRepresentante(id));
        if (idDesconhecido) {
            throw new FornecedorNaoEncontradoException(MENSAGEM_REPRESENTANTE_NAO_ENCONTRADO);
        }
        return representantes;
    }

    /**
     * Ids internos das marcas do request, sem repeticao e na ordem (spec 4.3):
     * ate {@value #MAXIMO_DE_MARCAS}; marca fora da arvore da empresa e 404; a
     * nao selecionavel so e aceita se ja estava em {@code atuais}.
     */
    private Set<Long> marcasDoRequest(Long empresaId, List<UUID> informadas, Set<Long> atuais) {
        if (informadas == null || informadas.isEmpty()) {
            return Set.of();
        }
        // O limite vale para as marcas distintas: as repetidas saem antes de contar.
        Set<UUID> semRepeticao = new LinkedHashSet<>(informadas);
        if (semRepeticao.size() > MAXIMO_DE_MARCAS) {
            throw new DadosFornecedorInvalidosException(MENSAGEM_MARCAS_DEMAIS, CAMPO_MARCAS);
        }
        Arvore<Marca> arvore = marcaService.arvoreDaEmpresa(empresaId);
        Set<Long> ids = new LinkedHashSet<>();
        for (UUID informada : semRepeticao) {
            Marca marca = arvore.buscarPeloUuid(informada)
                    .orElseThrow(() -> new FornecedorNaoEncontradoException(MENSAGEM_MARCA_NAO_ENCONTRADA));
            if (!arvore.selecionavel(marca.getId()) && !atuais.contains(marca.getId())) {
                throw new DadosFornecedorInvalidosException(MENSAGEM_MARCA_INATIVA, CAMPO_MARCAS);
            }
            ids.add(marca.getId());
        }
        return ids;
    }

    private void garantirDocumentoDisponivel(Long empresaId, DadosFornecedor dados, Long fornecedorAtualId) {
        if (dados.documento() == null) {
            return;
        }
        fornecedorRepository.razaoSocialComDocumento(empresaId, dados.documento(), fornecedorAtualId)
                .ifPresent(outro -> {
                    String documento = dados.tipoPessoa() == TipoPessoaFornecedor.PF ? "CPF" : "CNPJ";
                    throw new FornecedorConflitoException(MENSAGEM_DOCUMENTO_REPETIDO.formatted(outro, documento),
                            ValidacaoDoFornecedor.CAMPO_DOCUMENTO);
                });
    }

    // ---------- Respostas ----------

    private List<FornecedorItemResponse> itensDaPagina(Long empresaId, List<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, Fornecedor> porId = fornecedorRepository.buscarComRepresentantesPorIds(empresaId, ids).stream()
                .collect(Collectors.toMap(Fornecedor::getId, Function.identity()));
        Map<Long, Long> produtos = produtosDoFornecedor.contarPorFornecedor(empresaId, ids);
        return ids.stream()
                .map(porId::get)
                .filter(Objects::nonNull)
                .map(fornecedor -> FornecedorItemResponse.de(fornecedor,
                        produtos.getOrDefault(fornecedor.getId(), 0L)))
                .toList();
    }

    /** O {@code flush} dispara o {@code @PreUpdate}: o {@code atualizadoEm} da resposta e o gravado. */
    private FornecedorResponse responderAposGravar(Fornecedor fornecedor) {
        Fornecedor gravado = fornecedorRepository.save(fornecedor);
        fornecedorRepository.flush();
        return responder(gravado);
    }

    /** As marcas com o caminho, na ordem da arvore; a arvore so e carregada se houver marca. */
    private FornecedorResponse responder(Fornecedor fornecedor) {
        Set<Long> marcaIds = fornecedor.getMarcaIds();
        List<MarcaResumo> marcas = marcaIds.isEmpty() ? List.of() : resumosDasMarcas(fornecedor, marcaIds);
        long produtos = fornecedor.getId() == null ? 0
                : produtosDoFornecedor.contar(fornecedor.getEmpresaId(), fornecedor.getId());
        return FornecedorResponse.de(fornecedor, marcas, produtos);
    }

    private List<MarcaResumo> resumosDasMarcas(Fornecedor fornecedor, Set<Long> marcaIds) {
        Arvore<Marca> arvore = marcaService.arvoreDaEmpresa(fornecedor.getEmpresaId());
        return arvore.ordenadosPorCaminho().stream()
                .filter(marca -> marcaIds.contains(marca.getId()))
                .map(marca -> MarcaResumo.deOuNulo(marca, arvore))
                .toList();
    }
}
