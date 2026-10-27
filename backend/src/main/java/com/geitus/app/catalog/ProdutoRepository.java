package com.geitus.app.catalog;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.LockModeType;

/**
 * Acesso a dados da entidade {@link Produto} e dos seus codigos de barras.
 *
 * <p>Toda consulta isola por {@code empresaId}, para que um produto (ou o nome
 * de um produto) de outra empresa nunca seja encontrado (DEC-016). A API
 * identifica o produto pelo {@code uuid} publico; o {@code id} interno so e
 * usado entre service e repositorio.
 */
public interface ProdutoRepository extends JpaRepository<Produto, Long> {

    // Nota: Produto nao possui um atributo direto "empresaId" (apenas o
    // relacionamento "empresa" com Empresa e o getter derivado
    // Produto.getEmpresaId()). Por isso os metodos derivados usam a notacao
    // "Empresa_Id" para navegar explicitamente ate a propriedade "id" de
    // Empresa; sem o underscore, o Spring Data tenta resolver "empresaId"
    // como um unico atributo da entidade e falha na inicializacao do
    // contexto ("Could not resolve attribute 'empresaId' of ... Produto").

    // Nota: as consultas que montam a resposta trazem unidade, categoria e os
    // codigos de barras da unidade no mesmo SELECT (JOIN FETCH) para nao
    // disparar uma consulta por produto. Categoria e codigos sao opcionais
    // (LEFT JOIN): produto sem eles continua no resultado.

    /** Produto da empresa pelo UUID publico, com os vinculos e os codigos ja carregados. */
    @Query("""
            SELECT p FROM Produto p
              JOIN FETCH p.unidade
              LEFT JOIN FETCH p.categoria
              LEFT JOIN FETCH p.codigosBarras
            WHERE p.uuid = :uuid
              AND p.empresa.id = :empresaId
            """)
    Optional<Produto> findByUuidAndEmpresa_Id(@Param("uuid") UUID uuid, @Param("empresaId") Long empresaId);

    /**
     * Produto da empresa pelo UUID com trava de escrita na linha
     * ({@code SELECT ... FOR UPDATE}), para a edicao do cadastro.
     *
     * <p>A edicao le o custo e o preco de venda atuais e os grava como
     * {@code valor_anterior} no historico de precos (V8). Sem a trava, duas
     * edicoes concorrentes leriam o mesmo valor anterior e o historico deixaria
     * de formar a cadeia {@code valor_anterior -> valor_novo}; com ela, a
     * segunda espera a primeira confirmar e le o valor ja gravado.
     *
     * <p>Sem {@code JOIN FETCH} de proposito: o PostgreSQL nao aceita
     * {@code FOR UPDATE} no lado anulavel de um {@code LEFT JOIN}. Os vinculos
     * LAZY sao carregados depois, dentro da mesma transacao. Exige transacao.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT p FROM Produto p
            WHERE p.uuid = :uuid
              AND p.empresa.id = :empresaId
            """)
    Optional<Produto> buscarPorUuidParaAtualizar(@Param("uuid") UUID uuid, @Param("empresaId") Long empresaId);

    /**
     * PDV (DT-032): trava ({@code FOR UPDATE}) as linhas dos produtos da
     * empresa com estes ids, em ordem de id e num comando so, e devolve os ids
     * travados. A venda e o cancelamento travam assim, depois da sessao de
     * caixa: dois pedidos com os mesmos produtos nunca se travam em ciclo.
     * Exige transacao.
     */
    @Query(value = """
            SELECT p.id FROM produtos p
            WHERE p.empresa_id = :empresaId AND p.id = ANY(:ids)
            ORDER BY p.id
            FOR UPDATE
            """, nativeQuery = true)
    List<Long> travarEmOrdemDeId(@Param("empresaId") Long empresaId, @Param("ids") Long[] ids);

