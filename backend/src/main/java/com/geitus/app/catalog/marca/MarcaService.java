package com.geitus.app.catalog.marca;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.CatalogoConflitoException;
import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.ContagensPorId;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.arvore.Arvore;
import com.geitus.app.catalog.marca.dto.MarcaRequest;
import com.geitus.app.catalog.marca.dto.MarcaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Regras de negocio dos fabricantes e marcas em arvore
 * (docs/modules/fornecedores-e-marcas.md, 3.1): as mesmas das categorias
 * (categorias-e-unidades.md, 4.2), com os textos de marca.
 *
 * <p>Mesmo desenho do {@code CategoriaService}: os metodos {@code *ParaUsuario}
 * recebem o {@code idUsuario} do JWT e resolvem a empresa internamente
 * (DEC-016). Marca — ou pai — de outra empresa e tratada como inexistente
 * (404). {@link #buscarDaEmpresa} e {@link #arvoreDaEmpresa} servem ao produto
 * e ao fornecedor.
 *
 * <p>As escritas carregam a lista inteira da empresa uma vez e resolvem marca
 * e pai dentro dela; a mesma lista alimenta a {@link Arvore}. Mover e excluir
 * sao serializados por empresa com a trava da linha da empresa (o mesmo
 * motivo do {@code CategoriaService}: dois "mover" cruzados nao podem criar um
 * ciclo). O renomear tambem passa pela trava, porque atualiza a busca dos
 * produtos da marca.
 *
 * <p>Diferencas das categorias: a exclusao tambem e barrada por fornecedores
 * que vendem a marca, e renomear recalcula, na mesma transacao e em lote, a
 * busca dos produtos da marca ({@link BuscaDosProdutosDaMarca}).
 */
@Service
public class MarcaService {

    static final String MENSAGEM_NAO_ENCONTRADA = "Marca não encontrada.";
    static final String MENSAGEM_PAI_NAO_ENCONTRADO = "Marca pai não encontrada.";
    static final String MENSAGEM_CICLO = "Uma marca não pode ficar dentro dela mesma ou de uma submarca sua.";
    static final String MENSAGEM_NOME_REPETIDO = "Já existe uma marca com este nome neste nível.";
    private static final String MENSAGEM_EXCLUSAO_BLOQUEADA =
            "Não é possível excluir: há %s nesta marca. Mova-os ou inative a marca.";

    private final MarcaRepository marcaRepository;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final BuscaDosProdutosDaMarca buscaDosProdutos;

    public MarcaService(MarcaRepository marcaRepository, EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository, BuscaDosProdutosDaMarca buscaDosProdutos) {
        this.marcaRepository = marcaRepository;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.buscaDosProdutos = buscaDosProdutos;
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    /** Lista plana ordenada pelo caminho, com contagens de submarcas, produtos e fornecedores. */
    @Transactional(readOnly = true)
    public List<MarcaResponse> listarParaUsuario(Long idUsuario, Boolean ativo) {
        Long empresaId = resolverEmpresaId(idUsuario);
        Arvore<Marca> arvore = arvoreDaEmpresa(empresaId);
        Map<Long, Long> produtosPorMarca = ContagensPorId.de(marcaRepository.contarProdutosPorMarca(empresaId));
        Map<Long, Long> fornecedoresPorMarca =
                ContagensPorId.de(marcaRepository.contarFornecedoresPorMarca(empresaId));
        return arvore.ordenadosPorCaminho().stream()
                .filter(marca -> ativo == null || marca.isAtivo() == ativo)
                .map(marca -> MarcaResponse.de(marca, arvore, produtosPorMarca.getOrDefault(marca.getId(), 0L),
                        fornecedoresPorMarca.getOrDefault(marca.getId(), 0L)))
                .toList();
    }

    @Transactional
    public MarcaResponse cadastrarParaUsuario(Long idUsuario, MarcaRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        List<Marca> todas = new ArrayList<>(marcaRepository.findByEmpresa_Id(empresaId));
        Marca pai = paiNaLista(todas, request.parentId());
        String nome = request.nome().trim();
        garantirNomeDisponivel(Arvore.de(todas), pai, nome, null);

        Empresa empresa = empresaRepository.findById(empresaId).orElseThrow(CredenciaisInvalidasException::new);
        Marca marca = marcaRepository.save(new Marca(empresa, pai, nome));
        todas.add(marca);
        return MarcaResponse.de(marca, Arvore.de(todas), 0L, 0L);
    }

    /**
     * Renomeia e move: {@code parentId} nulo leva para a raiz. Com o nome
     * mudado, a busca dos produtos da marca e recalculada aqui mesmo (Review
     * Focus 3): os produtos passam a ser achados pelo nome novo.
     */
    @Transactional
    public MarcaResponse atualizarParaUsuario(Long idUsuario, UUID id, MarcaRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        travarArvoreDaEmpresa(empresaId);
        List<Marca> todas = marcaRepository.findByEmpresa_Id(empresaId);
        Marca marca = marcaNaLista(todas, id);
        Marca novoPai = paiNaLista(todas, request.parentId());
        Arvore<Marca> arvoreAtual = Arvore.de(todas);
        if (arvoreAtual.criariaCiclo(marca.getId(), idDe(novoPai))) {
            throw new RegraDeNegocioException(MENSAGEM_CICLO);
        }
        String nome = request.nome().trim();
        garantirNomeDisponivel(arvoreAtual, novoPai, nome, marca.getId());

        boolean renomeada = !nome.equals(marca.getNome());
        marca.renomear(nome);
        marca.moverPara(novoPai);
        marcaRepository.save(marca);
        if (renomeada) {
            buscaDosProdutos.recalcular(empresaId, marca.getId(), nome);
        }
        return responder(marca, todas);
    }

    /** Inativa sem alterar filhos, produtos nem fornecedores (sem cascata, reversivel). */
    @Transactional
    public MarcaResponse inativarParaUsuario(Long idUsuario, UUID id) {
        Long empresaId = resolverEmpresaId(idUsuario);
        List<Marca> todas = marcaRepository.findByEmpresa_Id(empresaId);
        Marca marca = marcaNaLista(todas, id);
        marca.inativar();
        marcaRepository.save(marca);
        return responder(marca, todas);
    }

    @Transactional
    public MarcaResponse reativarParaUsuario(Long idUsuario, UUID id) {
        Long empresaId = resolverEmpresaId(idUsuario);
        List<Marca> todas = marcaRepository.findByEmpresa_Id(empresaId);
        Marca marca = marcaNaLista(todas, id);
        marca.ativar();
        marcaRepository.save(marca);
        return responder(marca, todas);
    }

    /**
     * Exclusao fisica (marca e cadastro, nao historico), bloqueada se houver
     * submarcas, produtos ou fornecedores ligados — ativos ou nao (409, spec 3.1).
     */
    @Transactional
    public void excluirParaUsuario(Long idUsuario, UUID id) {
        Long empresaId = resolverEmpresaId(idUsuario);
        travarArvoreDaEmpresa(empresaId);
        Marca marca = buscarDaEmpresa(empresaId, id);
        long submarcas = marcaRepository.countByPai_Id(marca.getId());
        long produtos = marcaRepository.contarProdutos(marca.getId());
        long fornecedores = marcaRepository.contarFornecedores(marca.getId());
        if (submarcas > 0 || produtos > 0 || fornecedores > 0) {
            throw new CatalogoConflitoException(mensagemExclusaoBloqueada(submarcas, produtos, fornecedores));
        }
        marcaRepository.delete(marca);
    }

    // ---------- Uso por outros modulos ----------

    /** Marca da empresa pelo UUID publico; de outra empresa ou inexistente → 404. */
    @Transactional(readOnly = true)
    public Marca buscarDaEmpresa(Long empresaId, UUID id) {
        return marcaRepository.findByUuidAndEmpresa_Id(id, empresaId)
                .orElseThrow(() -> new CatalogoNaoEncontradoException(MENSAGEM_NAO_ENCONTRADA));
    }

    /** Arvore com todas as marcas da empresa. */
    @Transactional(readOnly = true)
    public Arvore<Marca> arvoreDaEmpresa(Long empresaId) {
        return Arvore.de(marcaRepository.findByEmpresa_Id(empresaId));
    }

    // ---------- Apoio ----------

    /**
     * Serializa, por empresa, as escritas que dependem do retrato da arvore
     * (ver {@code CategoriaService}): bloqueia a linha da empresa ate o fim da
     * transacao. Deve ser chamada ANTES de carregar as marcas.
     */
    private void travarArvoreDaEmpresa(Long empresaId) {
        empresaRepository.travarPorId(empresaId).orElseThrow(CredenciaisInvalidasException::new);
    }

    private MarcaResponse responder(Marca marca, List<Marca> todas) {
        // Arvore remontada: reflete o novo pai/nome/status da marca alterada.
        return MarcaResponse.de(marca, Arvore.de(todas), marcaRepository.contarProdutos(marca.getId()),
                marcaRepository.contarFornecedores(marca.getId()));
    }

    private static void garantirNomeDisponivel(Arvore<Marca> arvore, Marca pai, String nome, Long ignorarId) {
        if (arvore.nomeEmUsoEntreIrmaos(idDe(pai), nome, ignorarId)) {
            throw new CatalogoConflitoException(MENSAGEM_NOME_REPETIDO);
        }
    }

    private static Marca marcaNaLista(List<Marca> todas, UUID id) {
        return procurarNaLista(todas, id, MENSAGEM_NAO_ENCONTRADA);
    }

    /** Pai pelo UUID dentro da propria empresa; {@code null} = raiz. */
    private static Marca paiNaLista(List<Marca> todas, UUID parentId) {
        return parentId == null ? null : procurarNaLista(todas, parentId, MENSAGEM_PAI_NAO_ENCONTRADO);
    }

    private static Marca procurarNaLista(List<Marca> todas, UUID id, String mensagemSeAusente) {
        return todas.stream()
                .filter(marca -> marca.getUuid().equals(id))
                .findFirst()
                .orElseThrow(() -> new CatalogoNaoEncontradoException(mensagemSeAusente));
    }

    private static Long idDe(Marca marca) {
        return marca == null ? null : marca.getId();
    }

    /**
     * Mensagem fixa da spec 3.1 omitindo as partes zeradas: "a", "a e b" ou
     * "a, b e c".
     */
    private static String mensagemExclusaoBloqueada(long submarcas, long produtos, long fornecedores) {
        List<String> motivos = new ArrayList<>();
        if (submarcas > 0) {
            motivos.add(submarcas + " submarca(s)");
        }
        if (produtos > 0) {
            motivos.add(produtos + " produto(s)");
        }
        if (fornecedores > 0) {
            motivos.add(fornecedores + " fornecedor(es)");
        }
        return String.format(MENSAGEM_EXCLUSAO_BLOQUEADA, juntarComE(motivos));
    }

    private static String juntarComE(List<String> partes) {
        if (partes.size() == 1) {
            return partes.get(0);
        }
        return String.join(", ", partes.subList(0, partes.size() - 1)) + " e " + partes.get(partes.size() - 1);
    }

    private Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }
}
