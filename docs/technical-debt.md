# Pendências técnicas — Geitus

Só itens **abertos**, curtos, agrupados por quando atacar. Item resolvido sai da lista (fica no Git). Os números DT continuam valendo; DT nova recebe o próximo número livre (DT-043). Em cada DT ficaram os itens que importam; os refinamentos menores (textos, rótulos, pequenos ajustes de tela e testes extras) estão só na versão longa, com origem e observações: `git show cb1e390:docs/technical-debt.md`.

Formato: **DT-0xx — título** · prioridade — o que falta, em 1–2 linhas.

---

## Antes do primeiro deploy

- **DT-011 — Força bruta no login** · média — `POST /api/auth/login` sem rate limiting nem lockout; há um canal teórico de timing (BCrypt só roda para usuário existente).
- **DT-013 — Token em cookie httpOnly + refresh token** · média — o JWT fica no `localStorage` (exposto a XSS) e não há refresh. A troca passa por `tokenStorage.ts` e exige revisar CSRF/CORS.
- **DT-016 — E-mail de usuário sensível a maiúsculas** · média — normalizar para minúsculas na escrita e criar índice único em `lower(email)` (migration própria; liga com a DEC-024).
- **DT-018 — Revogação de token na inativação** · média — usuário inativado (ou ADMIN rebaixado) mantém acesso até o token expirar nas rotas que não recarregam o usuário. Junto com a DT-013.
- **DT-021 — Erro 500 sem log** · média — `tratarGenerico` no `GlobalExceptionHandler` não registra a exceção (logar sem PII nem corpo). Falta também mapear o 415 (404 e 405 já têm handler).
- **DT-022 — `UserDetailsService` gerado pelo Spring Boot** · baixa — a subida grava "Using generated security password" no log. Excluir `UserDetailsServiceAutoConfiguration`.
- **DT-023 — CPF completo na listagem de clientes (LGPD)** · média — `GET /api/clientes` e a tela do balcão mostram o CPF inteiro a qualquer autenticado; mascarar na lista. Decisão de produto.
- **DT-026 — Teto da árvore de categorias** · média — profundidade e quantidade ilimitadas: uma corrente de N níveis custa O(N²) no `caminho` e afeta a JVM de todas as empresas. Propor teto (ex.: 10–20 níveis, ~2000 por empresa). Antes de haver cadastro público de empresas.
- **DT-030 — Fuso dos carimbos antigos** · média — as tabelas anteriores à V16 usam `TIMESTAMP` sem fuso com o relógio da JVM; num container em UTC a hora sai 3 h adiantada. O padrão das novas é `TIMESTAMPTZ` + `Clock` (Caixa/PDV). Falta também `updatable = false` em `Usuario.empresa`.
- **DT-038 — Segurança da operação** · média —
  - impedir que produção ative o perfil `dev` por engano (`server.address: 127.0.0.1` no `application-dev.yml` e aviso na subida);
  - Swagger exigindo também o perfil `dev`;
  - varredura de segredos no GitHub/CI;
  - quota de imagens por empresa e limite de requisições na rota pública das imagens;
  - logs do proxy com URLs assinadas não públicos;
  - URL da imagem absoluta quando `VITE_API_BASE_URL` apontar para outra origem (senão as imagens quebram no deploy).
- **DT-041 — PDV antes do deploy** · média —
  - servir sempre por HTTPS (o fallback do lock de aba tem corrida sem Web Locks);
  - limite de requisições no `/calculo` e na busca;
  - carrinho com o nome do cliente continua no navegador depois do logout.
- **Tamanho do corpo JSON** (DT-035) · baixa — sem limite definido; configurar no proxy reverso.

---

## Ao mexer no módulo

### Transversal (backend)
- **DT-017 — Curingas do LIKE em Usuários** · baixa — `%` e `_` agem como curinga na busca de usuários; usar o `shared/busca/PadraoLike` (Produtos e Clientes já usam).
- **DT-024 — Repositórios com `delete*`/`findById` sem empresa** · baixa — os repositórios estendem `JpaRepository`; declarar só os métodos usados ou proibir por ArchUnit.
- **DT-025 — `resolverEmpresaId` duplicado** · baixa — 8 services (catálogo, marcas, imagens, balança, clientes, fornecedores) ainda têm a cópia; migrar para o `ResolvedorDoUsuarioAutenticado` de `iam`. O ramo usuário inativo/inexistente do `ProdutoService` não tem teste (DT-014).
- **DT-027 — Detalhes do catálogo** · baixa —
  - nome de categoria/unidade aceita caracteres de controle e o separador ` › `;
  - contagens nativas sem `empresa_id` explícito;
  - a listagem de produtos lê produtos e árvore de categorias em comandos separados (corrida rara com exclusão de categoria);
  - `atualizadoEm` desatualizado na resposta do PATCH (padrão de todos os módulos);
  - exclusão concorrente de categoria cai no 409 genérico.
