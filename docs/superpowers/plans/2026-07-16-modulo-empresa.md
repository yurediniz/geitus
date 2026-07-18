# Plano de Implementação — Módulo Empresa (representante legal + empresa)

> **Execução:** pelo **fluxo do CTO** (dispatch de `back-end-executor` e `front-end-executor` + revisores). Cada tarefa termina em entregável testável + portão de revisão.

**Spec canônica:** [`docs/modules/empresa.md`](../../modules/empresa.md). **Design:** [`docs/superpowers/specs/2026-07-16-modulo-empresa-design.md`](../specs/2026-07-16-modulo-empresa-design.md).

**Goal:** cadastro da empresa (representante legal + dados da empresa, fluxo "Já possui CNPJ?", endereço com ViaCEP), editável por ADMIN, visível a qualquer autenticado.

**Architecture:** backend `company` — expande `Empresa` com `@Embeddable` `RepresentanteLegal` e `Endereco` + campos de PJ condicionais (migration V3), RBAC no `PATCH` (ADMIN), validação de CPF/CNPJ/telefone; frontend — `EmpresaPage` vira formulário com seções (representante / empresa com pergunta CNPJ / endereço) com autofill de CEP.

**Tech Stack:** Java 21, Spring Boot 3.5, Flyway; React 19, TS, Vite, Tailwind v4, shadcn/ui, RHF + Zod, TanStack Query.

## Global Constraints
- **Isolamento por empresa (DEC-016):** empresa sempre do autenticado; nunca `empresaId` externo.
- **RBAC:** `PATCH /api/empresas/minha` exige **ADMIN**; `GET` a qualquer autenticado.
- **Obrigatórios:** representante (nome, CPF, telefone, e-mail), empresa (nome fantasia, telefone, e-mail), endereço (CEP, logradouro, número, bairro, município, UF). **Condicionais (JURIDICA):** CNPJ + razão social. **Opcionais:** complemento, inscrição estadual. Ausentes → 400.
- **`tipoPessoa`** via "Já possui CNPJ?" (não→FISICA, sim→JURIDICA); allow-list + CHECK. Coerência PJ/PF por CHECK (JURIDICA→cnpj+razão; FISICA→cnpj null).
- **Validação backend:** CPF (rep) e CNPJ (empresa) por dígitos; **CNPJ UNIQUE** (único-quando-presente) → duplicado **409**; telefones BR; UF na lista; CEP 8 dígitos; número aceita dígitos ou `"S/N"`.
- **CPF/CNPJ, telefones, CEP** armazenados **só dígitos**. CPF do representante **não** é único.
- **Migrations append-only:** V1/V2 intactos; nova é **V3**. Como a V3 tem colunas `NOT NULL`, **recriar o `geitus_db`** (descartável, DEC-020) e **atualizar o `DevAdminBootstrap`** para criar a empresa de dev **completa** (representante + empresa + endereço; ex.: JURIDICA com CNPJ de dev válido).
- **DTOs** (entidade nunca exposta); erros via `ApiError`. **Git:** `develop`; commits pt-BR.

---

## Backend

### Task B1 — Modelo: migration V3 + `@Embeddable` + entidade + bootstrap
**Files:**
- Create: `db/migration/V3__empresa_cadastro.sql` — `ALTER TABLE empresa ADD COLUMN ...` conforme a tabela da spec (representante_* NOT NULL; telefone/email NOT NULL; tipo_pessoa NOT NULL; cnpj NULL; razao_social NULL; inscricao_estadual NULL; endereco_* com complemento NULL, resto NOT NULL); `CONSTRAINT uq_empresa_cnpj UNIQUE (cnpj)`; `CHECK (tipo_pessoa IN ('FISICA','JURIDICA'))`; `CHECK ((tipo_pessoa='JURIDICA' AND cnpj IS NOT NULL AND razao_social IS NOT NULL) OR (tipo_pessoa='FISICA' AND cnpj IS NULL))`.
- Create: `company/RepresentanteLegal.java` (`@Embeddable`: nome, cpf, telefone, email → `@Column(name="representante_*")`).
- Create: `company/Endereco.java` (`@Embeddable`: cep, logradouro, numero, complemento, bairro, municipio, uf → `endereco_*`).
- Create: `company/TipoPessoa.java` (enum FISICA, JURIDICA + `fromString`).
- Modify: `company/Empresa.java` — `@Embedded RepresentanteLegal`, campos telefone/email/tipoPessoa/cnpj/razaoSocial/inscricaoEstadual, `@Embedded Endereco`; getters/setters.
- Modify: `iam/DevAdminBootstrap.java` — criar a empresa de dev completa (representante + empresa + endereço; CNPJ de dev válido); novas variáveis/defaults de dev.
- Test: `TipoPessoa`/embeddables unit + carga da entidade.

