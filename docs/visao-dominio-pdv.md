# Visão de Domínio — PDV Geitus (norte de longo prazo)

## 1. Propósito e como usar este documento

Este é o **norte conceitual de longo prazo** do Geitus, curado a partir da modelagem completa do PDV (~49 entidades, fluxos, capacidades e regras de consistência). Ele **não é o escopo do MVP** — o escopo atual continua definido no [`CLAUDE.md`](../CLAUDE.md).

Serve para que **cada módulo nasça alinhado** ao destino, implementando **apenas o que a sua etapa exige**. A diretriz-mãe da modelagem é:

> **Tornar obrigatório somente aquilo que é necessário para concluir uma venda comum.** A complexidade fica no sistema; o usuário vê só o necessário para a ação atual.

**Como consumir:** ao iniciar um módulo (Clientes, Caixa, PDV, Estoque, Financeiro), leia a seção do contexto correspondente aqui + a spec do módulo em `docs/modules/`. Não implemente entidades/campos "porque estão no norte" — só o que a etapa pede (capacidades progressivas).

### Reconciliação com o que já existe
- **Chave primária:** a modelagem usa `UUID`; o Geitus usa **`BIGINT` interno + `UUID` público** (DEC-015 e DEC-019). Onde a modelagem diz "id UUID", leia "PK BIGINT interna + UUID público de exposição".
- **Isolamento por empresa** (DEC-016, refinada pela DEC-024): o dado de negócio é isolado pela **Empresa ativa** selecionada pós-login e validada por vínculo; acesso a Empresa sem vínculo retorna 404. Cada unidade/filial é uma Empresa própria (sem `Estabelecimento`/Matriz-Filial).
- **Dinheiro** em `BigDecimal`; **quantidades** com precisão pela unidade.
- **Já implementado:** `empresa`, `usuario`, `produtos` (versões mínimas; o usuário hoje é vinculado a uma única empresa — evoluirá para o modelo de vínculo M:N, DEC-024). O resto é norte.

---

## 2. Princípios Geitus (o "como")

Estes princípios guiam a construção de todos os módulos. Formalizados na **DEC-023**.

1. **Venda como agregado central.** A Venda reúne itens, pagamentos, movimentos (estoque/financeiro/caixa), comissões, documento fiscal e auditoria, e controla seu próprio ciclo de vida e consistência.
2. **Produto como elemento contínuo.** Um produto não é "completo/incompleto"; possui **capacidades** calculadas (pode ser vendido, controlar estoque, vender por peso, emitir NFC-e, controlar lote/série, participar de comissão...). Cada capacidade tem requisitos próprios; exige-se só o que a capacidade em uso pede.
3. **Movimentos como fonte de verdade.** Saldos (estoque, caixa, financeiro) **não existem sem histórico** — são derivados de movimentos **imutáveis**. Correções ocorrem por novos movimentos (ajuste/estorno), nunca editando o passado.
4. **Snapshots na venda.** O item de venda **congela** os dados usados (descrição, unidade, preço, custo, tributação, GTIN, NCM...). Alteração futura no cadastro não muda uma venda concluída.
5. **Capacidades progressivas.** A experiência é progressiva: informações extras só são exigidas quando o gestor ativa a capacidade (estoque, fiscal, prazo, lote/série, comissão...).
6. **Idempotência.** A conclusão da venda e suas consequências (baixa de estoque, recebível, comissão, caixa, emissão fiscal, integrações) **não podem ser aplicadas duas vezes** — cada consequência tem chave de idempotência.
7. **Separação comercial × fiscal.** A Venda é o fato **comercial**; o DocumentoFiscal é sua documentação **tributária**. Estados relacionados, porém distintos — falha fiscal **não** apaga a venda. O fiscal é subsistema à parte (futuro `com.geitus.fiscal`).
8. **Conclusão transacional + eventos internos.** A conclusão comercial é atômica e consistente; integrações externas (fiscal, adquirente) usam estados, filas e reconciliação. Após concluir, publicar eventos internos (VendaConcluida, PagamentoConfirmado, EstoqueBaixado...) para reduzir acoplamento.
9. **Concorrência de estoque.** Vendas simultâneas não podem gerar saldo inconsistente — usar versão/bloqueio otimista, reserva e validação final na conclusão.
10. **Histórico imutável.** Vendas concluídas não se alteram diretamente — usa-se cancelamento, devolução, estorno ou ajuste (novo documento relacionado).