- **Concorrência otimista no produto** (DT-029/DT-036) · média — PATCH sem `@Version`/`If-Match`: um formulário aberto antes de uma compra e salvo depois reverte o custo como "Editado".
- **Configuração de teste diferente da real** (DT-038) · média — o `application.yml` de teste substitui o principal (OSIV ligado, propriedades ausentes), então os testes não refletem a configuração de produção.
- **Violação de constraint reconhecida de dois jeitos** (DT-032/DT-040) · baixa — o estoque procura o nome da constraint no texto da mensagem; o caixa (`ViolacaoDeConstraint`) depende do `getConstraintName()` do Hibernate. Unificar.

### Frontend (transversal)
- **DT-004 — Warnings de fast-refresh** · baixa — arquivos que exportam componente e não componente juntos (ex.: `buttonVariants` em `components/ui/button.tsx`) disparam `react/only-export-components` (`.oxlintrc.json`).

### Produtos e catálogo
- **DT-028 — Auditoria da exclusão de produto** · média — a exclusão física só deixa log INFO, e o histórico de preços sai em cascata. Gravar uma auditoria sem FK, com o retrato do último preço e custo.
- **DT-029 — Endurecimentos da identificação** · baixa —
  - formato dos códigos validado numa consulta `IN` única;
  - nome curto cortado por code point (emoji perto do 30º caractere);
  - código `OUTRO` sensível a maiúsculas;
  - UPC-A e EAN-13 do mesmo GTIN não colidem;
  - "Gerar automaticamente" sobrescreve SKU digitado sem aviso;
  - 404 de produto excluído em outra aba.
- **DT-031 / DT-035 — Organização do `ProdutoService`** · baixa — ~1100 linhas: extrair preços especiais, histórico e gravação com a corrida. Centralizar mensagens repetidas entre DTOs e service. Consulta por código em lote no `ValidadorDeCodigosDeBarras`.
- **DT-031 — Validações do service** · baixa — a escala dos preços especiais só é conferida pelo `@Digits` (não no service); a paginação é validada antes de resolver a empresa.
- **DT-031 — Campos de dinheiro e acessibilidade** · baixa —
  - campos `type="number"` como texto com `inputMode="decimal"`;
  - `aria-live` no aviso de preço abaixo do custo;
  - validar o `CampoMoeda` em Android e iOS.
- **DT-033 — Consistência da listagem** · baixa — contagem e ids em comandos separados sob READ COMMITTED (avaliar `REPEATABLE_READ`); `CHECK (starts_with(busca_normalizada, nome_normalizado))` contra escrita direta; equivalência SQL × Java da V10 só cobre as 53 letras da lista (usar `normalize(NFD)` se surgir outra escrita).
- **DT-033 — Listagem (tela)** · baixa — "Desfazer" ao inativar, abrir direto quando a leitura de código der um único resultado, texto da busca cortado em 375 px, categorias inativas no fim do filtro.
- **DT-034 — Número, código e balança** · baixa — bloquear a troca do código de produto já vendido; exportar para o MGV da Toledo; histórico da configuração da etiqueta; `numeracoes` exige toda criação pelo `Numerador`.
- **DT-035 — Embalagens** · baixa —
  - regra para remover ou inativar uma embalagem já vendida;
  - embalagem de compra sem código como opção de venda;
  - o atacado decidido pela quantidade total pode não bater com a dica de preço da embalagem sem preço próprio;
  - `embalagem_uuid` no histórico de preço;
  - sugestão "Montar 1 CX + 1 UN?".
- **DT-038 — Imagem** · baixa — 304 com `If-None-Match`; mensagem 400 do servidor na tela; teste em iPhone/Safari e Android; quadro vazio tocável no celular.

