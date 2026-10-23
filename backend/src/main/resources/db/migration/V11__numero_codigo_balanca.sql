-- V11: numero de registro (produtos e clientes), codigo do produto, "vendido na
-- balanca" e configuracao da etiqueta de balanca (Fase B2).
--
-- Migration aditiva (V1-V10 intactas, DEC-020). Ver
-- docs/modules/produtos-codigo-e-balanca.md (secoes 2, 3 e 7) e DEC-036.
--
-- Convencoes:
--  * numero: 1, 2, 3... por empresa, gerado pela aplicacao (Numerador, com a
--    tabela numeracoes) na mesma transacao da criacao e IMUTAVEL (a entidade
--    mapeia a coluna com updatable = false). NAO e a PK (DEC-015/019 seguem).
--    Os registros que ja existem sao numerados aqui, por ordem de cadastro.
--  * codigo: inteiro de 1 a 999999, opcional, unico por empresa quando
--    informado. Guardado como numero: 000542 e 542 sao o mesmo codigo.
--  * numeracoes: ultimo numero entregue por empresa e tipo. O incremento e
--    "UPDATE ... SET ultimo_numero = ultimo_numero + 1 ... RETURNING", que trava
--    a linha ate o fim da transacao: dois cadastros simultaneos nunca recebem o
--    mesmo numero e um cadastro desfeito (rollback) nao consome numero.
--  * configuracoes_etiqueta_balanca: no maximo uma por empresa; empresa sem
--    linha usa o padrao da aplicacao (2 + codigo 6 + valor 6, 3 casas, sem DV).

-- =====================================================================
-- Passo 1: colunas novas (numero criado nulo para o preenchimento).
-- =====================================================================
ALTER TABLE produtos
    ADD COLUMN numero          BIGINT,
    ADD COLUMN codigo          INTEGER,
    ADD COLUMN vendido_balanca BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE clientes
    ADD COLUMN numero BIGINT;

-- =====================================================================
-- Passo 2: numeracao dos registros existentes, por empresa e por ordem de
-- cadastro (o id desempata cadastros no mesmo instante).
-- =====================================================================
UPDATE produtos p
   SET numero = ordem.numero
  FROM (SELECT id, row_number() OVER (PARTITION BY empresa_id ORDER BY criado_em, id) AS numero
          FROM produtos) ordem
 WHERE ordem.id = p.id;

UPDATE clientes c
   SET numero = ordem.numero
  FROM (SELECT id, row_number() OVER (PARTITION BY empresa_id ORDER BY criado_em, id) AS numero
          FROM clientes) ordem
 WHERE ordem.id = c.id;

-- =====================================================================
-- Passo 3: numero obrigatorio.
-- =====================================================================
ALTER TABLE produtos ALTER COLUMN numero SET NOT NULL;
ALTER TABLE clientes ALTER COLUMN numero SET NOT NULL;

-- =====================================================================
-- Passo 4: numero unico por empresa (o indice tambem serve a busca por numero).
-- =====================================================================
ALTER TABLE produtos ADD CONSTRAINT uq_produto_empresa_numero UNIQUE (empresa_id, numero);
ALTER TABLE clientes ADD CONSTRAINT uq_cliente_empresa_numero UNIQUE (empresa_id, numero);

-- =====================================================================
-- Passo 5: CHECKs do numero, do codigo e da balanca.
-- =====================================================================
ALTER TABLE produtos
    ADD CONSTRAINT ck_produto_numero_positivo CHECK (numero >= 1),
    ADD CONSTRAINT ck_produto_codigo_intervalo CHECK (codigo BETWEEN 1 AND 999999),
    -- "Vendido na balanca" exige o codigo do produto (e o que a etiqueta traz).
    ADD CONSTRAINT ck_produto_balanca_exige_codigo CHECK (NOT vendido_balanca OR codigo IS NOT NULL);

ALTER TABLE clientes
    ADD CONSTRAINT ck_cliente_numero_positivo CHECK (numero >= 1);

-- =====================================================================
-- Passo 6: codigo unico por empresa, so quando informado (indice parcial; tambem
-- serve a busca pelo codigo e a leitura da etiqueta).
-- =====================================================================
CREATE UNIQUE INDEX uq_produto_empresa_codigo
    ON produtos (empresa_id, codigo)
    WHERE codigo IS NOT NULL;

-- =====================================================================
-- Passo 7: numeracoes, ja com o maior numero de cada tipo por empresa.
-- =====================================================================
CREATE TABLE numeracoes (
    empresa_id    BIGINT      NOT NULL,
    tipo          VARCHAR(20) NOT NULL,
    ultimo_numero BIGINT      NOT NULL,
    CONSTRAINT pk_numeracoes PRIMARY KEY (empresa_id, tipo),
    CONSTRAINT fk_numeracao_empresa FOREIGN KEY (empresa_id) REFERENCES empresa (id),
    CONSTRAINT ck_numeracao_tipo CHECK (tipo IN ('PRODUTO', 'CLIENTE')),
    CONSTRAINT ck_numeracao_nao_negativa CHECK (ultimo_numero >= 0)
);

INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero)
SELECT empresa_id, 'PRODUTO', max(numero) FROM produtos GROUP BY empresa_id;

INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero)
SELECT empresa_id, 'CLIENTE', max(numero) FROM clientes GROUP BY empresa_id;

-- =====================================================================
-- Passo 8: configuracao da etiqueta de balanca (uma por empresa).
-- =====================================================================
CREATE TABLE configuracoes_etiqueta_balanca (
    id                    BIGINT      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    empresa_id            BIGINT      NOT NULL,
    prefixo               VARCHAR(2)  NOT NULL,
    digitos_codigo        SMALLINT    NOT NULL,
    digitos_preenchimento SMALLINT    NOT NULL,
    tipo_informacao       VARCHAR(10) NOT NULL,
    digitos_informacao    SMALLINT    NOT NULL,
    casas_decimais        SMALLINT    NOT NULL,
    digito_verificador    BOOLEAN     NOT NULL,
    atualizado_em         TIMESTAMP   NOT NULL,
    CONSTRAINT fk_etiqueta_empresa FOREIGN KEY (empresa_id) REFERENCES empresa (id),
    CONSTRAINT uq_etiqueta_empresa UNIQUE (empresa_id),
    CONSTRAINT ck_etiqueta_prefixo CHECK (prefixo ~ '^[0-9]{1,2}$'),
    CONSTRAINT ck_etiqueta_digitos_codigo CHECK (digitos_codigo BETWEEN 4 AND 6),
    CONSTRAINT ck_etiqueta_digitos_preenchimento CHECK (digitos_preenchimento BETWEEN 0 AND 2),
    CONSTRAINT ck_etiqueta_tipo_informacao CHECK (tipo_informacao IN ('VALOR', 'PESO')),
    CONSTRAINT ck_etiqueta_digitos_informacao CHECK (digitos_informacao BETWEEN 4 AND 7),
    CONSTRAINT ck_etiqueta_casas_decimais CHECK (casas_decimais IN (2, 3)),
    -- prefixo + codigo + preenchimento + informacao + DV = 13 (EAN-13).
    CONSTRAINT ck_etiqueta_tamanho_total CHECK (
        length(prefixo) + digitos_codigo + digitos_preenchimento + digitos_informacao
            + CASE WHEN digito_verificador THEN 1 ELSE 0 END = 13)
);