---

## 3. Contextos e entidades (MVP × futuro)

Mapa por **contexto de negócio**, alinhado à raiz `com.geitus.app`. Legenda de fase: **MVP** = já é ou entra no MVP atual · **Fase** = entra na etapa indicada · **Futuro** = pós-MVP, faseado.

### 3.1 Identidade e organização — `iam` / `company`

**Relação Empresa × Usuário (DEC-024):** o **Usuário é uma identidade global** (um e-mail/login) e pode ter acesso a **várias Empresas**. Cada **unidade/loja/filial é uma Empresa própria e isolada** — o Geitus **não** usa `Estabelecimento` nem a relação Matriz/Filial (que traria questões fiscais fora do escopo). Onde a modelagem original referencia `estabelecimento_id`, no Geitus leia **`empresa_id`**; `TerminalPDV` e `Caixa` penduram diretamente na Empresa quando o PDV entrar.

O acesso é concedido por um **Vínculo Usuário↔Empresa** (associação M:N) que carrega o **perfil e o status por empresa** — um usuário pode ser **ADMIN** (responsável, acima de todos) em uma Empresa e **operador** em outra. Após o login, o usuário **seleciona a Empresa ativa**: com um único vínculo, entra direto (a tela é adiantada); com vários, escolhe numa tela de seleção. A Empresa ativa passa a ser o tenant da sessão.

**Sessão e segurança (refina a DEC-016):** o token carrega a **Empresa ativa** (reemitido na seleção) e o perfil do usuário nela; o backend **valida o vínculo** em toda requisição e o isolamento é pela Empresa ativa — acesso a uma Empresa sem vínculo retorna **404**.

| Entidade | Papel | Fase |
|---|---|---|
| Empresa | Tenant isolado; **cada unidade/filial é uma Empresa** (sem Matriz/Filial) | **MVP** (existe) |
| Usuário | Identidade global (um login; acessa N Empresas) | **MVP** (existe — hoje N:1, evolui para M:N) |
| Vínculo Usuário↔Empresa | Associação M:N com **perfil + status por empresa** (ADMIN por empresa) | **Evolução do módulo Usuários** |
| TerminalPDV | Ponto de venda dentro da Empresa; define se exige caixa | **Fase PDV** |
| Perfil / Permissão | RBAC (vender, cancelar, desconto, abrir/fechar caixa...) — o perfil vive no vínculo | **Futuro** |
| Operador | Papel operacional do usuário na sessão (limites de desconto/cancelamento) | **Fase PDV** (papel, não tabela) |

> **Consequência:** um dono com 3 lojas terá 3 Empresas; um relatório consolidado das unidades exigirá agregação cross-empresa no futuro (não é escopo agora).
> **Estado atual:** cada usuário é vinculado a **uma única empresa (N:1)** — `usuario.empresa_id` é `NOT NULL` e **não** é único. Migrar para o modelo de vínculo (N:1 → M:N) é um refactor + migration, **agendado** para quando o módulo de Usuários amadurecer. O e-mail permanece **único global** (identidade), conforme a DEC-024 — não migrar para único-por-empresa.

### 3.2 Catálogo — `catalog`
| Entidade | Papel | Fase |
|---|---|---|
| Produto | Identidade comercial/operacional do vendável (mínimo: nome, unidade, preço, status) | **MVP** (existe, mínimo) |
| UnidadeMedida | UN/KG/LT/CX, casas decimais, fracionamento | **Fase A da DEC-030** (por empresa, com fracionamento) |
| Categoria | Organização hierárquica do produto | **Fase A da DEC-030** (árvore com `parent_id`) |
| Marca / Fabricante | Origem do produto | **Futuro** (marca segue como texto com autocomplete) |
| VariacaoProduto / AtributoProduto / ValorAtributo | Versões vendáveis (cor/tamanho...) — grade | **Futuro** (roupas) |
| CodigoBarrasProduto | Múltiplos GTIN/EAN por produto/variação | **Futuro** |

> O produto do MVP é físico e mínimo. Os campos avançados (fiscais, estoque, variação, múltiplos códigos) são do norte — entram por capacidade. Quando `CodigoBarrasProduto` (múltiplos GTIN) entrar, a unicidade de código de barras migra da coluna no produto para a tabela-filha.