**Deliverable:** schema + entidade + bootstrap alinhados (`ddl-auto: validate`). **Portão:** `data-reviewer` (migration) + `security-reviewer` (toca bootstrap/auth). Recriar `geitus_db` no smoke.

### Task B2 — Validação (CPF/CNPJ/telefone/UF, coerência PJ) + DTOs
**Files:**
- Create: validadores de **CPF** e **CNPJ** (dígitos verificadores) e telefone BR; validação de coerência PJ/PF (JURIDICA exige cnpj+razão; FISICA sem cnpj) — Bean Validation (anotação de classe no request) + no service.
- Create: `company/dto/EmpresaResponse.java` (expandido: `representanteLegal`, dados, `endereco`), `EmpresaAtualizarRequest.java`, `RepresentanteLegalRequest.java`, `EnderecoRequest.java`. Bean Validation dos obrigatórios; número aceita dígitos ou `"S/N"`.
- Test: unit dos validadores (CPF/CNPJ válidos/inválidos; coerência PJ/PF; telefone) e mapeamento de DTO (sem entidade).

**Deliverable:** validação e contratos. **Portão:** `back-end-reviewer`.

### Task B3 — RBAC no PATCH + `EmpresaService`/`EmpresaController`
**Files:**
- Modify: `config/SecurityConfig.java` — `requestMatchers(HttpMethod.PATCH, "/api/empresas/minha").hasRole("ADMIN")` (GET segue autenticado).
- Modify: `company/EmpresaService.java` — atualizar representante/empresa/endereço/PJ, preservando isolamento; normalizar CPF/CNPJ/telefone/CEP para dígitos; mapear conflito de CNPJ (unique) → 409.
- Modify: `company/EmpresaController.java` — `GET` response expandido; `PATCH` com `@Valid EmpresaAtualizarRequest`.
- Test: `EmpresaServiceTest` (atualiza, coerência PJ/PF, isolamento, CNPJ duplicado 409) + `EmpresaControllerTest` (`@WebMvcTest`: GET 200; PATCH ADMIN 200; **PATCH OPERADOR 403**; 400 validações; 401 sem token).

**Deliverable:** API `/api/empresas/minha` cadastral com RBAC. **Portão:** `back-end-reviewer` + **`security-reviewer`** + `qa-reviewer`. Smoke real (ADMIN edita PF e PJ; OPERADOR 403; CNPJ duplicado 409; V3 + bootstrap).

---

## Frontend

### Task F1 — `cepService` (ViaCEP) + serviço/tipos de empresa
**Files:**
- Create: `services/cepService.ts` — `buscarCep(cep)` (fetch direto ao ViaCEP; trata `{erro:true}`/rede → `null`, sem lançar). **Não** usa `httpClient`.
- Modify/Create: `services/empresaService.ts` (GET/PATCH `/empresas/minha` expandido) + tipos (`Empresa`, `RepresentanteLegal`, `Endereco`, `TipoPessoa`, requests).
- Test: `cepService` (sucesso/erro/rede) + serviço.

**Deliverable:** integração de dados. **Portão:** `front-end-reviewer`.

### Task F2 — `EmpresaPage` (formulário: representante + empresa[CNPJ?] + endereço)
**Files:**
- Modify: `features/empresa/EmpresaPage.tsx` — seções **Representante legal** / **Empresa** com a pergunta **"Já possui CNPJ?"** (revela CNPJ/razão social/IE quando "sim") / **Endereço** (autofill CEP + checkbox **"sem número"** → `"S/N"`). RHF + Zod (obrigatórios; CPF; CNPJ e razão quando PJ; telefones; UF/CEP). **OPERADOR em modo leitura** (campos desabilitados, sem salvar). Estados loading/erro/vazio/sucesso; erros amigáveis (403, 400, 409 CNPJ duplicado).
- Test: form ADMIN (PF e PJ) salva; alternância CNPJ sim/não revela campos; OPERADOR leitura; validações (CPF, CNPJ quando PJ); autofill CEP (mock, incl. fallback) + "sem número"; estados.

**Deliverable:** tela de Empresa cadastral completa. **Portão:** `front-end-reviewer` + `product-ux-reviewer`.

---

## Ordem e paralelismo
- Backend B1 → B2 → B3. Frontend F1 → F2 (depende do contrato do backend).
- Revisores por portão; **`data-reviewer`** (V3) e **`security-reviewer`** (PATCH RBAC + bootstrap) obrigatórios.

## Documentação
- Ao final: `docs/modules/README.md` (ponteiros para `empresa.md` e o pendente `usuarios.md`).
