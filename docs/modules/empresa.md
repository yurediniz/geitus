# Módulo: Empresa (cadastro: representante legal + empresa)

## Objetivo

Evoluir o módulo Empresa (hoje só exibe/edita o **nome**) para um **cadastro** com os dados do **representante legal** e da **empresa**, com fluxo progressivo (**"Já possui CNPJ?"**) para atender tanto negócios formais (PJ) quanto informais/autônomos (sem CNPJ). Editável por ADMIN; visível a qualquer usuário autenticado. A empresa continua sendo o **tenant** derivado do usuário autenticado (DEC-016).

## Escopo

### Representante legal (sempre obrigatório)
- **Nome completo**, **CPF** (validado por dígitos), **telefone**, **e-mail** — **todos NOT NULL**.
- O CPF do representante **não é único** (uma pessoa pode representar mais de uma empresa).
- *(Sem autofill a partir do ADMIN por ora — o Usuário/ADMIN não guarda CPF/telefone; e há a intenção futura de vincular a assinatura à Empresa, não ao usuário — ver Próximos passos.)*

### Empresa — fluxo "Já possui CNPJ? ( ) sim ( ) não"
A resposta define `tipoPessoa`: **não → `FISICA`** · **sim → `JURIDICA`**.

**Campos comuns (obrigatórios nos dois casos):**
- **Nome da empresa (nome fantasia)** — o `nome` atual.
- **Telefone** (contato/WhatsApp) e **e-mail**.
- **Endereço:** CEP, logradouro, número, bairro, município, UF — obrigatórios; **complemento** opcional. **Número** tem a opção **"sem número"** (grava `"S/N"`). Autofill via **ViaCEP**.

**Se "sim" (JURIDICA), acrescenta:**
- **CNPJ** — obrigatório, **único** (validado por dígitos).
- **Razão Social** — obrigatório.
- **Inscrição Estadual** — opcional.

**Se "não" (FISICA):** a empresa **não tem CNPJ** — a identidade fiscal informal é o **CPF do representante**.

### RBAC
- **Editar exige ADMIN**; qualquer autenticado **vê**.

## Fora do escopo

- **Dados fiscais** (regime tributário, além da IE) — subsistema `fiscal` futuro; incrementaremos o cadastro quando o fiscal chegar.
- **Logo / upload de marca.**
- **Endereço/Representante como entidades reutilizáveis** — aqui são `@Embeddable` na própria `empresa`; viram entidades quando o domínio exigir.
- **Vínculo formal Matriz/Filial** e multiempresa avançado — cada estabelecimento é uma Empresa independente (CNPJ próprio, único).
- **Fluxo de onboarding/registro de empresa** pela UI — hoje a empresa vem do bootstrap; onboarding é futuro.
- **Assinatura/cobrança** — futuro (com a intenção de vincular à Empresa).

## Decisões relacionadas

- **DEC-015** — PK interna `BIGINT` identity / `Long`.
- **DEC-016** — empresa derivada do usuário autenticado; acesso a outra empresa → 404.
- **DEC-020** — `geitus_db` de dev é descartável (permite recriar para colunas `NOT NULL`).
- **DEC-024** — relação Empresa/Usuário de longo prazo (norte). N:1 por ora; cada unidade = Empresa (matriz/filial têm CNPJ numericamente distintos, então a unicidade é compatível).

## Perfis e autorização (RBAC)

- `GET /api/empresas/minha` — **qualquer autenticado**.
- `PATCH /api/empresas/minha` — **exige `ADMIN`** (reaproveita `ROLE_ADMIN` do claim `perfil`; restrição por método+rota no `SecurityConfig`). OPERADOR → **403**.

## Modelo de dados — migration **V3**

Expande a tabela `empresa` (V1/V2 intactos). **Representante legal** e **endereço** como `@Embeddable`. Como há colunas `NOT NULL`, o **`geitus_db` é recriado** e o **`DevAdminBootstrap` cria a empresa de dev completa**.