### 3.3 Preços — `pricing` (futuro)
| Entidade | Papel | Fase |
|---|---|---|
| TabelaPreco | Agrupa regras de preço (canal, cliente, vigência) | **Futuro** |
| PrecoProduto | Preço válido em um contexto | **Futuro** |
| Promocao / RegraPromocao | Campanhas (desconto %/fixo, leve X pague Y, combo...) | **Futuro** |

### 3.4 Clientes — `customer`
| Entidade | Papel | Fase |
|---|---|---|
| Cliente | Pessoa física/jurídica; **opcional** na venda comum | **Fase 3** (próximo módulo) |
| Endereço | Objeto reutilizável (empresa/cliente/entrega) | **Futuro** (quando entrega/fiscal) |

### 3.5 Estoque — `inventory` (futuro)
| Entidade | Papel | Fase |
|---|---|---|
| MovimentoEstoque | **Fonte de verdade** do estoque (imutável, com origem e idempotência) | **Fase Estoque** |
| Estoque | Saldo consolidado por produto/local (derivado; com versão) | **Fase Estoque** |
| LocalEstoque | Depósito/loja/prateleira | **Fase Estoque** |
| Lote / NumeroSerie | Rastreabilidade por lote/série/validade | **Futuro** (capacidade) |

### 3.6 Caixa — `cashier`
| Entidade | Papel | Fase |
|---|---|---|
| Caixa | Sessão de caixa (abertura/fechamento, saldos esperado×informado) | **Fase Caixa** |
| MovimentoCaixa | Alteração monetária da sessão (abertura, recebimento, sangria, suprimento, estorno, fechamento) | **Fase Caixa** |

### 3.7 Vendas / PDV — `sales`
| Entidade | Papel | Fase |
|---|---|---|
| Venda | Agregado central; estados (rascunho→...→concluída/cancelada/devolvida) | **Fase PDV** |
| ItemVenda | Produto vendido, com **snapshots**; lote/série quando exigido | **Fase PDV** |
| FormaPagamento | Formas disponíveis (dinheiro, débito, crédito, PIX, crediário...) | **Fase PDV** |
| Pagamento / ParcelaPagamento | Parte do pagamento (parcial, troco, dados de adquirente, idempotency_key) | **Fase PDV** |

### 3.8 Financeiro — `finance` (futuro)
| Entidade | Papel | Fase |
|---|---|---|
| MovimentoFinanceiro | Registra acontecimentos financeiros (receita/despesa/estorno...) | **Fase Financeiro** |
| Recebivel / Recebimento | Venda a prazo e sua liquidação | **Futuro** (venda a prazo) |

### 3.9 Fiscal — `fiscal` (subsistema à parte, fora do MVP)
| Entidade | Papel | Fase |
|---|---|---|
| RegraFiscal | Regra tributária por operação (a operação determina a tributação) | **Futuro** |
| TributacaoItemVenda | Snapshot tributário do item | **Futuro** |
| DocumentoFiscal | NFC-e/documento (estados, XML, chave, contingência) | **Futuro** |
| ConfiguracaoFiscal | Credenciamento, CSC, certificado, numeração | **Futuro** |

### 3.10 Comissões — `commission` (futuro)
| Entidade | Papel | Fase |
|---|---|---|
| ComissaoRegra / Comissao | Regra de cálculo e comissão gerada por venda/item | **Futuro** |

### 3.11 Transversais
| Entidade | Papel | Fase |
|---|---|---|
| Auditoria | Rastreabilidade de ações críticas (antes/depois, origem) | **Progressivo** (por módulo) |
| IdempotenciaOperacao | Evita processar a mesma operação 2× (conclusão, pagamento, fiscal, estoque...) | **Fase PDV** |
| Autorizacao | Aprovações especiais (desconto acima do limite, cancelamento, venda sem estoque...) | **Fase PDV** |
| ConfiguracaoPDV | Comportamentos do PDV (exige caixa, permite preço manual/desconto...) | **Fase PDV** |
| DispositivoPDV | Equipamentos (impressora, balança, pinpad, TEF...) | **Futuro** |
| MensagemSistema | Mensagens contextuais/orientações da Geitus | **Futuro** |

---

## 4. Fluxo do PDV (resumo) e estados

Ciclo da venda: **abrir caixa (se exigido) → criar venda (rascunho) → adicionar itens (resolve unidade/preço/quantidade + capacidades) → identificar cliente (se necessário) → registrar pagamentos → concluir**.

