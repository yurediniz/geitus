package com.geitus.app.catalog;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.dto.ProdutoDoFornecedorResponse;
import com.geitus.app.shared.paginacao.PaginaResponse;
import com.geitus.app.shared.paginacao.Paginacao;

/**
 * Regras da lista de fornecedores do produto (docs/modules/fornecedores-e-marcas.md),
 * a mesma lista vista pelo produto e pelo fornecedor. Implementa
 * a visao do fornecedor ({@link ProdutosDoFornecedor}) e e usada pelo
 * {@code ProdutoService} (lista no cadastro) e pelo estoque (entrada por
 * compra).
 *
 * <p><b>Ordem das escritas (Review Focus 1):</b> a FK imediata da V14 obriga
 * o fornecedor da ultima compra a estar na lista. Por isso o campo do produto
 * e limpo e gravado ({@code flush}) ANTES de apagar a ligacao dele; e uma
 * ligacao nova e o novo "da ultima compra" vao no mesmo {@code flush}, em que o
 * Hibernate insere antes de atualizar. Nunca um 500 pela FK.
 *
 * <p>Toda escrita parte do produto travado ({@code buscarPorUuidParaAtualizar},
 * a mesma trava da edicao e do ajuste de estoque): edicoes da lista pelo
 * produto e pelo fornecedor ficam em fila. Os fornecedores chegam pela
 * {@link NomesDeFornecedores}, sempre dentro da empresa (DEC-016).
 */
@Component
public class FornecedoresDoProduto implements ProdutosDoFornecedor {

    static final int MAXIMO_DE_FORNECEDORES = 20;

    static final String MENSAGEM_FORNECEDORES_DEMAIS = "Informe no máximo 20 fornecedores.";
    static final String MENSAGEM_FORNECEDOR_NAO_ENCONTRADO = "Fornecedor não encontrado.";
    static final String MENSAGEM_FORNECEDOR_INATIVO = "Este fornecedor está inativo.";
    static final String MENSAGEM_ULTIMO_FORA_DA_LISTA =
            "O fornecedor da última compra precisa estar na lista de fornecedores.";
    static final String MENSAGEM_PRODUTO_COM_FORNECEDORES_DEMAIS =
            "Este produto já tem 20 fornecedores. Tire um da lista do produto para ligar outro.";
    static final String MENSAGEM_LISTA_AUSENTE = "Informe a lista de fornecedores.";
    static final String CAMPO_FORNECEDORES = "fornecedorIds";
    static final String CAMPO_PRODUTO = "produtoId";
    static final String CAMPO_FORNECEDOR_DA_COMPRA = "fornecedorId";
    static final String CAMPO_ULTIMA_COMPRA = "fornecedorUltimaCompraId";

    private final ProdutoFornecedorRepository ligacaoRepository;
    private final ProdutoRepository produtoRepository;
    private final NomesDeFornecedores nomesDeFornecedores;

    public FornecedoresDoProduto(ProdutoFornecedorRepository ligacaoRepository, ProdutoRepository produtoRepository,
            NomesDeFornecedores nomesDeFornecedores) {
        this.ligacaoRepository = ligacaoRepository;
        this.produtoRepository = produtoRepository;
        this.nomesDeFornecedores = nomesDeFornecedores;
    }

    // ---------- Pelo produto (spec de Fornecedores e marcas) ----------

    /**
     * Valida a lista do request antes de gravar o produto, nesta ordem: ate
     * {@value #MAXIMO_DE_FORNECEDORES} (400), cada um da empresa (404), o
     * inativo so se ja estiver ligado (400) e o da ultima compra na lista
     * (400). {@code informados} {@code null}: no PATCH mantem a lista e o da
     * ultima compra; no cadastro, nenhum; com o da ultima compra informado, 400.
     */
    PlanoDeFornecedores planejar(Long empresaId, Produto produtoAtual, List<UUID> informados, UUID ultimaCompra) {
        if (informados == null) {
            // O da ultima compra so vale junto com a lista (no PATCH, nao e ignorado em silencio).
            if (ultimaCompra != null) {
                throw new RegraDeNegocioException(MENSAGEM_LISTA_AUSENTE, CAMPO_FORNECEDORES);
            }
            return produtoAtual == null ? PlanoDeFornecedores.NENHUM : PlanoDeFornecedores.MANTER;
        }
        if (informados.size() > MAXIMO_DE_FORNECEDORES) {
            throw new RegraDeNegocioException(MENSAGEM_FORNECEDORES_DEMAIS, CAMPO_FORNECEDORES);
        }
        Set<UUID> semRepeticao = new LinkedHashSet<>(informados);
        Map<UUID, FornecedorResumido> encontrados = semRepeticao.isEmpty() ? Map.of()
                : nomesDeFornecedores.porUuids(empresaId, semRepeticao);
        Set<Long> jaLigados = produtoAtual == null ? Set.of() : produtoAtual.idsDosFornecedores();
        List<Long> ids = new ArrayList<>();
        for (UUID uuid : semRepeticao) {
            FornecedorResumido fornecedor = encontrados.get(uuid);
            if (fornecedor == null) {
                throw new CatalogoNaoEncontradoException(MENSAGEM_FORNECEDOR_NAO_ENCONTRADO);
            }
            if (!fornecedor.ativo() && !jaLigados.contains(fornecedor.id())) {
                throw new RegraDeNegocioException(MENSAGEM_FORNECEDOR_INATIVO, CAMPO_FORNECEDORES);
            }
            ids.add(fornecedor.id());
        }
        return new PlanoDeFornecedores(false, ids, ultimaCompraNaLista(ultimaCompra, encontrados, semRepeticao));
    }

