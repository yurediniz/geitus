package com.geitus.app.catalog.categoria;

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
import com.geitus.app.catalog.categoria.dto.CategoriaRequest;
import com.geitus.app.catalog.categoria.dto.CategoriaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Regras de negocio das categorias em arvore
 * (docs/modules/produtos.md).
 *
 * <p>Mesmo desenho do {@code ClienteService}: os metodos {@code *ParaUsuario}
 * recebem o {@code idUsuario} do JWT e resolvem a empresa internamente
 * (DEC-016). Categoria — ou pai — de outra empresa e tratada como inexistente
 * (404). {@link #buscarDaEmpresa} e {@link #arvoreDaEmpresa} servem ao produto.
 *
 * <p>As escritas carregam a lista inteira da empresa uma vez e resolvem
 * categoria e pai dentro dela: o pai so e aceito se pertencer a essa lista, e
 * a mesma lista alimenta a {@link CategoriaArvore} (ciclo, nome entre irmaos,
 * caminho da resposta). O nome repetido entre irmaos e checado antes de
 * salvar (409 com mensagem clara); o indice {@code uq_categoria_irmaos} e a
 * rede de seguranca contra corrida (409 generico no handler).
 *
 * <p>Mover e excluir decidem com base no estado da arvore inteira, o que
 * nenhuma constraint do banco protege; por isso essas escritas sao
 * serializadas por empresa com {@link #travarArvoreDaEmpresa} (ver o Javadoc
 * dele).
 */
@Service
public class CategoriaService {

    static final String MENSAGEM_NAO_ENCONTRADA = "Categoria não encontrada.";
    static final String MENSAGEM_PAI_NAO_ENCONTRADO = "Categoria pai não encontrada.";
    static final String MENSAGEM_CICLO = "Uma categoria não pode ficar dentro dela mesma ou de uma subcategoria sua.";
    static final String MENSAGEM_NOME_REPETIDO = "Já existe uma categoria com este nome neste nível.";
    private static final String MENSAGEM_EXCLUSAO_BLOQUEADA =
            "Não é possível excluir: há %s nesta categoria. Mova-os ou inative a categoria.";

    private final CategoriaRepository categoriaRepository;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;

    public CategoriaService(CategoriaRepository categoriaRepository, EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository) {
        this.categoriaRepository = categoriaRepository;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    /** Lista plana ordenada pelo caminho, com contagens de subcategorias e produtos. */
    @Transactional(readOnly = true)
    public List<CategoriaResponse> listarParaUsuario(Long idUsuario, Boolean ativo) {
        Long empresaId = resolverEmpresaId(idUsuario);
        CategoriaArvore arvore = arvoreDaEmpresa(empresaId);
        Map<Long, Long> produtosPorCategoria =
                ContagensPorId.de(categoriaRepository.contarProdutosPorCategoria(empresaId));
        return arvore.ordenadasPorCaminho().stream()
                .filter(categoria -> ativo == null || categoria.isAtivo() == ativo)
                .map(categoria -> CategoriaResponse.de(categoria, arvore,
                        produtosPorCategoria.getOrDefault(categoria.getId(), 0L)))
                .toList();
    }

    @Transactional
    public CategoriaResponse cadastrarParaUsuario(Long idUsuario, CategoriaRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        List<Categoria> todas = new ArrayList<>(categoriaRepository.findByEmpresa_Id(empresaId));
        Categoria pai = paiNaLista(todas, request.parentId());
        String nome = request.nome().trim();
        garantirNomeDisponivel(CategoriaArvore.de(todas), pai, nome, null);

        Empresa empresa = empresaRepository.findById(empresaId).orElseThrow(CredenciaisInvalidasException::new);
        Categoria categoria = categoriaRepository.save(new Categoria(empresa, pai, nome));
        todas.add(categoria);
        return CategoriaResponse.de(categoria, CategoriaArvore.de(todas), 0L);
    }

    /** Renomeia e move (spec de Produtos): {@code parentId} nulo leva para a raiz. */
    @Transactional
    public CategoriaResponse atualizarParaUsuario(Long idUsuario, UUID id, CategoriaRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        travarArvoreDaEmpresa(empresaId);
        List<Categoria> todas = categoriaRepository.findByEmpresa_Id(empresaId);
        Categoria categoria = categoriaNaLista(todas, id);
        Categoria novoPai = paiNaLista(todas, request.parentId());
        CategoriaArvore arvoreAtual = CategoriaArvore.de(todas);
        if (arvoreAtual.criariaCiclo(categoria.getId(), idDe(novoPai))) {
            throw new RegraDeNegocioException(MENSAGEM_CICLO);
        }
        String nome = request.nome().trim();
        garantirNomeDisponivel(arvoreAtual, novoPai, nome, categoria.getId());

        categoria.renomear(nome);
        categoria.moverPara(novoPai);
        categoriaRepository.save(categoria);
        return responder(categoria, todas);
    }

    /** Inativa sem alterar filhos nem produtos (sem cascata, reversivel). */
    @Transactional
    public CategoriaResponse inativarParaUsuario(Long idUsuario, UUID id) {
        Long empresaId = resolverEmpresaId(idUsuario);
        List<Categoria> todas = categoriaRepository.findByEmpresa_Id(empresaId);
        Categoria categoria = categoriaNaLista(todas, id);
        categoria.inativar();
        categoriaRepository.save(categoria);
        return responder(categoria, todas);
    }

    @Transactional
    public CategoriaResponse reativarParaUsuario(Long idUsuario, UUID id) {
        Long empresaId = resolverEmpresaId(idUsuario);
        List<Categoria> todas = categoriaRepository.findByEmpresa_Id(empresaId);
        Categoria categoria = categoriaNaLista(todas, id);
        categoria.ativar();
        categoriaRepository.save(categoria);
        return responder(categoria, todas);
    }

    /**
     * Exclusao fisica (categoria e cadastro, nao historico), bloqueada se
     * houver subcategorias ou produtos vinculados — ativos ou nao (409).
     */
    @Transactional
    public void excluirParaUsuario(Long idUsuario, UUID id) {
        Long empresaId = resolverEmpresaId(idUsuario);
        travarArvoreDaEmpresa(empresaId);
        Categoria categoria = buscarDaEmpresa(empresaId, id);
        long subcategorias = categoriaRepository.countByPai_Id(categoria.getId());
        long produtos = categoriaRepository.contarProdutos(categoria.getId());
        if (subcategorias > 0 || produtos > 0) {
            throw new CatalogoConflitoException(mensagemExclusaoBloqueada(subcategorias, produtos));
        }
        categoriaRepository.delete(categoria);
    }

    // ---------- Uso por outros modulos ----------

    /** Categoria da empresa pelo UUID publico; de outra empresa ou inexistente → 404. */
    @Transactional(readOnly = true)
    public Categoria buscarDaEmpresa(Long empresaId, UUID id) {
        return categoriaRepository.findByUuidAndEmpresa_Id(id, empresaId)
                .orElseThrow(() -> new CatalogoNaoEncontradoException(MENSAGEM_NAO_ENCONTRADA));
    }

    /** Arvore com todas as categorias da empresa. */
    @Transactional(readOnly = true)
    public CategoriaArvore arvoreDaEmpresa(Long empresaId) {
        return CategoriaArvore.de(categoriaRepository.findByEmpresa_Id(empresaId));
    }

    // ---------- Apoio ----------

    /**
     * Serializa, por empresa, as escritas que dependem do retrato da arvore,
     * bloqueando a linha da empresa ({@code PESSIMISTIC_WRITE}) ate o fim da
     * transacao. Deve ser chamada ANTES de carregar as categorias.
     *
     * <p>Corrida evitada: com A e B na raiz, "mover A para dentro de B" e
     * "mover B para dentro de A" em paralelo leem a mesma arvore (ambas sem
     * ciclo), as duas passam na checagem e as duas gravam — A fica sob B e B
     * sob A, um ciclo que nenhuma constraint detecta e que quebra a montagem
     * da arvore ({@code IllegalStateException}). Com a trava, a segunda espera
     * a primeira confirmar e, em READ COMMITTED, carrega a arvore ja alterada:
     * a checagem de ciclo a rejeita. Na exclusao, evita que uma subcategoria
     * seja movida para dentro da categoria entre a contagem e o delete (filho
     * ou produto cadastrado em paralelo continua barrado pelas FKs da V6).
     * Escopo por empresa: tenants diferentes nao se bloqueiam.
     */
    private void travarArvoreDaEmpresa(Long empresaId) {
        empresaRepository.travarPorId(empresaId).orElseThrow(CredenciaisInvalidasException::new);
    }

    private CategoriaResponse responder(Categoria categoria, List<Categoria> todas) {
        // Arvore remontada: reflete o novo pai/nome/status da categoria alterada.
        return CategoriaResponse.de(categoria, CategoriaArvore.de(todas),
                categoriaRepository.contarProdutos(categoria.getId()));
    }

    private static void garantirNomeDisponivel(CategoriaArvore arvore, Categoria pai, String nome,
            Long ignorarId) {
        if (arvore.nomeEmUsoEntreIrmaos(idDe(pai), nome, ignorarId)) {
            throw new CatalogoConflitoException(MENSAGEM_NOME_REPETIDO);
        }
    }

    private static Categoria categoriaNaLista(List<Categoria> todas, UUID id) {
        return procurarNaLista(todas, id, MENSAGEM_NAO_ENCONTRADA);
    }

    /** Pai pelo UUID dentro da propria empresa; {@code null} = raiz. */
    private static Categoria paiNaLista(List<Categoria> todas, UUID parentId) {
        return parentId == null ? null : procurarNaLista(todas, parentId, MENSAGEM_PAI_NAO_ENCONTRADO);
    }

    private static Categoria procurarNaLista(List<Categoria> todas, UUID id, String mensagemSeAusente) {
        return todas.stream()
                .filter(categoria -> categoria.getUuid().equals(id))
                .findFirst()
                .orElseThrow(() -> new CatalogoNaoEncontradoException(mensagemSeAusente));
    }

    private static Long idDe(Categoria categoria) {
        return categoria == null ? null : categoria.getId();
    }

    /** Monta a mensagem fixa omitindo a parte zerada (spec / Global Constraints). */
    private static String mensagemExclusaoBloqueada(long subcategorias, long produtos) {
        List<String> motivos = new ArrayList<>();
        if (subcategorias > 0) {
            motivos.add(subcategorias + " subcategoria(s)");
        }
        if (produtos > 0) {
            motivos.add(produtos + " produto(s)");
        }
        return String.format(MENSAGEM_EXCLUSAO_BLOQUEADA, String.join(" e ", motivos));
    }

    private Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }
}
