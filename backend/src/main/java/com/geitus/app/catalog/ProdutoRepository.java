package com.geitus.app.catalog;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    // Nota: as consultas que montam a resposta trazem unidade, unidade de
    // compra, categoria e os codigos de barras no mesmo SELECT (JOIN FETCH)
    // para nao disparar uma consulta por produto. Categoria, compra e codigos
    // sao opcionais (LEFT JOIN): produto sem eles continua no resultado.

    /** Produto da empresa pelo UUID publico, com os vinculos e os codigos ja carregados. */
    @Query("""
            SELECT p FROM Produto p
              JOIN FETCH p.unidade
              LEFT JOIN FETCH p.unidadeCompra
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

    // Nota: as sugestoes de marca e de fornecedor sao DUAS queries fixas, uma
    // por coluna. O nome da coluna nunca e montado a partir da entrada do
    // cliente (nem concatenado no SQL): o service escolhe o metodo a partir de
    // uma allow-list. Agrupam sem diferenciar maiusculas (lower), devolvem a
    // grafia mais usada de cada valor (mode(), empate pela ordem alfabetica) e
    // ordenam por frequencia desc e depois alfabeticamente. O padrao chega
    // pronto do service (minusculas, escapado, com '%' nas pontas; sem termo e
    // '%%'), nunca null.

    /** Marcas ja usadas na empresa que contem o termo, das mais usadas para as menos. */
    @Query(value = """
            SELECT mode() WITHIN GROUP (ORDER BY p.marca) AS valor
            FROM produtos p
            WHERE p.empresa_id = :empresaId
              AND p.marca IS NOT NULL
              AND lower(p.marca) LIKE :padrao ESCAPE '\\'
            GROUP BY lower(p.marca)
            ORDER BY count(*) DESC, lower(p.marca)
            LIMIT :limite
            """, nativeQuery = true)
    List<String> sugestoesDeMarca(@Param("empresaId") Long empresaId, @Param("padrao") String padrao,
            @Param("limite") int limite);

    /** Fornecedores ja usados na empresa que contem o termo, dos mais usados para os menos. */
    @Query(value = """
            SELECT mode() WITHIN GROUP (ORDER BY p.fornecedor) AS valor
            FROM produtos p
            WHERE p.empresa_id = :empresaId
              AND p.fornecedor IS NOT NULL
              AND lower(p.fornecedor) LIKE :padrao ESCAPE '\\'
            GROUP BY lower(p.fornecedor)
            ORDER BY count(*) DESC, lower(p.fornecedor)
            LIMIT :limite
            """, nativeQuery = true)
    List<String> sugestoesDeFornecedor(@Param("empresaId") Long empresaId, @Param("padrao") String padrao,
            @Param("limite") int limite);

    // Nota: a listagem com filtros usa duas queries em vez de uma unica com
    // ":busca IS NULL OR ...": quando :busca era null, o PostgreSQL inferia o
    // parametro dentro de LOWER(CONCAT(...)) como bytea e a query falhava em
    // runtime com "function lower(bytea) does not exist". Separar os casos
    // garante que os padroes nunca sejam null na query que os utiliza.

    /**
     * Lista produtos da empresa, com filtro opcional de status ativo/inativo
     * ({@code ativo} e ignorado quando {@code null}).
     */
    @Query("""
            SELECT p FROM Produto p
              JOIN FETCH p.unidade
              LEFT JOIN FETCH p.unidadeCompra
              LEFT JOIN FETCH p.categoria
              LEFT JOIN FETCH p.codigosBarras
            WHERE p.empresa.id = :empresaId
              AND (:ativo IS NULL OR p.ativo = :ativo)
            ORDER BY p.nome
            """)
    List<Produto> buscarPorEmpresa(@Param("empresaId") Long empresaId, @Param("ativo") Boolean ativo);

    /**
     * Lista produtos da empresa cujo nome, nome curto ou SKU casa com
     * {@code padraoTexto}, ou que tem algum codigo de barras que casa com
     * {@code padraoCodigo} (o termo sem espacos), com filtro opcional de status.
     * Os padroes chegam prontos do service (minusculas, {@code %}, {@code _} e
     * {@code \} escapados — DT-017 — e {@code %} nas pontas) e NUNCA sao
     * {@code null}; sem termo o service usa {@link #buscarPorEmpresa}. A busca
     * por codigo usa {@code EXISTS} para que todos os codigos do produto
     * continuem no resultado, nao so o que casou.
     */
    @Query("""
            SELECT p FROM Produto p
              JOIN FETCH p.unidade
              LEFT JOIN FETCH p.unidadeCompra
              LEFT JOIN FETCH p.categoria
              LEFT JOIN FETCH p.codigosBarras
            WHERE p.empresa.id = :empresaId
              AND (LOWER(p.nome) LIKE :padraoTexto ESCAPE '\\'
                   OR LOWER(p.nomeCurto) LIKE :padraoTexto ESCAPE '\\'
                   OR LOWER(p.sku) LIKE :padraoTexto ESCAPE '\\'
                   OR EXISTS (SELECT 1 FROM ProdutoCodigoBarras c
                              WHERE c.produto = p
                                AND LOWER(c.codigo) LIKE :padraoCodigo ESCAPE '\\'))
              AND (:ativo IS NULL OR p.ativo = :ativo)
            ORDER BY p.nome
            """)
    List<Produto> buscarPorEmpresaComBusca(@Param("empresaId") Long empresaId,
            @Param("padraoTexto") String padraoTexto, @Param("padraoCodigo") String padraoCodigo,
            @Param("ativo") Boolean ativo);
}
