# Design — Módulo Empresa (dados cadastrais)

**Data:** 2026-07-16
**Status:** Aprovado — pronto para plano de implementação
**Spec canônica:** [`docs/modules/empresa.md`](../../modules/empresa.md)

Registro de design (brainstorming). A especificação completa e durável vive em `docs/modules/empresa.md` (convenção do projeto) — para não duplicar (DEC-022).

## Problema
O módulo Empresa hoje só exibe/edita o `nome`. Um pequeno negócio precisa do cadastro da empresa (razão social, documento, contato, endereço).

## Decisões (aprovadas)
- **Escopo:** cadastro básico + **endereço** (com autofill ViaCEP). Sem fiscal, sem logo, sem endereço como entidade reutilizável, sem unicidade de CNPJ.
- **RBAC:** `GET` a qualquer autenticado; **`PATCH` exige ADMIN** (reaproveita `ROLE_ADMIN`). OPERADOR vê em leitura, backend bloqueia edição (403).
- **Modelo:** migration **V3** adiciona colunas nullable à `empresa`; endereço como `@Embeddable` (colunas `endereco_*` na própria tabela). `nome` = nome fantasia/exibição, intacto.
- **Validação:** CPF/CNPJ por **dígitos verificadores**, coerente com `tipoPessoa` (FISICA/JURIDICA); allow-list de `tipoPessoa` + CHECK; UF/CEP validados. No backend.
- **ViaCEP:** chamada direta do frontend (público, CORS), isolada em `cepService.ts`, **não-bloqueante** (fallback manual).

## Fluxo do CTO
`back-end-executor` + `front-end-executor` → revisores: `back-end-reviewer`, **`security-reviewer`** (PATCH RBAC), **`data-reviewer`** (migration V3), `front-end-reviewer`, `product-ux-reviewer`, `qa-reviewer`.

## Fora do escopo
Fiscal (regime/IE/IM); logo/upload; endereço reutilizável; unicidade CNPJ; Matriz/Filial.