    /**
     * PDV: os produtos da empresa com estes UUIDs, com a unidade e as
     * embalagens (e a unidade de cada uma) no mesmo SELECT. UUID de outra
     * empresa nunca volta (DEC-016).
     */
    @Query("""
            SELECT DISTINCT p FROM Produto p
              JOIN FETCH p.unidade
              LEFT JOIN FETCH p.embalagens e
              LEFT JOIN FETCH e.unidade
            WHERE p.empresa.id = :empresaId
              AND p.uuid IN :uuids
            """)
    List<Produto> buscarParaVenda(@Param("empresaId") Long empresaId, @Param("uuids") Collection<UUID> uuids);

    /** PDV: como {@link #buscarParaVenda}, pelos ids internos. */
    @Query("""
            SELECT DISTINCT p FROM Produto p
              JOIN FETCH p.unidade
              LEFT JOIN FETCH p.embalagens e
              LEFT JOIN FETCH e.unidade
            WHERE p.empresa.id = :empresaId
              AND p.id IN :ids
            """)
    List<Produto> buscarParaVendaPorIds(@Param("empresaId") Long empresaId, @Param("ids") Collection<Long> ids);

    /** PDV: os ids internos dos produtos da empresa com estes UUIDs, sem carregar as entidades. */
    @Query("SELECT p.id FROM Produto p WHERE p.empresa.id = :empresaId AND p.uuid IN :uuids")
    List<Long> idsPorUuids(@Param("empresaId") Long empresaId, @Param("uuids") Collection<UUID> uuids);

    /**
     * PDV: o produto (e a embalagem, se for o caso) dono deste codigo de
     * barras na empresa. O codigo e unico na empresa
     * ({@code uq_codigo_barras_empresa}), entao ha no maximo um dono.
     */
    @Query("""
            SELECT new com.geitus.app.catalog.DonoDoCodigoDeBarras(p.id, e.id)
              FROM ProdutoCodigoBarras c
              JOIN c.produto p
              LEFT JOIN c.embalagem e
             WHERE c.empresa.id = :empresaId
               AND c.codigo = :codigo
            """)
    Optional<DonoDoCodigoDeBarras> donoDoCodigoDeBarras(@Param("empresaId") Long empresaId,
            @Param("codigo") String codigo);

    boolean existsBySkuAndEmpresa_Id(String sku, Long empresaId);

    boolean existsBySkuAndEmpresa_IdAndIdNot(String sku, Long empresaId, Long id);

    /**
     * Nome do produto da empresa que ja tem este codigo de barras, ignorando
     * {@code ignorarProdutoId} (o proprio produto na edicao; {@code null} no
     * cadastro). Restrito a empresa: o nome de produto de outra empresa nunca
     * e devolvido (Review Focus 3 da Fase B).
     */
    @Query("""
            SELECT c.produto.nome FROM ProdutoCodigoBarras c
            WHERE c.empresa.id = :empresaId
              AND c.codigo = :codigo
              AND (:ignorarProdutoId IS NULL OR c.produto.id <> :ignorarProdutoId)
            """)
    Optional<String> produtoComCodigo(@Param("empresaId") Long empresaId, @Param("codigo") String codigo,
            @Param("ignorarProdutoId") Long ignorarProdutoId);

    /**
     * Fase B3: os donos destes codigos de barras na empresa (produto e, se for
     * o caso, a embalagem), ignorando {@code ignorarProdutoId}. Monta a
     * mensagem do 409 com o rotulo da embalagem. Restrito a empresa (DEC-016).
     */
    @Query("""
            SELECT new com.geitus.app.catalog.CodigoDeBarrasEmUso(c.codigo, p.nome, eu.sigla, e.quantidade, pu.sigla)
              FROM ProdutoCodigoBarras c
              JOIN c.produto p
              JOIN p.unidade pu
              LEFT JOIN c.embalagem e
              LEFT JOIN e.unidade eu
             WHERE c.empresa.id = :empresaId
               AND c.codigo IN :codigos
               AND (:ignorarProdutoId IS NULL OR p.id <> :ignorarProdutoId)
            """)
    List<CodigoDeBarrasEmUso> codigosEmUso(@Param("empresaId") Long empresaId,
            @Param("codigos") Collection<String> codigos, @Param("ignorarProdutoId") Long ignorarProdutoId);

