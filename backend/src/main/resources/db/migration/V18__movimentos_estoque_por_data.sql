-- V18: movimentacoes de todos os produtos (docs/modules/estoque.md, regra 26).
--
-- A aba Movimentacoes lista os movimentos da empresa por periodo, do mais
-- recente ao mais antigo, sem filtro de produto. O indice da V9
-- (empresa_id, produto_id, criado_em DESC, id DESC) so atende a consulta por
-- produto; este atende a consulta da empresa inteira. So aditiva (DEC-020).

CREATE INDEX ix_movimento_estoque_empresa_data
    ON movimentos_estoque (empresa_id, criado_em DESC, id DESC);
