# Design — Evolução do cadastro de produtos · Fase B (Identificação e formulário em abas)

**Data:** 2026-10-21
**Status:** Spec escrita — aguardando revisão do usuário antes do plano
**Spec canônica:** [`docs/modules/produtos-identificacao-e-formulario.md`](../../modules/produtos-identificacao-e-formulario.md) · Decisão: DEC-032

## Escopo da fase
Itens §3 (identificação), §7 (marca/fornecedor) e §9 (formulário em abas) do pedido de evolução (DEC-030), mais o retrofit do UUID do produto e a limpeza das colunas de texto antigas da Fase A.

## Decisões do usuário (2026-10-21)

| Tema | Escolha |
|---|---|
| Exclusão física de produto | **Agora**, com ponto de extensão `podeExcluir` para as Fases C/D |
| UUID público do produto | **Agora** (rotas `/api/produtos/{uuid}`) |
| SKU automático | **Sequencial simples** `P000001` por empresa |
| Formulário | **Página própria** com abas (`/produtos/novo`, `/produtos/:id`) |

## Decisões do CTO (revisáveis na spec)
- **Dígito verificador inválido em EAN-8/EAN-13/UPC-A bloqueia (400)**: com esses tamanhos e só dígitos, um dígito errado é quase sempre erro de leitura ou digitação. Os demais formatos são aceitos com aviso, como pedido.
- **Códigos de barras em tabela própria** com unicidade por empresa (migrando o código único atual); sem código "principal" explícito — o primeiro da lista é o exibido.
- **Sugestão de SKU sem reserva** (calculada pelo maior `P######` da empresa); a unicidade no salvar resolve corridas com 409 — sem tabela de sequência.
- **Nome curto efetivo** = nome curto ou os 30 primeiros caracteres do nome, sem reticências (cupom tem pouco espaço).
- **Aba Histórico só nas Fases C/D** — não criar aba vazia.
- **"Salvar e cadastrar outro"** mantém unidade, categoria, marca e fornecedor para cadastro em sequência.
- **Busca por qualquer código e por nome curto entra já** (o PDV depende disso); sem acento e por marca ficam na Fase E. Escape de `%`/`_` aplicado aqui (fecha DT-017 para Produtos).
- **Divisão da `ProdutosPage`** em lista, página do produto, componentes por aba e módulo de formulário (pedido do front-end-reviewer na Fase A).
