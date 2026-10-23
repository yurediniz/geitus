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
--  * MUDAR A NORMALIZACAO (aqui ou no TextoDeBusca) EXIGE RECALCULAR as duas
--    colunas de todos os produtos, por migration nova ou rotina de recalculo:
--    o texto gravado e o termo digitado precisam passar pela mesma regra.
--  * Sem extensao do PostgreSQL (nada de unaccent/pg_trgm, DEC-030): a
--    conversao abaixo e o equivalente SQL da normalizacao Java, provado pelo
--    MigracaoV10IT (imagem postgres:16, a mesma do dev) SO para as 53 letras
--    acentuadas do translate e para os caracteres de controle e de formatacao
--    do plano basico do Unicode. Letras fora da lista (por exemplo, "Ÿ") nao
--    tem equivalencia garantida: o Java tira o acento e o SQL nao.
--  * Collation "C" nas duas colunas: a ordem por nome (e o indice, que herda a
--    collation) e a mesma em todo ambiente, sem depender do glibc/musl do
--    servidor. O texto ja vem sem acento e em minusculas, entao a ordem por
--    codigo e a alfabetica (o espaco vem antes da pontuacao).

-- =====================================================================
-- Passo 1: colunas, criadas nulas para o preenchimento.
-- =====================================================================
ALTER TABLE produtos
    ADD COLUMN busca_normalizada TEXT COLLATE "C",
    ADD COLUMN nome_normalizado  TEXT COLLATE "C";

-- =====================================================================
-- Passo 2: preenchimento dos produtos existentes.
-- =====================================================================
-- Funcao TEMPORARIA (pg_temp, some no fim da sessao e e removida abaixo), so
-- para nao repetir a conversao nas duas colunas. Equivale a TextoDeBusca:
--  1. letras acentuadas do portugues -> letra base (translate);
--  2. marcas combinantes soltas (U+0300-U+036F, texto ja decomposto) e
--     caracteres invisiveis de controle (Cc) e de formatacao (Cf) do plano
--     basico removidos, MENOS os que sao espaco (tab, quebras, U+0085);
--  3. minusculas;
--  4. qualquer sequencia de espacos (ASCII, U+0085 e os separadores Unicode,
--     como U+00A0, U+2007, U+202F e U+3000) -> um espaco so;
--  5. pontas aparadas.
CREATE FUNCTION pg_temp.normalizar_busca(texto TEXT) RETURNS TEXT
    LANGUAGE sql IMMUTABLE
AS $$
    SELECT btrim(regexp_replace(
               lower(regexp_replace(
                   translate(texto,
                             'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñÝýÿ',
                             'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'),
                   '[\u0300-\u036f'
                   || '\u0001-\u0008\u000e-\u001f\u007f-\u0084\u0086-\u009f'
                   || '\u00ad\u0600-\u0605\u061c\u06dd\u070f\u0890\u0891\u08e2\u180e'
                   || '\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]',
                   '', 'g')),
               '[\s\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g'))
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
-- Cada indice segue o ORDER BY da OrdemDeProdutos, que sempre termina no
-- desempate por nome_normalizado e id.

-- Filtro de status e ordem padrao (nome A-Z).
CREATE INDEX ix_produto_empresa_ativo_nome
    ON produtos (empresa_id, ativo, nome_normalizado, id);

-- Ordem "mais recentes".
CREATE INDEX ix_produto_empresa_criado
    ON produtos (empresa_id, criado_em DESC, nome_normalizado, id);

-- Ordem "atualizados recentemente" (produto nunca editado conta pela criacao).
CREATE INDEX ix_produto_empresa_atualizado
    ON produtos (empresa_id, (COALESCE(atualizado_em, criado_em)) DESC, nome_normalizado, id);
