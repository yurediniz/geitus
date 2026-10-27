# Registro de Decisões — Geitus

Decisões de arquitetura e de produto, com o porquê, em poucas linhas. O detalhe de cada regra está na spec do módulo (`docs/modules/`). A versão longa deste arquivo, com contexto, impacto e observações completos, está no Git: `git show cb1e390:docs/decision-log.md`.

**Nova decisão:** `## DEC-0xx — Título`, linha `Data · Status`, depois 2–5 linhas com **o que** foi decidido e **por quê** (e o link da spec, se houver). Decisão substituída vira uma linha.

> Até 2026-07-14 o projeto se chamava ERPell (produto) sob a marca UpeFlow; menções antigas referem-se ao Geitus.

---

## Substituídas

- **DEC-001** — UpeFlow como marca-mãe e ERPell como produto. Substituída pela DEC-018.
- **DEC-008** — Agentes especializados (executores e revisores). Substituída pela DEC-043.
- **DEC-009** — Revisores read-only, `qa`/`ci-cd` sem Bash. Substituída pela DEC-043.
- **DEC-013** — Claude Code como orquestrador de agentes. Substituída pela DEC-043.
- **DEC-014** — Protocolo de revisão antes/depois e classificação de sugestões. Substituída pela DEC-043.
- **DEC-017** — Claude Code como único orquestrador (Codex, `AGENTS.md` e `.codex/` removidos). Substituída pela DEC-043.
- **DEC-021** — Agente CTO como orquestrador único e harness engineering. Substituída pela DEC-043.
- **DEC-022** — Divisão `CLAUDE.md` (o quê) × `cto.md` (o como). Substituída pela DEC-043.

---

## Produto e escopo

## DEC-002 — MVP como PDV com ERP básico
2026-07-01 · Aceita
MVP focado em vendas, produtos, clientes, caixa, estoque básico, financeiro básico, dashboard e relatórios simples, para validar com usuários reais sem complexidade prematura. Fiscal, contábil, e-commerce, marketplace, CRM avançado, mobile e integrações ficam fora.

## DEC-003 — Nichos iniciais
2026-07-01 · Aceita
Validação em mercados, pet shops e lojas de roupas (empresários da família dispostos a testar). Base única, preparada para adaptações por segmento no futuro.

## DEC-010 — PDV desktop/offline como possibilidade futura
2026-07-01 · Aceita
Não faz parte do MVP, mas as regras de venda ficam isoladas para permitir um PDV local/offline depois (a `CalculadoraDaVenda` do PDV já segue isso, DEC-042).

## DEC-011 — Produtos antes de Serviços
2026-07-01 · Aceita
Só produtos físicos no início; serviços (ex.: banho e tosa) em módulo ou aba própria quando houver demanda validada.

## DEC-023 — Princípios Geitus de domínio e norte de longo prazo
2026-07-16 · Aceita
[`docs/visao-dominio-pdv.md`](visao-dominio-pdv.md) é o norte (não o escopo) por contexto. Princípios:
1. venda como agregado central;
2. produto contínuo (capacidades progressivas, só o necessário à ação);
3. movimentos imutáveis como fonte de verdade (saldo derivado, correção por estorno);
4. snapshot do item na venda;
5. idempotência e conclusão transacional;
6. comercial separado do fiscal;
7. concorrência de estoque controlada;
8. histórico imutável.

## DEC-030 — Evolução do cadastro de produtos em 6 fases
2026-10-20 · Aceita
A pedido do usuário, Produtos ganhou um cadastro completo **sem nada fiscal**, em fases: categorias e unidades (A), identificação (B), preços (C), estoque básico antecipado (D), listagem (E) e imagem (F); depois B2–B5. Exclusão física de produto só sem venda e sem movimentação (ou com só o estoque inicial do cadastro); SKU e códigos únicos por empresa. Fiscal, variações/grade, lote/validade e múltiplos estoques continuam fora. Spec: [`produtos.md`](modules/produtos.md).

## DEC-039 — Cadastros de Fornecedores e de Fabricantes/Marcas
2026-10-24 · Aceita
Amplia o MVP de Produtos:
- marcas em árvore livre, como categorias;
- fornecedores com só o nome obrigatório (documento único quando informado, representantes, marcas e produtos que vende);
- o produto tem vários fornecedores e um "da última compra", garantido por FK composta;
- a entrada por compra pode informar o fornecedor;
- marca e fornecedor deixam de ser texto livre.

Prepara Compras/NF-e sem implementá-las. Spec: [`fornecedores-e-marcas.md`](modules/fornecedores-e-marcas.md).

---

## Stack, processo e documentação