    /**
     * Aplica o plano no produto ja gravado (o cadastro grava o produto antes:
     * a ligacao precisa do id dele, e o da ultima compra precisa da ligacao).
     * O da ultima compra que sai da lista e limpo e gravado antes (Review
     * Focus 1).
     */
    void aplicar(Produto produto, PlanoDeFornecedores plano) {
        if (plano.manter()) {
            return;
        }
        limparUltimaCompraSeSair(produto, plano.fornecedorIds());
        produto.substituirFornecedores(plano.fornecedorIds());
        produto.definirFornecedorDaUltimaCompra(plano.ultimaCompraId());
    }

    // ---------- Pela entrada por compra (spec de Fornecedores e marcas) ----------

    /**
     * Na transacao do ajuste, com o produto travado: o fornecedor (ja
     * conferido na empresa e ativo) entra na lista se faltar e passa a ser o
     * da ultima compra.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void registrarCompra(Produto produto, Long fornecedorId) {
        exigirVagaNaLista(produto, fornecedorId, CAMPO_FORNECEDOR_DA_COMPRA);
        produto.ligarFornecedor(fornecedorId);
        produto.definirFornecedorDaUltimaCompra(fornecedorId);
    }

    // ---------- Pelo fornecedor (spec de Fornecedores e marcas) ----------

    @Override
    @Transactional(readOnly = true)
    public long contar(Long empresaId, Long fornecedorId) {
        return ligacaoRepository.contar(empresaId, fornecedorId);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Long> contarPorFornecedor(Long empresaId, Collection<Long> fornecedorIds) {
        if (fornecedorIds.isEmpty()) {
            return Map.of();
        }
        return ContagensPorId.de(ligacaoRepository.contarPorFornecedor(empresaId, fornecedorIds));
    }

    @Override
    @Transactional(readOnly = true)
    public PaginaResponse<ProdutoDoFornecedorResponse> pagina(Long empresaId, Long fornecedorId, int pagina,
            int tamanho) {
        Paginacao.validar(pagina, tamanho);
        return PaginaResponse.de(ligacaoRepository.produtosDoFornecedor(empresaId, fornecedorId,
                PageRequest.of(pagina, tamanho)));
    }

    /** Idempotente: {@code true} se ligou agora, {@code false} se o produto ja era do fornecedor. */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public LigacaoDoProduto ligar(Long empresaId, Long fornecedorId, UUID produtoId) {
        Produto produto = produtoTravado(empresaId, produtoId);
        exigirVagaNaLista(produto, fornecedorId, CAMPO_PRODUTO);
        boolean criada = produto.ligarFornecedor(fornecedorId);
        produtoRepository.flush();
        return new LigacaoDoProduto(item(produto, fornecedorId), criada);
    }

    /**
     * Tira o produto do fornecedor; se ele era o da ultima compra, o campo do
     * produto e limpo antes (Review Focus 1). Produto fora da lista do
     * fornecedor, de outra empresa ou inexistente: 404.
     */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void desligar(Long empresaId, Long fornecedorId, UUID produtoId) {
        Produto produto = produtoTravado(empresaId, produtoId);
        if (!produto.idsDosFornecedores().contains(fornecedorId)) {
            throw new ProdutoNaoEncontradoException();
        }
        limparUltimaCompraSeSair(produto, produto.idsDosFornecedores().stream()
                .filter(id -> !id.equals(fornecedorId))
                .toList());
        produto.desligarFornecedor(fornecedorId);
        produtoRepository.flush();
    }

    // ---------- Apoio ----------

    /**
     * Decisao do CTO: a ligacao nova (pela tela do fornecedor ou pela compra)
     * nao passa do limite de {@value #MAXIMO_DE_FORNECEDORES} do produto; o
     * fornecedor que ja esta na lista continua aceito.
     */
    private static void exigirVagaNaLista(Produto produto, Long fornecedorId, String campo) {
        Set<Long> atuais = produto.idsDosFornecedores();
        if (!atuais.contains(fornecedorId) && atuais.size() >= MAXIMO_DE_FORNECEDORES) {
            throw new RegraDeNegocioException(MENSAGEM_PRODUTO_COM_FORNECEDORES_DEMAIS, campo);
        }
    }

    private static Long ultimaCompraNaLista(UUID ultimaCompra, Map<UUID, FornecedorResumido> encontrados,
            Set<UUID> lista) {
        if (ultimaCompra == null) {
            return null;
        }
        if (!lista.contains(ultimaCompra)) {
            throw new RegraDeNegocioException(MENSAGEM_ULTIMO_FORA_DA_LISTA, CAMPO_ULTIMA_COMPRA);
        }
        return encontrados.get(ultimaCompra).id();
    }

    /** Limpa e grava o fornecedor da ultima compra que nao esta em {@code ficam}, antes de apagar a ligacao. */
    private void limparUltimaCompraSeSair(Produto produto, Collection<Long> ficam) {
        Long ultimaCompra = produto.getFornecedorUltimaCompraId();
        if (ultimaCompra != null && !ficam.contains(ultimaCompra)) {
            produto.definirFornecedorDaUltimaCompra(null);
            produtoRepository.flush();
        }
    }

    private Produto produtoTravado(Long empresaId, UUID produtoId) {
        return produtoRepository.buscarPorUuidParaAtualizar(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
    }

    private static ProdutoDoFornecedorResponse item(Produto produto, Long fornecedorId) {
        return new ProdutoDoFornecedorResponse(produto.getUuid(), produto.getNumero(), produto.getNome(),
                produto.getCodigo(), produto.getSku(), produto.isAtivo(),
                Objects.equals(produto.getFornecedorUltimaCompraId(), fornecedorId));
    }
}
