-- V13: custo na entrada por compra (Fase B4) -- o custo informado e o custo
-- por unidade no movimento de compra; a origem do custo atual no produto; a
-- origem e o movimento nas linhas de custo do historico de precos.
--
-- Migration aditiva (V1-V12 intactas, DEC-020). Ver
-- docs/modules/produtos-custo-entrada.md (secao 5) e DEC-038.
--
-- Convencoes:
--  * Dinheiro digitado em NUMERIC(12,2), como os precos; o custo por unidade
--    em NUMERIC(14,4), porque a divisao pela embalagem (CX c/ 3 a R$ 100,00 =
--    R$ 33,3333) nao cabe em centavos. O produto guarda o custo por unidade
--    arredondado a centavos (aplicacao, HALF_UP).
--  * A obrigacao "compra nova exige custo" fica na aplicacao: os movimentos de
--    compra ja gravados nao tem custo e sao imutaveis, entao uma CHECK nos dois
--    sentidos falharia neles. Aqui ficam as regras da propria linha.
--  * Isolamento por empresa (DEC-016): a linha do historico so se liga a um
--    movimento da mesma empresa, garantido por FK COMPOSTA.
--  * As CHECKs que comparam colunas anulaveis sao escritas sem resultado NULL
--    (IS NOT NULL / coalesce explicitos): uma CHECK com resultado NULL passa.

-- =====================================================================
-- Passo 1: custo no movimento de estoque.
-- =====================================================================
ALTER TABLE movimentos_estoque
    -- O valor digitado: por unidade de venda, ou por embalagem quando o
    -- ajuste foi informado em embalagens (como vem na nota).
    ADD COLUMN custo_informado NUMERIC(12,2),
    -- O custo por unidade de venda: o informado, ou o informado dividido pelas
    -- unidades da embalagem, com 4 casas.
    ADD COLUMN custo_unitario  NUMERIC(14,4),
    -- Alvo da FK composta do historico de precos (a V9 nao tem).
    ADD CONSTRAINT uq_movimento_estoque_empresa_id UNIQUE (empresa_id, id),
    -- Os dois nulos ou os dois preenchidos e maiores que zero.
    ADD CONSTRAINT ck_movimento_estoque_custo_completo CHECK (
        (custo_informado IS NULL AND custo_unitario IS NULL)
        OR (custo_informado IS NOT NULL AND custo_unitario IS NOT NULL
            AND custo_informado > 0 AND custo_unitario > 0)),
    -- So a entrada manual por compra tem custo.
    ADD CONSTRAINT ck_movimento_estoque_custo_da_compra CHECK (
        custo_informado IS NULL
        OR (tipo = 'ENTRADA' AND motivo = 'COMPRA' AND origem = 'AJUSTE_MANUAL')),
    -- Coerencia com o retrato da embalagem (V12): com retrato, o informado e o
    -- de 1 embalagem e o unitario e a divisao arredondada a 4 casas (round do
    -- PostgreSQL = HALF_UP para positivos); sem retrato, o proprio informado.
    -- A linha sem custo ou com um so dos dois campos fica para a CHECK acima.
    ADD CONSTRAINT ck_movimento_estoque_custo_unitario CHECK (
        custo_informado IS NULL
        OR custo_unitario IS NULL
        OR (embalagem_quantidade IS NULL AND custo_unitario = custo_informado)
        OR (embalagem_quantidade IS NOT NULL
            AND custo_unitario = round(custo_informado / embalagem_quantidade, 4)));

-- =====================================================================
-- Passo 2: origem do custo atual no produto.
-- =====================================================================
-- Os produtos existentes ficam sem origem (desconhecida): a tela nao mostra
-- nota para eles.
ALTER TABLE produtos
    ADD COLUMN custo_origem    VARCHAR(20),
    ADD COLUMN custo_origem_em TIMESTAMP,
    ADD CONSTRAINT ck_produto_custo_origem_valida CHECK (custo_origem IN ('ENTRADA_COMPRA', 'EDICAO')),
    -- A origem e a data vem juntas.
    ADD CONSTRAINT ck_produto_custo_origem_completa CHECK ((custo_origem IS NULL) = (custo_origem_em IS NULL)),
    -- Custo apagado apaga a origem.
    ADD CONSTRAINT ck_produto_custo_origem_com_custo CHECK (custo IS NOT NULL OR custo_origem IS NULL);

-- =====================================================================
-- Passo 3: origem e movimento nas linhas de custo do historico.
-- =====================================================================
ALTER TABLE produto_historico_precos
    ADD COLUMN origem       VARCHAR(20),
    ADD COLUMN movimento_id BIGINT,
    ADD CONSTRAINT ck_historico_preco_origem_valida CHECK (origem IN ('EDICAO', 'ENTRADA_COMPRA')),
    -- O movimento e imutavel: RESTRICT. MATCH SIMPLE: so conferida com o
    -- movimento preenchido.
    ADD CONSTRAINT fk_historico_preco_movimento FOREIGN KEY (empresa_id, movimento_id)
        REFERENCES movimentos_estoque (empresa_id, id) ON DELETE RESTRICT,
    -- O movimento vem so (e sempre) nas linhas de origem ENTRADA_COMPRA.
    ADD CONSTRAINT ck_historico_preco_movimento CHECK (
        coalesce(origem = 'ENTRADA_COMPRA', false) = (movimento_id IS NOT NULL));

-- Ate aqui so o cadastro do produto alterava o custo.
UPDATE produto_historico_precos SET origem = 'EDICAO' WHERE campo = 'CUSTO';

-- Depois do preenchimento: a origem vem so (e sempre) nas linhas de custo.
ALTER TABLE produto_historico_precos
    ADD CONSTRAINT ck_historico_preco_origem_do_custo CHECK ((campo = 'CUSTO') = (origem IS NOT NULL));

-- Serve a FK RESTRICT na remocao de um movimento (o estoque inicial, na
-- exclusao de produto cadastrado por engano). So as linhas de compra tem
-- movimento.
CREATE INDEX idx_historico_preco_movimento
    ON produto_historico_precos (empresa_id, movimento_id)
    WHERE movimento_id IS NOT NULL;