## DEC-004 — Stack backend
2026-07-01 · Aceita
Java 21, Spring Boot 3.5.x (mais estável que 4.x para o MVP), Maven Wrapper, PostgreSQL e Flyway; arquitetura por domínio e validação forte no backend.

## DEC-005 — Stack frontend
2026-07-01 · Aceita
React, TypeScript, Vite, Tailwind, shadcn/ui, React Router, React Hook Form, Zod, TanStack Query, Vitest e Testing Library; Node 24. Zustand só com necessidade real de estado global.

## DEC-006 — Desenvolvimento direto na branch develop
2026-07-01 · Aceita
Um fundador, fase inicial: trabalha-se na `develop`; `main` é a versão estável. Sem push/merge/PR para `main` sem decisão explícita. Branches por feature e PRs quando houver mais colaboradores.

## DEC-007 — Documentação operacional em Markdown
2026-07-01 · Aceita
Markdown versionado em `docs/` (leve, modular, bom para IA); nada de PDF no dia a dia.

## DEC-012 — OpenAPI/Swagger para a API
2026-07-01 · Aceita
springdoc-openapi documenta a API, só em desenvolvimento (desligado fora do perfil `dev`). Não substitui a spec do módulo.

## DEC-027 — Testcontainers para testes de repositório
2026-07-23 · Aceita
Queries de repositório (isolamento e unicidade por empresa, busca) são testadas contra Postgres real com Testcontainers, porque mocks não pegaram bugs de SQL (ex.: `lower(bytea)`). Exige Docker no ambiente de teste.

## DEC-043 — Fluxo de trabalho enxuto
2026-10-26 · Aceita
O processo tinha três camadas (`CLAUDE.md` de 28 KB, `cto.md`, Superpowers) e 10 agentes; as entregas ficaram lentas e ninguém olhava a tela. Agora:
- `CLAUDE.md` curto; visão e UX em `docs/produto.md`;
- a sessão principal planeja (plan mode, aprovado pelo usuário), implementa e responde pelo resultado; *fork* só quando o plano prevê;
- agentes: `revisor` (escopo × plano, correção, testes, segurança e dados) e `revisor-ux` (tela no navegador);
- Superpowers desligado no projeto; travas de Git por permissão (`.claude/settings.json`).

Na etapa 2 (2026-10-26) a documentação foi enxugada: specs no formato curto, este registro compactado e o `technical-debt` triado.

---

## Dados e banco

## DEC-015 — PK interna BIGINT identity
2026-07-02 · Aceita
`BIGINT GENERATED BY DEFAULT AS IDENTITY` (`Long` no Java): simples e performático. A aplicação **nunca** informa o `id`. Carga com id fixo exige ressincronizar a sequência.

## DEC-016 — Usuário vinculado à empresa desde o início
2026-07-02 · Aceita (refinada pela DEC-024)
Todo dado de negócio pertence a uma empresa, derivada do usuário autenticado e nunca de parâmetro; acesso a outra empresa responde 404. Evita refatoração estrutural quando o multi-tenant crescer.

## DEC-018 — Marca única Geitus e pacotes por domínio
2026-07-14 · Aceita
Nomes ERPell/UpeFlow removidos; pacote raiz `com.geitus.app`, organizado por domínio (`iam`, `company`, `catalog`, `customer`, `supplier`, `inventory`, `cashier`, `sales`…), cada domínio nascendo com o seu módulo. Banco `geitus_db`. Avaliar Spring Modulith quando os domínios crescerem.

## DEC-019 — UUID público além da PK interna
2026-07-14 · Aceita
Entidades expostas na API ganham um `UUID` público (único) e as rotas passam a usá-lo no lugar do id `BIGINT`. Entidades novas já nascem assim; **Usuários ainda expõe o id numérico** (retrofit pendente). Geração na aplicação com `DEFAULT gen_random_uuid()` de rede de segurança (fixado na DEC-029).

## DEC-020 — Migrations: baseline consolidado e append-only
2026-07-15 · Aceita
Enquanto pré-produção, V1–V3 foram consolidadas num `V1__baseline.sql` limpo (sem o legado ERPell). Regra desde então: migration aplicada **nunca** é editada; toda mudança é uma migration nova e aditiva. Edição só seria aceitável sem produção nem banco compartilhado, com decisão registrada.

