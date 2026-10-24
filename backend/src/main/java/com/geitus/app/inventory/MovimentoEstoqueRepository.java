package com.geitus.app.inventory;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.geitus.app.catalog.EntradaDeCompra;
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse;

/**
 * Acesso aos movimentos de estoque (tabela so de insercao, V9). Toda consulta
 * filtra pela empresa (DEC-016).
 */
public interface MovimentoEstoqueRepository extends JpaRepository<MovimentoEstoque, Long> {

    /** Movimento ja gravado com a chave de idempotencia na empresa, se houver. */
    Optional<MovimentoEstoque> findByEmpresaIdAndChaveIdempotencia(Long empresaId, UUID chaveIdempotencia);

    /**
     * Movimentos do produto, do mais recente para o mais antigo (desempate pelo
     * id), ja com o nome do usuario e (Fase B5) o fornecedor da compra, pela
     * juncao com a entidade do pacote {@code supplier} (so leitura; a FK
     * composta da V14 garante a mesma empresa). Filtra pela empresa alem do produto
     * (DEC-016) e atende o indice {@code ix_movimento_estoque_produto}. O
     * {@code pageable} nao deve trazer ordenacao: a ordem e a da consulta.
     */
    @Query(value = """
            SELECT new com.geitus.app.inventory.dto.MovimentoEstoqueResponse(
                       m.uuid, m.tipo, m.motivo, m.origem, m.quantidade, m.saldoAnterior, m.saldoNovo,
                       m.observacao, u.nome, m.criadoEm, m.embalagemRotulo, m.embalagemQuantidade,
                       m.quantidadeEmbalagens, m.custoInformado, m.custoUnitario, f.uuid, f.razaoSocial)
              FROM MovimentoEstoque m
              JOIN Usuario u ON u.id = m.usuarioId AND u.empresa.id = m.empresaId
              LEFT JOIN Fornecedor f ON f.id = m.fornecedorId AND f.empresa.id = m.empresaId
             WHERE m.empresaId = :empresaId
               AND m.produto.id = :produtoId
             ORDER BY m.criadoEm DESC, m.id DESC
            """,
            countQuery = """
            SELECT count(m)
              FROM MovimentoEstoque m
             WHERE m.empresaId = :empresaId
               AND m.produto.id = :produtoId
            """)
    Page<MovimentoEstoqueResponse> movimentosDoProduto(@Param("empresaId") Long empresaId,
            @Param("produtoId") Long produtoId, Pageable pageable);

    /**
     * Entradas por compra com custo do produto (Fase B4), da mais recente para
     * a mais antiga: a primeira e a ultima compra. As compras anteriores a V13
     * (sem custo) ficam de fora. Use com {@code PageRequest.of(0, 1)}; atende o
     * indice {@code ix_movimento_estoque_produto}.
     */
    @Query("""
            SELECT new com.geitus.app.catalog.EntradaDeCompra(m.quantidade, m.quantidadeEmbalagens, m.embalagemRotulo,
                       f.razaoSocial)
              FROM MovimentoEstoque m
              LEFT JOIN Fornecedor f ON f.id = m.fornecedorId AND f.empresa.id = m.empresaId
             WHERE m.empresaId = :empresaId
               AND m.produto.id = :produtoId
               AND m.custoInformado IS NOT NULL
             ORDER BY m.criadoEm DESC, m.id DESC
            """)
    List<EntradaDeCompra> entradasDeCompraDoProduto(@Param("empresaId") Long empresaId,
            @Param("produtoId") Long produtoId, Pageable pageable);

    /** Quantidade e retrato dos movimentos informados que sao da empresa (DEC-016), em uma consulta. */
    @Query("""
            SELECT new com.geitus.app.inventory.EntradaDoMovimento(
                       m.id, m.quantidade, m.quantidadeEmbalagens, m.embalagemRotulo)
              FROM MovimentoEstoque m
             WHERE m.empresaId = :empresaId
               AND m.id IN :movimentoIds
            """)
    List<EntradaDoMovimento> entradasDosMovimentos(@Param("empresaId") Long empresaId,
            @Param("movimentoIds") Collection<Long> movimentoIds);

    /**
     * Contagem de movimentos por produto, em uma consulta: o total e os que nao
     * sao da origem informada (o estoque inicial, {@code CADASTRO}). Produto sem
     * movimentos fica fora da lista. Os ids vao num unico parametro de array
     * ({@code = ANY}), sem depender do numero de produtos.
     */
    default List<ContagemDeMovimentos> contagens(Long empresaId, Collection<Long> produtoIds,
            OrigemMovimento origemInicial) {
        return linhasDeContagem(empresaId, produtoIds.toArray(Long[]::new), origemInicial.name()).stream()
                .map(linha -> new ContagemDeMovimentos(((Number) linha[0]).longValue(),
                        ((Number) linha[1]).longValue(), ((Number) linha[2]).longValue()))
                .toList();
    }

    /** Linhas {@code [produto_id, total, nao_iniciais]}; use {@link #contagens}. */
    @Query(value = """
            SELECT m.produto_id, count(*), count(*) FILTER (WHERE m.origem <> :origemInicial)
              FROM movimentos_estoque m
             WHERE m.empresa_id = :empresaId
               AND m.produto_id = ANY(:produtoIds)
             GROUP BY m.produto_id
            """, nativeQuery = true)
    List<Object[]> linhasDeContagem(@Param("empresaId") Long empresaId, @Param("produtoIds") Long[] produtoIds,
            @Param("origemInicial") String origemInicial);

    /** Se algum produto da empresa com esta unidade de venda tem movimento de estoque. */
    @Query("""
            SELECT CASE WHEN count(m) > 0 THEN true ELSE false END
              FROM MovimentoEstoque m
             WHERE m.empresaId = :empresaId
               AND m.produto.unidade.id = :unidadeId
            """)
    boolean existeMovimentoDeProdutoDaUnidade(@Param("empresaId") Long empresaId,
            @Param("unidadeId") Long unidadeId);

    /**
     * Apaga os movimentos da origem informada do produto (so o estoque inicial,
     * na exclusao de produto cadastrado por engano; spec 4.7).
     */
    @Modifying
    @Query("""
            DELETE FROM MovimentoEstoque m
             WHERE m.empresaId = :empresaId
               AND m.produto.id = :produtoId
               AND m.origem = :origem
            """)
    int apagarDoProdutoPelaOrigem(@Param("empresaId") Long empresaId, @Param("produtoId") Long produtoId,
            @Param("origem") OrigemMovimento origem);

    /**
     * PDV: a quantidade (com sinal) dos movimentos do motivo informado ligados
     * a estes itens de venda, numa consulta (o estorno devolve o que a baixa
     * tirou; o item sem baixa fica fora da lista).
     */
    @Query("""
            SELECT new com.geitus.app.inventory.QuantidadeDoItem(m.itemVendaId, m.quantidade)
              FROM MovimentoEstoque m
             WHERE m.empresaId = :empresaId
               AND m.itemVendaId IN :itemVendaIds
               AND m.motivo = :motivo
            """)
    List<QuantidadeDoItem> quantidadesDosItens(@Param("empresaId") Long empresaId,
            @Param("itemVendaIds") Collection<Long> itemVendaIds, @Param("motivo") MotivoMovimento motivo);

    /** Fase B5: entradas por compra registradas com o fornecedor (id interno), na empresa. */
    long countByEmpresaIdAndFornecedorId(Long empresaId, Long fornecedorId);
}