    /**
     * A mesma consulta de {@link #codigosEmUso}, numa transacao NOVA: usada so
     * depois de o banco recusar um codigo por {@code uq_codigo_barras_empresa}
     * (salvamento simultaneo com o mesmo codigo), quando a transacao do
     * salvamento ja foi abortada pelo PostgreSQL.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    @Query("""
            SELECT new com.geitus.app.catalog.CodigoDeBarrasEmUso(c.codigo, p.nome, eu.sigla, e.quantidade, pu.sigla)
              FROM ProdutoCodigoBarras c
              JOIN c.produto p
              JOIN p.unidade pu
              LEFT JOIN c.embalagem e
              LEFT JOIN e.unidade eu
             WHERE c.empresa.id = :empresaId
               AND c.codigo IN :codigos
               AND (:ignorarProdutoId IS NULL OR p.id <> :ignorarProdutoId)
            """)
    List<CodigoDeBarrasEmUso> codigosEmUsoEmNovaTransacao(@Param("empresaId") Long empresaId,
            @Param("codigos") Collection<String> codigos, @Param("ignorarProdutoId") Long ignorarProdutoId);

    /**
     * Fase B2: nome do produto da empresa que ja tem este codigo do produto,
     * ignorando {@code ignorarProdutoId} (o proprio produto na edicao;
     * {@code null} no cadastro). Restrito a empresa (DEC-016).
     */
    @Query("""
            SELECT p.nome FROM Produto p
            WHERE p.empresa.id = :empresaId
              AND p.codigo = :codigo
              AND (:ignorarProdutoId IS NULL OR p.id <> :ignorarProdutoId)
            """)
    Optional<String> nomeDoProdutoComCodigo(@Param("empresaId") Long empresaId, @Param("codigo") Integer codigo,
            @Param("ignorarProdutoId") Long ignorarProdutoId);

    /**
     * A mesma consulta de {@link #nomeDoProdutoComCodigo}, numa transacao
     * NOVA: usada so depois de o banco recusar o codigo por
     * {@code uq_produto_empresa_codigo} (cadastro simultaneo com o mesmo
     * codigo), quando a transacao do cadastro ja foi abortada pelo PostgreSQL
     * e nao aceita mais comandos. Le o produto que gravou o codigo primeiro.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    @Query("""
            SELECT p.nome FROM Produto p
            WHERE p.empresa.id = :empresaId
              AND p.codigo = :codigo
              AND (:ignorarProdutoId IS NULL OR p.id <> :ignorarProdutoId)
            """)
    Optional<String> nomeDoProdutoComCodigoEmNovaTransacao(@Param("empresaId") Long empresaId,
            @Param("codigo") Integer codigo, @Param("ignorarProdutoId") Long ignorarProdutoId);

    /**
     * Fase B2 (teste de etiqueta e, depois, o PDV): o produto da empresa com
     * este codigo do produto, com a unidade de venda carregada. Restrito a
     * empresa (DEC-016).
     */
    @Query("""
            SELECT p FROM Produto p
              JOIN FETCH p.unidade
            WHERE p.empresa.id = :empresaId
              AND p.codigo = :codigo
            """)
    Optional<Produto> findByEmpresa_IdAndCodigo(@Param("empresaId") Long empresaId, @Param("codigo") Integer codigo);

    /**
     * Fase B2: produtos "Vendidos na balanca" da empresa cujo codigo nao cabe
     * numa etiqueta com menos digitos ({@code codigo >= menorCodigoQueNaoCabe},
     * por exemplo 10000 para 4 digitos), em ordem de codigo. Alimenta o aviso
     * ao salvar a configuracao da etiqueta.
     */
    @Query("""
            SELECT p FROM Produto p
            WHERE p.empresa.id = :empresaId
              AND p.vendidoBalanca = true
              AND p.codigo >= :menorCodigoQueNaoCabe
            ORDER BY p.codigo
            """)
    List<Produto> vendidosNaBalancaComCodigoAPartirDe(@Param("empresaId") Long empresaId,
            @Param("menorCodigoQueNaoCabe") int menorCodigoQueNaoCabe);

