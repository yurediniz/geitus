# Empresa

## 1. Objetivo

Cadastro da empresa autenticada (o tenant, DEC-016): representante legal, dados da empresa e endereço. O fluxo "Já possui CNPJ?" atende tanto o negócio formal (PJ) quanto o informal (sem CNPJ). Cada loja é uma Empresa própria (DEC-024).

## 2. Regras de negócio

1. **Representante legal** sempre obrigatório: nome completo, CPF (dígitos verificadores válidos), telefone e e-mail. O CPF do representante **não é único** (uma pessoa pode representar várias empresas).
2. **"Já possui CNPJ?"** define o `tipoPessoa`: não → `FISICA`; sim → `JURIDICA`.
3. **Campos comuns obrigatórios:** nome da empresa (nome fantasia, também usado no layout e no `/auth/me`), telefone, e-mail e endereço (CEP, logradouro, número, bairro, município, UF). O complemento é opcional. Número aceita dígitos ou "sem número", que grava `"S/N"`.
4. **JURIDICA:** CNPJ obrigatório, com dígitos verificadores válidos e **único** (em outra empresa → **409**); razão social obrigatória; inscrição estadual opcional.
5. **FISICA:** sem CNPJ (se vier, 400). A identidade informal é o CPF do representante.
6. **Formatos:** telefones BR válidos (DDD + número); UF na lista dos 27 estados; CEP com 8 dígitos; e-mails válidos. Documentos, CEP e telefones são gravados só com dígitos.
7. **Perfis:** qualquer autenticado vê; editar é só **ADMIN** (OPERADOR → 403).
8. **Isolamento:** a empresa vem sempre do usuário autenticado, sem `empresaId` externo. O PATCH não altera `id`, `ativo` nem carimbos.
9. CPF e CNPJ são dados cadastrais: não vão para log sem necessidade.

## 3. Contrato da API

| Método | Rota | Perfil | Observação |
|---|---|---|---|
| GET | `/api/empresas/minha` | autenticado | Empresa do usuário, com `representanteLegal` e `endereco` aninhados |
| PATCH | `/api/empresas/minha` | ADMIN | Atualiza representante, empresa e endereço (e CNPJ, razão social e IE se JURIDICA). 400 com `campos`; 409 CNPJ duplicado; 403 OPERADOR |

## 4. Dados

Tabela `empresa` (V1), ampliada na **V3**. Representante legal e endereço são `@Embeddable` na própria tabela.
- `ck_empresa_tipo_pessoa`: `FISICA`/`JURIDICA`.
- `ck_empresa_coerencia_pessoa`: JURIDICA tem CNPJ e razão social; FISICA não tem CNPJ.
- `uq_empresa_cnpj`: CNPJ único quando presente.

## 5. Telas

- `/empresa`, com item na seção Configurações do menu, para todos (é o único item da seção que o OPERADOR vê). O ADMIN edita; o OPERADOR vê em modo leitura (campos desabilitados, sem salvar).
- Seções:
  - Representante legal;
  - Empresa, com a pergunta "Já possui CNPJ?" que revela os campos de PJ;
  - Endereço.
- Máscaras de CPF, CNPJ e telefones; checkbox "sem número"; estados de carregando, erro, vazio e sucesso.
- **CEP pelo ViaCEP**:
  - chamado direto do navegador (`services/cepService.ts`, fora do `httpClient` da API);
  - ao completar 8 dígitos, preenche logradouro, bairro, município e UF;
  - CEP inexistente ou falha de rede mostra um aviso discreto e mantém a digitação manual.

## 6. Fora do escopo e pendências

- Fora:
  - dados fiscais além da IE (regime tributário etc., com o subsistema fiscal);
  - logo;
  - endereço e representante como entidades reutilizáveis;
  - Matriz/Filial;
  - onboarding de empresa pela tela (hoje ela vem do bootstrap);
  - assinatura/cobrança (tende a ser ligada à Empresa, não ao usuário).
- Pendências:
  - sem histórico de alterações dos dados da empresa;
  - dependência do ViaCEP (com fallback manual).