| Coluna | Tipo | Nulo | Observações |
|---|---|---|---|
| `representante_nome` | `VARCHAR(180)` | NOT NULL | |
| `representante_cpf` | `VARCHAR(11)` | NOT NULL | só dígitos; validado; **não** único |
| `representante_telefone` | `VARCHAR(20)` | NOT NULL | só dígitos |
| `representante_email` | `VARCHAR(180)` | NOT NULL | |
| `nome` | `VARCHAR(150)` | NOT NULL | nome fantasia/exibição (já existe) |
| `telefone` | `VARCHAR(20)` | NOT NULL | contato/WhatsApp; só dígitos |
| `email` | `VARCHAR(180)` | NOT NULL | |
| `tipo_pessoa` | `VARCHAR(10)` | NOT NULL | `CHECK (tipo_pessoa IN ('FISICA','JURIDICA'))` |
| `cnpj` | `VARCHAR(14)` | NULL | **UNIQUE** (`uq_empresa_cnpj`, único-quando-presente); só dígitos |
| `razao_social` | `VARCHAR(180)` | NULL | obrigatório na aplicação quando JURIDICA |
| `inscricao_estadual` | `VARCHAR(20)` | NULL | opcional |
| `endereco_cep` | `VARCHAR(8)` | NOT NULL | só dígitos |
| `endereco_logradouro` | `VARCHAR(180)` | NOT NULL | |
| `endereco_numero` | `VARCHAR(20)` | NOT NULL | número **ou `"S/N"`** |
| `endereco_complemento` | `VARCHAR(120)` | NULL | opcional |
| `endereco_bairro` | `VARCHAR(120)` | NOT NULL | |
| `endereco_municipio` | `VARCHAR(120)` | NOT NULL | |
| `endereco_uf` | `VARCHAR(2)` | NOT NULL | |

**Constraints de integridade (CHECK):**
- `CHECK (tipo_pessoa IN ('FISICA','JURIDICA'))`.
- **Coerência PJ/PF:** `CHECK ((tipo_pessoa='JURIDICA' AND cnpj IS NOT NULL AND razao_social IS NOT NULL) OR (tipo_pessoa='FISICA' AND cnpj IS NULL))` — garante que jurídica tem CNPJ + razão social e que física não tem CNPJ.

`nome` segue sendo o nome fantasia/exibição (layout, `/auth/me`) — nada quebra.

## Endpoints

### `GET /api/empresas/minha` (autenticado)
Retorna a empresa do autenticado com representante legal, dados da empresa e endereço. Sem `empresaId` externo; isolamento por empresa.

### `PATCH /api/empresas/minha` (**ADMIN**)
Atualiza os campos editáveis (representante, empresa, endereço; e — se JURIDICA — cnpj/razão social/IE). Não altera `id`/`ativo`/timestamps nem empresa de outro usuário. OPERADOR → 403.

**DTOs:** `EmpresaResponse` (expandido, com `representanteLegal` e `endereco` aninhados; sem entidade); `EmpresaAtualizarRequest` (+ `RepresentanteLegalRequest`, `EnderecoRequest`).

## Validações

- **Sempre obrigatórios:** representante (nome, CPF, telefone, e-mail), empresa (nome fantasia, telefone, e-mail) e endereço (CEP, logradouro, número, bairro, município, UF). Ausentes → **400**. `complemento` e `inscricaoEstadual` opcionais.
- **Condicional (JURIDICA):** `cnpj` e `razaoSocial` obrigatórios quando "sim"; ausentes → **400**. Em `FISICA`, `cnpj` deve ser nulo.
- **CPF (representante):** só dígitos; dígitos verificadores válidos.
- **CNPJ (empresa):** só dígitos; dígitos verificadores válidos; **único** (já em outra empresa → **409**).
- **Telefones:** número BR válido (DDD + número), só dígitos.
- **`tipoPessoa`** ∈ {FISICA, JURIDICA} (allow-list + CHECK).
- **UF** ∈ lista de 27 estados; **CEP** 8 dígitos; **número** aceita dígitos ou `"S/N"`; **e-mails** formato válido.
- Validação **no backend** (não confiar só no frontend).

