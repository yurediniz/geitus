-- V10: colunas normalizadas para a busca sem acento e a ordenacao da lista de
-- produtos (Fase E).
--
-- Migration aditiva (V1-V9 intactas, DEC-020). Ver
-- docs/modules/produtos-listagem.md (secoes 3 e 4.1) e DEC-035.
--
-- Convencoes:
--  * As duas colunas sao DERIVADAS do cadastro e mantidas pela aplicacao
--    (TextoDeBusca.normalizar) a cada gravacao do produto. Esta migration so
--    preenche os produtos que ja existem.
--  * Sem extensao do PostgreSQL (nada de unaccent/pg_trgm, DEC-030): a
--    conversao abaixo e o equivalente SQL da normalizacao Java, provado pelo
--    MigracaoV10IT para todas as letras do translate e para o catalogo de
--    exemplo.

-- =====================================================================
-- Passo 1: colunas, criadas nulas para o preenchimento.
-- =====================================================================
ALTER TABLE produtos
    ADD COLUMN busca_normalizada TEXT,
    ADD COLUMN nome_normalizado  TEXT;

-- =====================================================================
-- Passo 2: preenchimento dos produtos existentes.
-- =====================================================================
-- Funcao TEMPORARIA (pg_temp, some no fim da sessao e e removida abaixo), so
-- para nao repetir a conversao nas duas colunas. Equivale a TextoDeBusca:
--  1. letras acentuadas do portugues -> letra base (translate) e marcas
--     combinantes soltas (U+0300-U+036F, texto ja decomposto) removidas;
--  2. minusculas;
--  3. qualquer sequencia de espacos (ASCII e separadores Unicode, como
--     U+00A0, U+2007, U+202F e U+3000) -> um espaco so;
--  4. pontas aparadas.
CREATE FUNCTION pg_temp.normalizar_busca(texto TEXT) RETURNS TEXT
    LANGUAGE sql IMMUTABLE
AS $$
    SELECT btrim(regexp_replace(
               lower(regexp_replace(
                   translate(texto,
                             'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñÝýÿ',
                             'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'),
                   '[\u0300-\u036f]', '', 'g')),
               '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g'))
$$;

-- concat_ws ignora os campos nulos; campos vazios viram so espaco, que a
-- normalizacao colapsa e apara.
UPDATE produtos
   SET nome_normalizado  = pg_temp.normalizar_busca(nome),
       busca_normalizada = pg_temp.normalizar_busca(concat_ws(' ', nome, nome_curto, sku, marca));

DROP FUNCTION pg_temp.normalizar_busca(TEXT);

ALTER TABLE produtos
    ALTER COLUMN busca_normalizada SET NOT NULL,
    ALTER COLUMN nome_normalizado  SET NOT NULL;

-- =====================================================================
-- Passo 3: indices da listagem (sempre filtrada por empresa, DEC-016).
-- =====================================================================
-- Filtro de status e ordem padrao (nome A-Z, desempate pelo id).
CREATE INDEX ix_produto_empresa_ativo_nome
    ON produtos (empresa_id, ativo, nome_normalizado, id);

-- Ordem "mais recentes".
CREATE INDEX ix_produto_empresa_criado
    ON produtos (empresa_id, criado_em DESC, id DESC);

-- Ordem "atualizados recentemente" (produto nunca editado conta pela criacao).
CREATE INDEX ix_produto_empresa_atualizado
    ON produtos (empresa_id, (COALESCE(atualizado_em, criado_em)) DESC, id DESC);
