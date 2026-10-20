# Design — Módulo Clientes (etapa 9)

**Data:** 2026-10-20
**Status:** Design aprovado — spec aguardando revisão do usuário antes do plano de implementação
**Spec canônica:** [`docs/modules/clientes.md`](../../modules/clientes.md)

Registro de design (brainstorming). A especificação durável vive em `docs/modules/clientes.md` (convenção do projeto, DEC-022) — este documento registra apenas o problema, as perguntas feitas e as escolhas, sem duplicar a spec.

## Problema

A etapa 9 introduz o primeiro domínio novo desde Produtos (`customer`). O `CLAUDE.md` define os campos iniciais (nome, telefone, WhatsApp, CPF opcional, observações, status) e que o cliente é **opcional na venda**. Faltava decidir permissões, tratamento de documento e contato, e — por ser o primeiro módulo novo após a DEC-019 — como aplicar o **UUID público**.

## Decisões tomadas (perguntas ao usuário)

| Tema | Opções consideradas | Escolha |
|---|---|---|
| Permissões | operador cadastra / ADMIN inativa · todos podem tudo · só ADMIN escreve (como Produtos) | **Operador cadastra e edita; ADMIN inativa/reativa** |
| Documento | só PF, CPF único · PF e PJ · só PF, CPF sem unicidade | **Só PF; CPF opcional, validado, único por empresa (409)** |
| Contato | telefone + "é WhatsApp" · dois campos independentes · exigir ao menos um contato | **Telefone + "é WhatsApp" (padrão marcado); WhatsApp próprio só se diferente** |
| UUID público | gerado na aplicação · gerado pelo banco · adiar | **Gerado na aplicação + `DEFAULT gen_random_uuid()` de segurança; rotas por UUID** |
| Campos extras | só os da diretriz · + e-mail · + e-mail e nascimento | **Só os da diretriz** |

## Abordagem estrutural

Reúso dos validadores de CPF/telefone hoje em `company.validation`:

1. **Mover para `shared.validation`** — escolhida: elimina o acoplamento entre domínios e prepara o Spring Modulith; custo = ajuste de imports em Empresa, sem mudança de comportamento.
2. Importar de `company.validation` — rejeitada (acoplamento `customer → company`).
3. Duplicar no `customer` — rejeitada (duas cópias da regra de CPF).

## Pontos de design relevantes

- **WhatsApp derivado:** `telefone_e_whatsapp` + `whatsapp` só quando diferente; a resposta expõe o número resolvido. Evita gravar o mesmo dado duas vezes e o risco de ficar desatualizado ("cadastrar uma vez", CLAUDE.md).
- **RBAC diferente de Produtos (DEC-025):** proposital — cliente não tem dado sensível de gestão e o cadastro rápido no balcão é o caso de uso principal; a inativação (afeta o PDV) fica com o ADMIN.
- **Busca já escapa `%`/`_`**, sem herdar a DT-017.
- **Sem paginação**, consistente com Produtos; registrado como DT-020.

## Revisores previstos na implementação

`data-reviewer` (V5) e `security-reviewer` (RBAC + CPF como dado pessoal) obrigatórios; `back-end-reviewer`, `front-end-reviewer`, `product-ux-reviewer` (tela de cadastro rápido) e `qa-reviewer` conforme o `cto.md`.