## DEC-024 — Empresa × Usuário: identidade global e vínculo M:N (norte)
2026-07-16 · Aceita (ainda não implementada)
Cada loja/filial é uma Empresa isolada (sem Estabelecimento nem Matriz/Filial). O usuário será uma identidade global com vínculo M:N (`usuario_empresa`: perfil e status por empresa), com e-mail único global, seleção da Empresa ativa no login, token com a empresa ativa e o vínculo validado pelo backend em toda requisição. Hoje o modelo é N:1 (`usuario.empresa_id`). A migração precisa preservar dados (popular o vínculo antes de remover colunas) e tem revisão de segurança e de dados.

## DEC-026 — Conflito de unicidade = HTTP 409
2026-07-23 · Aceita
Toda duplicidade (SKU, código, CNPJ, CPF, e-mail…) responde 409. `DataIntegrityViolationException` também vira 409 no `GlobalExceptionHandler`, com mensagem genérica, o que cobre a corrida entre a checagem e o `save`.

---

## Módulos

## DEC-025 — RBAC de Produtos: escrita ADMIN, leitura livre
2026-07-23 · Aceita
Cadastrar, editar, inativar e excluir produto exige ADMIN; qualquer autenticado lê. O frontend mostra modo leitura ao OPERADOR (o backend é a autoridade). Protege preço e custo do operador de PDV.

## DEC-028 — Incremento cadastral do produto
2026-07-24 · Aceita
Campos opcionais: descrição, estoque máximo, ponto de reposição, preço mínimo (V4). Margem e markup são calculados na resposta, nunca gravados. Validações cruzadas no service: preço mínimo ≤ preço de venda; estoque máximo ≥ mínimo.

## DEC-029 — Clientes: escrita aberta, CPF único por empresa
2026-10-20 · Aceita
- Qualquer autenticado cadastra e edita (cadastro rápido no balcão); inativar/reativar é só ADMIN.
- Só pessoa física, CPF opcional e único por empresa.
- Um telefone com indicador de WhatsApp.
- Primeiro módulo com UUID público.
- Validadores de documento e telefone em `shared.validation`.

Spec: [`clientes.md`](modules/clientes.md).

## DEC-031 — Categorias em árvore e unidades de medida por empresa (Fase A)
2026-10-20 · Aceita
- Unidades por empresa (10 padrões semeados; fracionadas: KG, G, L, ML, M).
- Categorias com `parent_id` e profundidade livre: nome único entre irmãos, sem ciclos, inativação sem cascata, exclusão só sem filhos e sem produtos.
- Produto com unidade obrigatória e categoria opcional.

Spec: [`produtos.md`](modules/produtos.md).

## DEC-032 — Identificação do produto (Fase B)
2026-10-21 · Aceita
- Até 20 códigos de barras por produto, únicos por empresa; EAN-8/UPC-A/EAN-13 exigem dígito verificador, outros entram como `OUTRO`.
- Nome curto opcional e SKU sugerido `P` + 6 dígitos.
- UUID público do produto.
- Formulário em página própria.
- Exclusão física só sem venda e sem movimentação (ou com só o estoque inicial do cadastro), via `podeExcluir`.

## DEC-033 — Preços: promoção, atacado e histórico (Fase C)
2026-10-21 · Aceita
- Promoção por datas, inclusivas, no fuso `America/Sao_Paulo`.
- Uma faixa de atacado (quantidade mínima > 1); promoção e atacado abaixo do preço normal e não abaixo do mínimo.
- Preço na venda = o menor entre normal, promoção vigente e atacado atingido (empate → promoção).
- Histórico de custo e preço só por inserção.
- Máscara monetária da direita para a esquerda; preço pela margem calculado só no frontend.

## DEC-034 — Estoque básico antecipado: saldo por movimentos (Fase D)
2026-10-21 · Aceita
- Domínio `inventory`: movimentos imutáveis (sinal, saldo anterior e novo, motivo, origem, usuário, chave de idempotência) e `estoque_saldos`, na mesma transação com `FOR UPDATE`.
- Flag `controla_estoque`; ajuste manual só ADMIN e nunca negativo.
- Estoque inicial do cadastro é a primeira entrada.
- Produto movimentado não troca de unidade.

Spec: [`produtos-estoque.md`](modules/produtos-estoque.md).

## DEC-035 — Listagem de produtos paginada (Fase E)
2026-10-23 · Aceita
`GET /api/produtos` paginado (25, máx. 100), com busca sem acento por colunas normalizadas mantidas pela aplicação (sem `unaccent`), filtros de status, categoria (com descendentes), estoque e promoção, e ordenações. Consulta nativa em duas etapas, com fragmentos de SQL fixos por enum. Estado da tela na URL.

