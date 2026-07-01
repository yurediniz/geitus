-- Migration inicial (baseline) do ERPell.
--
-- Objetivo: validar que a configuracao do Flyway esta funcionando de ponta a ponta.
-- Esta tabela NAO representa nenhuma entidade de negocio; e apenas um marcador
-- tecnico do baseline. As tabelas reais dos modulos (produtos, clientes, vendas,
-- caixa, financeiro, etc.) serao criadas em migrations proprias nas proximas etapas.

CREATE TABLE erpell_baseline (
    id            SMALLINT     NOT NULL,
    descricao     VARCHAR(120) NOT NULL,
    criado_em     TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT pk_erpell_baseline PRIMARY KEY (id)
);

INSERT INTO erpell_baseline (id, descricao)
VALUES (1, 'Baseline inicial do ERPell - estrutura validada pelo Flyway');