Consequências **atômicas e idempotentes** da conclusão: itens congelados; movimentos de estoque, financeiro e caixa gerados; recebíveis e comissões quando aplicável; auditoria; evento de emissão fiscal quando a venda for fiscal.

Estados sugeridos da Venda: `rascunho → em_atendimento → aguardando_pagamento → parcialmente_paga → paga → concluída`; e `cancelada`, `devolvida_parcialmente/totalmente`, `suspensa`, `expirada`. Venda, Pagamento, Caixa e DocumentoFiscal devem ter **transições explícitas** (máquina de estados).

Outros movimentos: alteração de item, cancelamento (movimentos inversos), devolução (≠ cancelamento; entrada de estoque + crédito/estorno), sangria, suprimento, fechamento de caixa (esperado × informado).

---

## 5. Adoção faseada (norte → implementação)

- **Fase 1 (este documento):** norte curado + princípios (DEC-023). Nenhuma tabela/entidade/endpoint.
- **Fase 2:** retrofit do **UUID público** (DEC-019) em Empresa/Produto. O modelo de **Vínculo Usuário↔Empresa** M:N (DEC-024) entra como evolução do módulo de Usuários, agendável (não há `Estabelecimento`: cada unidade é uma Empresa).
- **Fase 3+ (ordem do MVP):** **Clientes → Caixa → PDV/Venda → Estoque básico → Financeiro básico → Dashboard → Relatórios.** Fiscal, comissões, variações, lote/série, preços/promoções e multiloja entram **depois**, por capacidade.

Cada módulo: implementar a menor parte funcional, alinhada a este norte, passando pelo fluxo do CTO (executor → revisores; `data-reviewer` obrigatório em banco/migrations).

---

## 6. Direções arquiteturais futuras

Registradas como norte (não implementar antes da hora):
- **Spring Modulith** a partir do módulo de Vendas (fronteiras explícitas + eventos internos).
- **Eventos internos** pós-conclusão (VendaConcluida, PagamentoConfirmado, EstoqueBaixado, RecebivelGerado, DocumentoFiscalSolicitado, ComissaoGerada).
- **Máquina de estados** para Venda/Pagamento/Caixa/DocumentoFiscal.
- **Motor de capacidades** (`verificar_capacidade(produto, "EMITIR_NFCE")` → disponível / requer configuração / bloqueada / requisitos ausentes...).
- **Motor de regras** versionadas para preço, desconto, promoção, tributação e comissão.
- **Modo offline controlado** para o PDV presencial (cache local, fila de sincronização, contingência fiscal, reconciliação) — coerente com a observação de PDV desktop/offline do `CLAUDE.md`, **sem alterar o escopo atual**.
- **Observabilidade** (tempo de conclusão, falhas de pagamento, rejeições fiscais, divergências de estoque, duplicidades evitadas).
- **Periféricos (impressora térmica, TEF/pinpad, gaveta) via agente local** — o navegador (SaaS web) é sandboxed e não dirige esses dispositivos de forma robusta. O caminho futuro é um **agente local** instalado na máquina, que a app web chama por `localhost` (ou terminal inteligente/API de adquirente para o TEF), mantendo a versão web. O **leitor de código de barras** já funciona nativo na web (emula teclado — *keyboard wedge*). Futuro, **fora do MVP**.
- **Comprovante de venda em PDF (comercial, não fiscal)** — enquanto não há agente/impressora térmica, o comprovante é gerado como **PDF** (imprime em qualquer impressora, salva/envia por e-mail/WhatsApp). Preferência por **gerar no backend** (reproduzível, arquivável, reemissível, pronto para envio), amarrado ao registro da venda; largada leve possível via tela HTML impressa/"salva como PDF" pelo SO. Este é o **comprovante NÃO fiscal**; o documento fiscal (NFC-e/DANFE) é o subsistema `fiscal` à parte (princípio "separação comercial × fiscal").

---

## 7. O que este documento NÃO é

- **Não é escopo do MVP** — o escopo vigente está no `CLAUDE.md` e prevalece.
- **Não autoriza implementação antecipada** — entidades/campos só entram quando a etapa e a capacidade os exigirem.
- **Não substitui as specs de módulo** (`docs/modules/`), que detalham cada módulo quando ele entra em desenvolvimento.
- **Fonte:** modelagem conceitual completa do PDV Geitus (documento externo), curada e adaptada às decisões do projeto (DEC-015/016/018/019/023/024).
