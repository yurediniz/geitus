package com.geitus.app.catalog.dto;

import java.util.Map;

import com.geitus.app.catalog.imagem.AssinaturaDeImagem;
import com.geitus.app.catalog.imagem.ResumoDaImagem;

/**
 * As imagens dos produtos de uma resposta (docs/modules/produtos.md):
 * os resumos sem bytes, por id interno do produto, carregados numa
 * consulta so (na listagem, para a pagina inteira), e a assinatura que monta
 * as URLs.
 */
public record ImagensDosProdutos(Map<Long, ResumoDaImagem> resumos, AssinaturaDeImagem assinatura) {

    public ImagensDosProdutos {
        resumos = Map.copyOf(resumos);
    }

    /** Nenhum produto com imagem: dispensa a assinatura. */
    public static ImagensDosProdutos nenhuma() {
        return new ImagensDosProdutos(Map.of(), null);
    }

    /**
     * A imagem do produto com as URLs assinadas, ou {@code null} se ele nao
     * tem imagem (ou ainda nao tem id: o mapa imutavel nao aceita chave nula).
     */
    public ImagemResponse doProduto(Long produtoId) {
        ResumoDaImagem resumo = produtoId == null ? null : resumos.get(produtoId);
        return resumo == null ? null : ImagemResponse.de(resumo, assinatura);
    }
}
