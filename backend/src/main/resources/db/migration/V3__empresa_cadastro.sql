-- Cadastro da empresa: representante legal + dados da empresa + endereco.
--
-- Migration aditiva sobre o baseline (V1): expande a tabela empresa, que ate
-- aqui tinha apenas (id, nome, ativo, timestamps). Adiciona os dados do
-- representante legal (@Embeddable RepresentanteLegal), os dados de contato e
-- fiscais da empresa e o endereco (@Embeddable Endereco).
--
-- Fluxo "Ja possui CNPJ?": a resposta define tipo_pessoa (nao -> FISICA,
-- sim -> JURIDICA). Empresa JURIDICA tem cnpj (unico) e razao_social; empresa
-- FISICA nao tem cnpj (identidade fiscal informal e o CPF do representante).
--
-- Colunas NOT NULL: como o geitus_db de dev e descartavel (DEC-020), ele e
-- recriado e o DevAdminBootstrap passa a criar a empresa de dev ja completa.
--
-- CPF, CNPJ, telefones e CEP sao armazenados apenas com digitos (sem mascara).
-- Validacoes equivalentes (digitos verificadores, coerencia PJ/PF) vivem tambem
-- na aplicacao (dominio company).

ALTER TABLE empresa
    -- Representante legal (sempre obrigatorio)
    ADD COLUMN representante_nome     VARCHAR(180) NOT NULL,
    ADD COLUMN representante_cpf      VARCHAR(11)  NOT NULL,
    ADD COLUMN representante_telefone VARCHAR(20)  NOT NULL,
    ADD COLUMN representante_email    VARCHAR(180) NOT NULL,
    -- Dados de contato/fiscais da empresa
    ADD COLUMN telefone              VARCHAR(20)  NOT NULL,
    ADD COLUMN email                 VARCHAR(180) NOT NULL,
    ADD COLUMN tipo_pessoa           VARCHAR(10)  NOT NULL,
    ADD COLUMN cnpj                  VARCHAR(14),
    ADD COLUMN razao_social          VARCHAR(180),
    ADD COLUMN inscricao_estadual    VARCHAR(20),
    -- Endereco
    ADD COLUMN endereco_cep          VARCHAR(8)   NOT NULL,
    ADD COLUMN endereco_logradouro   VARCHAR(180) NOT NULL,
    ADD COLUMN endereco_numero       VARCHAR(20)  NOT NULL,
    ADD COLUMN endereco_complemento  VARCHAR(120),
    ADD COLUMN endereco_bairro       VARCHAR(120) NOT NULL,
    ADD COLUMN endereco_municipio    VARCHAR(120) NOT NULL,
    ADD COLUMN endereco_uf           VARCHAR(2)   NOT NULL;

-- CNPJ unico quando informado. No Postgres, UNIQUE trata multiplos NULL como
-- nao-conflitantes (empresas FISICA, sem CNPJ, nunca colidem entre si).
ALTER TABLE empresa
    ADD CONSTRAINT uq_empresa_cnpj UNIQUE (cnpj);

-- Allow-list do tipo de pessoa (espelha o enum com.geitus.app.company.TipoPessoa).
ALTER TABLE empresa
    ADD CONSTRAINT ck_empresa_tipo_pessoa CHECK (tipo_pessoa IN ('FISICA', 'JURIDICA'));

-- Coerencia PJ/PF: JURIDICA exige cnpj + razao social; FISICA nao tem cnpj.
ALTER TABLE empresa
    ADD CONSTRAINT ck_empresa_coerencia_pessoa CHECK (
        (tipo_pessoa = 'JURIDICA' AND cnpj IS NOT NULL AND razao_social IS NOT NULL)
        OR (tipo_pessoa = 'FISICA' AND cnpj IS NULL)
    );
