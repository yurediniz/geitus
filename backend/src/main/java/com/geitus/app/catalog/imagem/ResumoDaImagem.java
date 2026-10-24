package com.geitus.app.catalog.imagem;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * O que a resposta do produto precisa saber da imagem, sem os bytes: o
 * produto (id interno e UUID publico, para montar a URL), a versao, o tipo,
 * as dimensoes da versao grande e quando foi enviada.
 */
public record ResumoDaImagem(Long produtoId, UUID produtoUuid, UUID versao, TipoDeImagem tipo, int largura,
        int altura, LocalDateTime atualizadaEm) {
}