    /**
     * SKUs da empresa no padrao da sugestao automatica ({@code P} + 6 ou mais
     * digitos, sensivel a maiusculas). O service calcula o maior numero em
     * Java ({@code BigInteger}), sem risco de estouro de tipo no banco. A
     * regex equivale a {@code ^P[0-9]{6,}$}, escrita sem chaves porque o
     * Hibernate interpreta {@code {...}} em SQL nativo.
     */
    @Query(value = """
            SELECT p.sku FROM produtos p
            WHERE p.empresa_id = :empresaId
              AND p.sku ~ '^P[0-9][0-9][0-9][0-9][0-9][0-9]+$'
            """, nativeQuery = true)
    List<String> skusNoPadrao(@Param("empresaId") Long empresaId);

    /**
     * Etapa 2 da listagem (docs/modules/produtos.md): os produtos
     * da empresa com estes ids internos (vindos da {@code ConsultaDeProdutos}),
     * com os vinculos e os codigos no mesmo SELECT. Sem ordem nem paginacao:
     * a pagina ja foi recortada na etapa 1 e o service reconstroi a ordem pelos
     * ids — por isso o {@code JOIN FETCH} da colecao nao cai na paginacao em
     * memoria ({@code fail_on_pagination_over_collection_fetch}). Ids de outra
     * empresa nunca voltam (DEC-016).
     */
    @Query("""
            SELECT p FROM Produto p
              JOIN FETCH p.unidade
              LEFT JOIN FETCH p.categoria
              LEFT JOIN FETCH p.codigosBarras
            WHERE p.empresa.id = :empresaId
              AND p.id IN :ids
            """)
    List<Produto> buscarComRelacoesPorIds(@Param("empresaId") Long empresaId, @Param("ids") Collection<Long> ids);

    /**
     * Fase B3: confere ja a unicidade adiada da V12
     * ({@code uq_embalagem_produto_unidade_quantidade}, conferida no commit),
     * para que uma violacao chegue como {@code DataIntegrityViolationException}
     * dentro do salvamento (409) e nunca no commit (500). Vale ate o fim da
     * transacao. Exige transacao.
     */
    @Modifying
    @Query(value = "SET CONSTRAINTS uq_embalagem_produto_unidade_quantidade IMMEDIATE", nativeQuery = true)
    void conferirUnicidadeDasEmbalagensAgora();

    // Nota (Fase B3): as embalagens e os codigos delas nao entram no SELECT de
    // buscarComRelacoesPorIds: duas colecoes (bags) no mesmo JOIN FETCH dariam
    // MultipleBagFetchException e um produto cartesiano. As duas consultas
    // abaixo inicializam essas colecoes nos produtos ja carregados na mesma
    // sessao, entao o numero de comandos da listagem continua constante.

    /** Fase B5: inicializa {@code fornecedores} dos produtos ja carregados com estes ids. */
    @Query("""
            SELECT DISTINCT p FROM Produto p
              LEFT JOIN FETCH p.fornecedores
            WHERE p.empresa.id = :empresaId
              AND p.id IN :ids
            """)
    List<Produto> carregarFornecedores(@Param("empresaId") Long empresaId, @Param("ids") Collection<Long> ids);

    /** Inicializa {@code embalagens} (com a unidade de cada uma) dos produtos ja carregados com estes ids. */
    @Query("""
            SELECT DISTINCT p FROM Produto p
              LEFT JOIN FETCH p.embalagens e
              LEFT JOIN FETCH e.unidade
            WHERE p.empresa.id = :empresaId
              AND p.id IN :ids
            """)
    List<Produto> carregarEmbalagens(@Param("empresaId") Long empresaId, @Param("ids") Collection<Long> ids);

    /** Inicializa os codigos de barras das embalagens dos produtos com estes ids. */
    @Query("""
            SELECT DISTINCT e FROM ProdutoEmbalagem e
              LEFT JOIN FETCH e.codigosBarras
            WHERE e.empresa.id = :empresaId
              AND e.produto.id IN :ids
            """)
    List<ProdutoEmbalagem> carregarCodigosDasEmbalagens(@Param("empresaId") Long empresaId,
            @Param("ids") Collection<Long> ids);
}
