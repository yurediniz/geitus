-- V15: imagem do produto (Fase F), uma por produto, com a versao grande e a
-- miniatura ja comprimidas no navegador.
--
-- Migration aditiva (V1-V14 intactas, DEC-020). Ver
-- docs/modules/produtos-imagem.md (secao 3) e DEC-040.
--
-- Convencoes:
--  * Tabela separada de produtos, uma linha por produto (produto_id e a PK):
--    nenhuma consulta de produto carrega os bytes. Saber se o produto tem
--    imagem e uma juncao pela PK, sem ler os bytes. Sem colunas novas em
--    produtos.
--  * Isolamento por empresa (DEC-016) no banco: FKs COMPOSTAS (empresa_id, ...)
--    para o produto (uq_produto_empresa_id, V7) e para o usuario que enviou
--    (uq_usuario_empresa_id, V8). A imagem sai em cascata com a exclusao
--    fisica do produto; usuarios nao sao excluidos (RESTRICT, padrao).
--  * versao: UUID gerado na aplicacao a cada envio. Entra na URL assinada,
--    entao trocar a imagem troca a URL (sem cache velho) e a URL antiga deixa
--    de achar a imagem. UNIQUE: tambem e o indice da leitura publica.
--  * tipo: o MIME real (conferido pelos primeiros bytes), o mesmo nas duas
--    versoes.
--  * Limites iguais aos do navegador e do servidor: grande ate 1200 px e
--    409600 bytes, miniatura ate 200 px e 40960 bytes, nenhuma vazia.
--  * Os bytes ja vem comprimidos (WebP/JPEG): STORAGE EXTERNAL guarda no TOAST
--    sem tentar comprimir de novo.

CREATE TABLE produto_imagens (
    produto_id        BIGINT      PRIMARY KEY,
    empresa_id        BIGINT      NOT NULL,
    versao            UUID        NOT NULL,
    tipo              VARCHAR(20) NOT NULL,
    grande            BYTEA       NOT NULL,
    grande_largura    SMALLINT    NOT NULL,
    grande_altura     SMALLINT    NOT NULL,
    miniatura         BYTEA       NOT NULL,
    miniatura_largura SMALLINT    NOT NULL,
    miniatura_altura  SMALLINT    NOT NULL,
    usuario_id        BIGINT      NOT NULL,
    atualizado_em     TIMESTAMP   NOT NULL,
    CONSTRAINT fk_produto_imagem_produto FOREIGN KEY (empresa_id, produto_id)
        REFERENCES produtos (empresa_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_produto_imagem_usuario FOREIGN KEY (empresa_id, usuario_id)
        REFERENCES usuario (empresa_id, id),
    CONSTRAINT uq_produto_imagem_versao UNIQUE (versao),
    CONSTRAINT ck_produto_imagem_tipo CHECK (tipo IN ('image/webp', 'image/jpeg')),
    CONSTRAINT ck_produto_imagem_grande_bytes CHECK (octet_length(grande) BETWEEN 1 AND 409600),
    CONSTRAINT ck_produto_imagem_grande_largura CHECK (grande_largura BETWEEN 1 AND 1200),
    CONSTRAINT ck_produto_imagem_grande_altura CHECK (grande_altura BETWEEN 1 AND 1200),
    CONSTRAINT ck_produto_imagem_miniatura_bytes CHECK (octet_length(miniatura) BETWEEN 1 AND 40960),
    CONSTRAINT ck_produto_imagem_miniatura_largura CHECK (miniatura_largura BETWEEN 1 AND 200),
    CONSTRAINT ck_produto_imagem_miniatura_altura CHECK (miniatura_altura BETWEEN 1 AND 200)
);

-- Indice da FK do usuario nao e necessario: usuarios nao sao excluidos e
-- nenhuma consulta parte do usuario. A FK do produto usa a PK (produto_id).

ALTER TABLE produto_imagens
    ALTER COLUMN grande SET STORAGE EXTERNAL,
    ALTER COLUMN miniatura SET STORAGE EXTERNAL;