## ViaCEP (autofill de endereço)

- Chamada **direta do frontend** a `https://viacep.com.br/ws/{cep}/json/` (público, CORS; sem lib nova, sem endpoint no backend), isolada em `services/cepService.ts` (não usa o `httpClient` da nossa API).
- Ao completar 8 dígitos do CEP: preenche logradouro, bairro, município (localidade), UF; o usuário digita número/complemento (ou marca **"sem número"** → `"S/N"`).
- **Não-bloqueante:** CEP inexistente (`{ erro: true }`) ou falha de rede → aviso discreto + digitação manual mantida.

## Regras de segurança

- RBAC no backend (não confiar no frontend): PATCH exige ADMIN.
- Isolamento por empresa (DEC-016) em GET e PATCH.
- Entidades JPA não expostas — DTOs.
- Erros via `ApiError`, sem vazar detalhe interno.
- CPF/CNPJ são dados **cadastrais** (não credencial); mesmo assim, não logar desnecessariamente.

## Regras de UX

- Item "Empresa" na sidebar continua visível a todos; **ADMIN edita**, **OPERADOR** vê em **modo leitura** (campos desabilitados, sem salvar), por `usuario.perfil`.
- Formulário em seções: **Representante legal** / **Empresa** (com a pergunta **"Já possui CNPJ?"** que revela os campos de PJ) / **Endereço**.
- Máscara de CPF/CNPJ e telefones; **checkbox "sem número"**; autofill de CEP; estados loading/erro/vazio/sucesso e feedback claro.
- Interface limpa, tokens semânticos da marca; sem cara de ERP antigo.

## Critérios de aceite

**Backend:**
- `GET /api/empresas/minha` retorna representante + empresa + endereço do autenticado; sem token → 401.
- `PATCH` com token ADMIN atualiza; **OPERADOR → 403**.
- Obrigatórios ausentes → 400; CPF/CNPJ inválido (dígitos) → 400; telefone inválido → 400; UF inválida → 400; `tipoPessoa` fora da allow-list → 400.
- **JURIDICA sem CNPJ/razão social → 400; FISICA com CNPJ → 400** (coerência PJ/PF, também garantida por CHECK).
- **CNPJ duplicado** → **409**.
- Isolamento: nunca altera empresa de outro usuário; `/auth/me` segue funcionando.
- Migration V3 aplica com o `geitus_db` recriado; `DevAdminBootstrap` cria a empresa de dev completa; queries exercitadas em Postgres real (smoke).

**Frontend:**
- Página exibe todos os dados; ADMIN edita e salva com feedback; OPERADOR em leitura (sem salvar).
- Pergunta "Já possui CNPJ?" revela/oculta os campos de PJ; validação por campo (CPF, CNPJ quando PJ, telefones); autofill de CEP degrada para manual; checkbox "sem número"; estados tratados.

## Limitações conhecidas

- Sem histórico/auditoria de alteração dos dados da empresa (futuro).
- Sem dados fiscais completos, logo/upload, nem entidades reutilizáveis de endereço/representante.
- Dependência de terceiro (ViaCEP) no cliente, mitigada por fallback manual.
- Empresas informais (FISICA) não têm documento único próprio (identidade via CPF do representante, não único).

## Próximos passos futuros

- **Assinatura/cobrança vinculada à Empresa** (não ao usuário) — decisão tendencial; detalhar quando o billing entrar.
- Auditoria de alterações da empresa.
- Incrementar dados fiscais (regime tributário etc.) no subsistema `fiscal`.
- Onboarding/registro de empresa pela UI; endereço/representante como entidades reutilizáveis se necessário.