### Estoque
- **DT-032 — Estoque básico** · baixa —
  - movimentos manuais ainda podem ser alterados no banco (a V17 só protege os de venda);
  - desligar `fracionada` de uma unidade não trava os produtos: um ajuste fracionado simultâneo pode passar;
  - `EXISTS` em `algumProdutoDaUnidadeTemMovimentos`;
  - `tipo`/`motivo` inválidos dão 400 sem `campos`;
  - "1.500" em KG lido como 1,5.
- **DT-036 — Custo na entrada** · média — avisar quando o custo novo for muito diferente do último (ex.: "19x o último — é o da CX ou da UN?"); mostrar o total da compra no modal; seletor de embalagem no ajuste aberto pela lista. A CHECK do custo unitário usa conta multiplicativa, que pode falhar com valores extremos (custo ≥ R$ 10.000 por unidade em embalagem > 100.000).

### Fornecedores e marcas
- **DT-037** · baixa —
  - documento e contatos visíveis ao OPERADOR (mascarar quando houver perfis granulares);
  - a busca por documento (CPF/CNPJ) vai na URL e fica no histórico do navegador e nos logs de acesso;
  - árvore de marcas carregada duas vezes;
  - seletor de várias marcas;
  - criar fornecedor no seletor do produto;
  - busca de CEP sem apagar campos.

### Caixa
- **DT-040** · baixa —
  - **correção:** uma contagem repetida com justificativa, numa sessão `EM_CONFERENCIA` com o modo cego desligado, não fecha o caixa;
  - **banco:** gatilho conferindo o esperado pela soma; gatilho `BEFORE TRUNCATE` nas tabelas do caixa; CHECKs de datas e de `valor_esperado`; limite de 50 pontos sem trava;
  - **backend:** a trava da sessão vem antes da checagem do dono; a lista de pontos entrega ao OPERADOR o `sessaoId` de outras pessoas; leituras de nome de usuário sem filtro de empresa; `HistoricoDoCaixaIT` muda o fuso da JVM;
  - **UX:** data junto da hora em caixa aberto há mais de um dia; motivos frequentes na sangria; filtros no histórico;
  - **testes:** concorrência entre contagem e sangria e entre dois fechamentos.

### PDV
- **DT-041** · baixa —
  - **banco:** sem garantia de saldo no banco — a V17 removeu o `ck_estoque_saldo_nao_negativo` e a ligação `estoque_saldos` × último movimento ficou só na aplicação; contagem por forma órfã trava o fechamento; o gatilho deferido recalcula a venda a cada linha; histórico das configurações do PDV;
  - **backend:** `sales` usa repositórios de outros domínios direto (avaliar interfaces/Spring Modulith); `VendasService` grande; `mesmoPedido` não compara desconto nem embalagem; `ehCorpo` não confere a forma de pagamento guardada (o servidor recusa);
  - **tela:** filtro por ponto no F8; quantidade de produto por peso vinda da busca; aviso de troco desproporcional; atalhos F3/F6/F7/F10 no Chrome/Edge do Windows;
  - **testes:** promoção vencendo entre o cálculo e o finalizar; cancelamento com queda de rede; concorrência contagem × venda.
- **Oráculo da sangria no modo cego** (DT-039/DT-041) · baixa — tentativas de sangria recusadas permitem descobrir o esperado; limitar ou auditar.

---

## Monitorar (volume)

- **DT-009 / DT-033 — Busca de produtos** — índice de trigramas (`pg_trgm`) quando uma empresa passar de dezenas de milhares de produtos; remover `idx_produto_empresa` (redundante); `CREATE INDEX CONCURRENTLY` e `UPDATE` em lotes nas migrations com volume.
- **DT-020 — Paginação de Clientes** — `GET /api/clientes` devolve a base inteira; reutilizar `shared/paginacao` e o padrão `ConsultaDeProdutos`.
- **DT-038 — Imagens** — acompanhar `pg_total_relation_size('produto_imagens')`; avaliar armazenamento externo acima de 5 GB; backup com `pg_dump -Fc`.
- **Índices de Caixa, Estoque e PDV** (DT-036/DT-040/DT-041) — índices compostos e parciais listados na versão longa, quando o volume de movimentos crescer.
- **`Numerador` da venda** (DT-041) — serializa as finalizações da empresa; aceitável no MVP.
- **Vendas por vendedor e por caixa** (DEC-050) — os filtros `vendedorId` e `pontoId` da tela de Vendas não têm índice próprio (usam `ix_venda_concluida_em` pelo período); criar `(empresa_id, usuario_id, concluida_em DESC)` se ficarem lentos.
