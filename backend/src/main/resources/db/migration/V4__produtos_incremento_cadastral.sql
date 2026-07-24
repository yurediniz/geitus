-- V4: incremento cadastral do Produto (marca, descricao e hints de estoque/preco).
-- Colunas nullable, append-only (V1/V2/V3 intactas). Ver docs/modules/produtos.md.
ALTER TABLE produtos
    ADD COLUMN marca            VARCHAR(100),
    ADD COLUMN descricao        VARCHAR(1000),
    ADD COLUMN estoque_maximo   NUMERIC(12,3),
    ADD COLUMN ponto_reposicao  NUMERIC(12,3),
    ADD COLUMN preco_minimo     NUMERIC(12,2);

ALTER TABLE produtos
    ADD CONSTRAINT ck_produto_estoque_maximo_nao_negativo  CHECK (estoque_maximo  IS NULL OR estoque_maximo  >= 0),
    ADD CONSTRAINT ck_produto_ponto_reposicao_nao_negativo CHECK (ponto_reposicao IS NULL OR ponto_reposicao >= 0),
    ADD CONSTRAINT ck_produto_preco_minimo_nao_negativo    CHECK (preco_minimo    IS NULL OR preco_minimo    >= 0);
