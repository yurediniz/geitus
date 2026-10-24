package com.geitus.app.catalog.imagem;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Acesso a {@link ImagemDoProduto}.
 *
 * <p>As leituras sao projecoes: o resumo (para a resposta do produto) nunca
 * traz os bytes, e os bytes so saem pela leitura publica, uma versao por vez.
 * O resumo isola por {@code empresaId} (DEC-016). A leitura publica acha a
 * imagem pelo UUID publico do produto e pela {@code versao}: quem autoriza e
 * a assinatura da URL, conferida antes no controller.
 */
public interface ImagemDoProdutoRepository extends JpaRepository<ImagemDoProduto, Long> {

    // Nota: as dimensoes sao SMALLINT (short na entidade); o cast para Integer
    // casa com o construtor do resumo (int).

    /** Resumo da imagem do produto da empresa, sem os bytes. */
    @Query("""
            SELECT new com.geitus.app.catalog.imagem.ResumoDaImagem(i.produtoId, p.uuid, i.versao, i.tipo,
                       cast(i.grandeLargura as Integer), cast(i.grandeAltura as Integer), i.atualizadoEm)
              FROM ImagemDoProduto i
              JOIN Produto p ON p.id = i.produtoId
             WHERE i.empresaId = :empresaId
               AND i.produtoId = :produtoId
            """)
    Optional<ResumoDaImagem> resumo(@Param("empresaId") Long empresaId, @Param("produtoId") Long produtoId);

    /** Resumos dos produtos da empresa com estes ids que tem imagem (uma consulta para a pagina inteira). */
    @Query("""
            SELECT new com.geitus.app.catalog.imagem.ResumoDaImagem(i.produtoId, p.uuid, i.versao, i.tipo,
                       cast(i.grandeLargura as Integer), cast(i.grandeAltura as Integer), i.atualizadoEm)
              FROM ImagemDoProduto i
              JOIN Produto p ON p.id = i.produtoId
             WHERE i.empresaId = :empresaId
               AND i.produtoId IN :produtoIds
            """)
    List<ResumoDaImagem> resumos(@Param("empresaId") Long empresaId,
            @Param("produtoIds") Collection<Long> produtoIds);

    /** Os bytes da versao grande, se a versao ainda for a atual do produto. */
    @Query("""
            SELECT new com.geitus.app.catalog.imagem.BytesDaImagem(i.grande, i.tipo)
              FROM ImagemDoProduto i
              JOIN Produto p ON p.id = i.produtoId
             WHERE p.uuid = :produtoUuid
               AND i.versao = :versao
            """)
    Optional<BytesDaImagem> grande(@Param("produtoUuid") UUID produtoUuid, @Param("versao") UUID versao);

    /** Os bytes da miniatura, se a versao ainda for a atual do produto. */
    @Query("""
            SELECT new com.geitus.app.catalog.imagem.BytesDaImagem(i.miniatura, i.tipo)
              FROM ImagemDoProduto i
              JOIN Produto p ON p.id = i.produtoId
             WHERE p.uuid = :produtoUuid
               AND i.versao = :versao
            """)
    Optional<BytesDaImagem> miniatura(@Param("produtoUuid") UUID produtoUuid, @Param("versao") UUID versao);

    /** Apaga a imagem do produto da empresa; devolve quantas linhas sairam (0 = o produto nao tinha imagem). */
    @Modifying
    @Query("DELETE FROM ImagemDoProduto i WHERE i.empresaId = :empresaId AND i.produtoId = :produtoId")
    int remover(@Param("empresaId") Long empresaId, @Param("produtoId") Long produtoId);
}