## DEC-036 — Número, código do produto e etiqueta de balança (Fase B2)
2026-10-23 · Aceita
- **Número sequencial por empresa:** imutável e fora da PK, gerado por `numeracoes` (produto, cliente, venda).
- **Código do produto:** 1–999999, opcional e único por empresa; obrigatório quando "vendido na balança".
- **SKU:** não participa da venda.
- **Etiqueta de balança configurável por empresa:** padrão `2` + código 6 + valor 6, com 3 casas e sem dígito verificador.
- **Tela única do produto** com atalhos de seção; margem e markup em todos os preços.

## DEC-037 — Embalagens de venda (Fase B3)
2026-10-24 · Aceita
- Um produto, estoque único na unidade de venda e até 10 embalagens.
- Cada embalagem tem quantidade > 1, preço próprio opcional, até 5 códigos e no máximo uma "de compra" (substitui unidade de compra + fator).
- Preço efetivo: o próprio (sem promoção); sem preço próprio, quantidade × preço vigente.
- O ajuste de estoque aceita embalagem, gravando em unidades.

Dois produtos sincronizados foram descartados (dividiriam saldo e relatórios).

## DEC-038 — Custo pela última entrada por compra (Fase B4)
2026-10-24 · Aceita
- A entrada com motivo Compra exige custo > 0 (em embalagem, o custo da embalagem; por unidade, 4 casas no movimento).
- O custo do produto passa a ser o último custo de entrada, sem custo médio; o produto guarda a origem do custo (`ENTRADA_COMPRA`/`EDICAO`).
- O histórico liga o custo ao movimento.

## DEC-040 — Imagem do produto no PostgreSQL com URLs assinadas (Fase F)
2026-10-24 · Aceita
- **Imagem:** uma por produto, comprimida no navegador (grande ≤ 1200 px/400 KB e miniatura ≤ 200 px/40 KB, WebP ou JPEG), em tabela própria.
- **Leitura:** por URL assinada HMAC (`GEITUS_IMAGEM_SEGREDO`), válida até o fim do dia UTC seguinte, sem JWT, para permitir `<img>` e cache.
- **Envio e remoção:** só ADMIN.
- **Futuro:** avaliar armazenamento externo acima de ~5 GB.

## DEC-041 — Caixa: pontos, sessões imutáveis e fechamento cego (etapa 10)
2026-10-24 · Aceita
- O caixa pertence a um ponto ("Caixa 1" nasce sozinho; ponto só é inativado), com uma sessão aberta por ponto e uma por usuário.
- Movimentos imutáveis (abertura, suprimento, sangria): o esperado é a soma e o fechamento é uma fotografia.
- Fechamento cego configurável (ligado por padrão): a contagem não muda, e com diferença a sessão fica em conferência até a justificativa. Caixa fechado não reabre.
- O OPERADOR opera o caixa que abriu; o ADMIN, qualquer um.
- `TIMESTAMPTZ`, trava pessimista e idempotência.

Spec: [`caixa.md`](modules/caixa.md).

## DEC-042 — PDV: carrinho no navegador e venda atômica no servidor (etapa 11)
2026-10-24 · Aceita
- **Carrinho no navegador:** a venda é gravada inteira, atômica e idempotente ao finalizar. O servidor recalcula tudo com a `CalculadoraDaVenda` e responde 409 se o total mudou.
- **Pagamento:** dividido em dinheiro, débito, crédito e PIX, com troco só do dinheiro. Até 5 vendas em espera.
- **Venda sem estoque:** configurável (ligada); o saldo só fica negativo por venda.
- **Desconto:** limite do OPERADOR (padrão 10%), preço mínimo para todos, percentual arredondado para baixo.
- **Cancelamento:** só com o caixa da venda aberto, com estorno no estoque e no caixa.
- **Caixa por forma de pagamento:** conferido por forma, com justificativa única.
- **Item da venda:** guarda o snapshot do produto. Produto vendido não é excluído.
- **Etiqueta da balança em produto UN:** precisa trazer o preço normal de 1 unidade.
- **Idempotência:** a chave fica com o carrinho e é conferida antes de exigir caixa aberto.

Spec: [`pdv.md`](modules/pdv.md).

## DEC-044 — PDV: busca ao vivo, catálogo e novo visual
2026-10-26 · Aceita
- **Busca:** o campo do topo também busca (a partir de 3 caracteres, 250 ms), sem janela separada.
- **Catálogo antes de digitar:** os mais vendidos dos últimos 30 dias, depois o resto por nome, com faixa de categorias principais (`GET /api/pdv/catalogo`).
- **Pagamento:** em tela inteira.
- **Visual:** cores da marca.
- **Comprovante não fiscal de 80 mm:** oferecido por botão ou F9 depois da venda e reimpresso em Vendas do caixa; impressão pelo navegador.
