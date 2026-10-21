# Produtos: Preços (Fase C da evolução de Produtos)

> **Status:** implementado em 2026-10-21 (migration V8 aplicada). Ajustes das revisões em §10. Terceira das 6 fases da DEC-030; decisões desta fase na **DEC-033**. Depende da Fase B ([produtos-identificacao-e-formulario.md](produtos-identificacao-e-formulario.md)). Registro de design: [`docs/superpowers/specs/2026-10-21-produtos-fase-c-design.md`](../superpowers/specs/2026-10-21-produtos-fase-c-design.md).

## 1. Visão geral

Completa os preços do produto:
- **preço promocional** com vigência por datas, aplicado automaticamente;
- **preço de atacado** a partir de uma quantidade mínima;
- **histórico** das alterações de custo e de preço de venda;
- **preço de venda calculado pela margem desejada**;
- aviso de **preço abaixo do custo**;
- **máscara de dinheiro pt-BR** que preenche da direita para a esquerda enquanto se digita.

O PDV ainda não existe. A escolha do preço da venda (normal, promocional ou atacado) entra como **regra de domínio testada**, pronta para o PDV consumir (DEC-030).

## 2. Escopo

**Inclui:** item §5 (Preços) do pedido de evolução e a aba **Histórico** do formulário (§9), só com preços.

**Não inclui:**

| Item | Fase |
|---|---|
| Movimentações de estoque na aba Histórico; bloqueio de exclusão por movimentação | D |
| Filtro "em promoção" e ordenação por preço/margem na listagem | E |
| Agendar várias promoções, mais de uma faixa de atacado, preço por cliente/canal, campanhas | futuro |
| Histórico de preço mínimo, promocional e atacado | futuro |
| Preço calculado pelo markup desejado | futuro |
| Endpoint de "preço vigente" para o PDV | PDV (etapa 11) |

Também fora: fiscal.

## 3. Modelo de dados — migration `V8__produtos_precos.sql`

Aditiva sobre a V7 (que **não** é editada). Preserva todos os dados: as colunas novas nascem vazias e o histórico começa vazio (sem preenchimento retroativo).

### 3.1 `produtos` (colunas novas)

| Coluna | Tipo | Regra |
|---|---|---|
| `preco_promocional` | `NUMERIC(12,2) NULL` | CHECK `> 0` |
| `promocao_inicio` | `DATE NULL` | Primeiro dia da promoção (inclusivo) |
| `promocao_fim` | `DATE NULL` | Último dia da promoção (inclusivo); CHECK `promocao_fim >= promocao_inicio` |
| `preco_atacado` | `NUMERIC(12,2) NULL` | CHECK `> 0` |
| `quantidade_minima_atacado` | `NUMERIC(12,3) NULL` | CHECK `> 1` |

**CHECKs de "tudo ou nada":**
- `ck_produto_promocao_completa`: os três campos da promoção são todos nulos ou todos preenchidos.
- `ck_produto_atacado_completo`: os dois campos do atacado são ambos nulos ou ambos preenchidos.

As comparações com o preço de venda e o preço mínimo ficam no service, como já acontece com `preco_minimo` (DEC-028).

### 3.2 `produto_historico_precos` (nova)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `BIGINT` identity | PK interna |
| `empresa_id` | `BIGINT NOT NULL` | Mesma empresa do produto |
| `produto_id` | `BIGINT NOT NULL` | FK composta `(empresa_id, produto_id) → produtos (empresa_id, id)` **ON DELETE CASCADE** (o histórico faz parte do cadastro; produto só é excluído se nunca vendeu nem movimentou) |
| `campo` | `VARCHAR(20) NOT NULL` | CHECK `IN ('CUSTO', 'PRECO_VENDA')` |
| `valor_anterior` | `NUMERIC(12,2) NULL` | `NULL` no cadastro ou quando o custo estava vazio |
| `valor_novo` | `NUMERIC(12,2) NULL` | `NULL` quando o custo é removido; CHECK `campo <> 'PRECO_VENDA' OR valor_novo IS NOT NULL` |
| `usuario_id` | `BIGINT NOT NULL` | FK composta `(empresa_id, usuario_id) → usuario (empresa_id, id)` |
| `alterado_em` | `TIMESTAMP NOT NULL DEFAULT now()` | Momento da gravação |

- **CHECK:** `valor_anterior IS DISTINCT FROM valor_novo`, porque toda linha registra uma mudança real.
- **Índice:** `(empresa_id, produto_id, alterado_em DESC, id DESC)`, que atende a consulta da aba Histórico.
- **Constraint nova em `usuario`:** `uq_usuario_empresa_id UNIQUE (empresa_id, id)`, alvo da FK composta. Usuários não são excluídos fisicamente; a FK usa o padrão (RESTRICT).
- **A tabela só recebe inserções:** a aplicação nunca altera nem apaga linhas. Elas só saem em cascata, com a exclusão do produto.

## 4. Regras de negócio

### 4.1 Preço de venda, custo e preço mínimo
- **Continuam como hoje:** preço de venda obrigatório e ≥ 0, custo e preço mínimo opcionais e ≥ 0, e preço mínimo ≤ preço de venda.
- **Preço de venda menor que o custo:** permitido, com **aviso visível** que não bloqueia o salvamento, na aba Geral (junto ao preço) e na aba Preços.

### 4.2 Preço pela margem desejada (só no frontend)
- **Cálculo:** na aba Preços, "Margem desejada (%)" e o botão **"Calcular preço"** aplicam `preço = custo ÷ (1 − margem ÷ 100)`, arredondado para centavos (meio para cima).
- **Condições:** custo informado e > 0, e margem entre 0 e 99,99. Fora disso, o botão fica desabilitado e uma dica explica o motivo.
- **Resultado:** o preço de venda calculado substitui o atual no formulário, que passa a contar como alterado. A confirmação "Preço de venda atualizado para R$ X" aparece discretamente.
- **A margem desejada não é gravada:** a margem exibida continua sendo a derivada do preço e do custo.

### 4.3 Preço promocional
- **Informar:** preço, início e fim juntos, ou nenhum deles. Remover a promoção limpa os três.
- **Validações no service (400 com `campos`):**
  - promoção incompleta;
  - fim antes do início;
  - preço promocional ≤ 0;
  - preço promocional ≥ preço de venda ("Preço promocional deve ser menor que o preço de venda.");
  - preço promocional < preço mínimo, quando este estiver informado ("Preço promocional não pode ser menor que o preço mínimo.").
- **Vigência:** de `promocao_inicio` a `promocao_fim`, inclusive, pela **data de hoje no fuso `America/Sao_Paulo`**, fixo no MVP. O backend lê a data de um `Clock` injetável, para os testes.
- **Situação calculada (não é coluna):**
  - `AGENDADA` se hoje < início;
  - `VIGENTE` se início ≤ hoje ≤ fim;
  - `ENCERRADA` se hoje > fim.
- **Promoção encerrada pode ser mantida:** salvar um produto com promoção encerrada é permitido; ela só deixa de valer. A tela oferece "Remover promoção".
- **Data no passado:** também é permitida. Não se valida "fim ≥ hoje", para não bloquear a edição de outros campos de um produto com promoção vencida.
- **Preço de venda reduzido para igual ou abaixo da promoção:** a mesma validação de "menor que o preço de venda" impede o salvamento, e o erro aparece no campo do preço promocional.

### 4.4 Preço de atacado
- **Informar:** preço e quantidade mínima juntos, ou nenhum dos dois.
- **Validações no service (400 com `campos`):**
  - preço de atacado ≤ 0, ≥ preço de venda ou < preço mínimo (mesmas mensagens da promoção, trocando o nome);
  - quantidade mínima ≤ 1 ("A quantidade mínima do atacado deve ser maior que 1.");
  - quantidade mínima com fração quando a unidade de venda **não** é fracionada ("A unidade {sigla} não aceita quantidade fracionada.");
  - quantidade com mais de 3 casas decimais.
- **Uma única faixa por produto**, por decisão do usuário.

### 4.5 Preço aplicado na venda (regra de domínio)

`PrecoDeVenda.resolver(Produto produto, BigDecimal quantidade, LocalDate data) → PrecoAplicado(BigDecimal precoUnitario, OrigemPreco origem)`

- `OrigemPreco`: `NORMAL`, `PROMOCIONAL` ou `ATACADO`.
- **Candidatos:**
  - o preço de venda, sempre;
  - o promocional, se a promoção estiver vigente na `data`;
  - o de atacado, se `quantidade ≥ quantidade_minima_atacado`.
- **Vence o menor preço**, por decisão do usuário. Em empate entre promocional e atacado, a origem é `PROMOCIONAL`.
- **Quantidade ≤ 0:** `IllegalArgumentException`. A regra não valida o fracionamento, que é papel do PDV.
- **Sem endpoint:** o PDV vai consumir a regra no backend. A listagem usa `emPromocao`.

### 4.6 Histórico de preços
- **No cadastro:** registra o preço de venda (`valor_anterior` nulo) e o custo, se informado.
- **Na edição:** registra uma linha por campo que **realmente mudou**. A comparação é numérica, então 10,00 e 10,0 contam como iguais. Custo removido gera `valor_novo` nulo.
- **Quem e quando:** o usuário autenticado e o momento da gravação, gravados na mesma transação do produto. Se o produto não for salvo, nada é registrado.
- **Inativar, reativar e mudanças só de códigos, promoção ou atacado** não geram histórico.
- **Exclusão:** o histórico não impede excluir o produto. `podeExcluir` continua igual e será estendido na Fase D (DT-028).

## 5. API (produtos)

| Endpoint | Perfil | Respostas |
|---|---|---|
| `POST /api/produtos`, `PATCH /api/produtos/{id}` | ADMIN | como hoje; 400 com `campos` para as regras novas |
| `GET /api/produtos/{id}/historico-precos?pagina=0&tamanho=20` | autenticado | 200 / 400 / 404 |

**Request (POST/PATCH), campos novos:**
```json
"promocao": { "preco": 8.90, "inicio": "2026-11-01", "fim": "2026-11-15" },
"atacado":  { "preco": 4.20, "quantidadeMinima": 12 }
```
- **`promocao` ou `atacado` nulo ou ausente = sem promoção ou sem atacado**, o mesmo comportamento dos demais campos opcionais (`custo`, `precoMinimo`). O formulário sempre envia o estado completo. A exceção da Fase B (`codigosBarras` ausente mantém os códigos) **não** se aplica aqui.
- **Erros por campo:**
  - `promocao.preco`, `promocao.inicio`, `promocao.fim`;
  - `atacado.preco`, `atacado.quantidadeMinima`.

**Response, campos novos:**
```json
"promocao": { "preco": 8.90, "inicio": "2026-11-01", "fim": "2026-11-15", "situacao": "AGENDADA" },
"emPromocao": false,
"atacado":  { "preco": 4.20, "quantidadeMinima": 12.000 }
```
- `promocao` e `atacado` vêm como `null` quando não existem.
- `emPromocao` = `promocao.situacao == VIGENTE`.

**Histórico (resposta):**
```json
{
  "itens": [
    { "campo": "PRECO_VENDA", "valorAnterior": 10.00, "valorNovo": 11.50,
      "usuarioNome": "Ana Souza", "alteradoEm": "2026-10-21T14:03:12" }
  ],
  "pagina": 0, "tamanho": 20, "totalItens": 1
}
```
- **Ordem:** do mais recente para o mais antigo (`alteradoEm DESC, id DESC`).
- **Paginação:** `tamanho` padrão 20, máximo 100. Fora dos limites, ou `pagina < 0` → 400.
- **Isolamento:** produto de outra empresa → 404, sem revelar que ele existe (DEC-016).
- **Leitura:** qualquer autenticado, como o próprio produto (o custo já é visível a OPERADOR em `GET /api/produtos/{id}`). Restringir o custo por perfil fica para quando houver decisão.

## 6. Frontend

### 6.1 Campo de dinheiro (`CampoMoeda`, em `components/ui/campo-moeda.tsx`)

Máscara que **preenche da direita para a esquerda enquanto se digita**, sem esperar sair do campo (decisão do usuário):

| Digitado | Exibido |
|---|---|
| `1` | `0,01` |
| `12` | `0,12` |
| `123` | `1,23` |
| `1234` | `12,34` |
| `123456` | `1.234,56` |

- **Prefixo "R$"** fixo, visual e fora do valor editável; `inputMode="numeric"`.
- **Digitação:**
  - cada dígito entra pela direita;
  - **Backspace** remove o último dígito;
  - outros caracteres são ignorados;
  - o cursor fica sempre no fim;
  - zeros à esquerda são descartados.
- **Campo vazio:** apagar todos os dígitos deixa o campo **vazio**, não "0,00". Campos opcionais ficam sem valor; o preço de venda mostra o erro de obrigatório.
- **Limite:** 12 dígitos (10 inteiros + 2 decimais), o mesmo do `NUMERIC(12,2)` e do `@Digits` do backend. Dígitos além disso são ignorados.
- **Colar:** o texto colado é interpretado como número, não como sequência de dígitos.
  - `12,5` → 12,50; `12.50` → 12,50; `1.234,56` → 1.234,56; `R$ 9,90` → 9,90.
  - Texto que não forma número é ignorado.
- **Valor no formulário:** continua sendo a string decimal com ponto (`"12.34"`) que o schema Zod e o mapeamento para a API já usam. O componente só converte para exibição.
- **Onde se aplica:** em todos os campos de dinheiro do produto (preço de venda, custo, preço mínimo, preço promocional e preço de atacado). O componente fica pronto para reuso no Caixa e no PDV.
- **Acessibilidade:** `label` associado e o valor anunciado como texto.

### 6.2 Aba Preços
1. **Custo e Preço mínimo**, com `CampoMoeda`.
2. **Margem e markup** derivados, como hoje, mais o **aviso de preço abaixo do custo**.
3. **"Calcular preço pela margem"**: campo "Margem desejada (%)" (aceita vírgula, até 2 casas) e o botão "Calcular preço" (§4.2).
4. **Promoção**: interruptor "Ativar preço promocional" que abre o preço promocional, o início e o fim.
   - O selo da situação aparece: "Vigente até 15/11", "Agendada para 01/11" ou "Encerrada em 15/10".
   - "Remover promoção" limpa os três campos.
   - O aviso de abaixo do custo também vale para o preço promocional.
5. **Atacado**: interruptor "Ativar preço de atacado" que abre o preço e "A partir de (quantidade)" com a sigla da unidade.
   - Mostra a ajuda "A partir de 12 UN, cada unidade sai por R$ 4,20".
   - O aviso de abaixo do custo também vale aqui.

Desligar um interruptor limpa os campos daquele bloco (o produto fica sem promoção ou sem atacado ao salvar).

### 6.3 Aba Histórico
- **Quando aparece:** só na edição (`/produtos/:id`), como última aba (Geral, Preços, Estoque, Códigos, Histórico). A Fase D acrescenta as movimentações.
- **Lista:** data e hora, usuário, campo ("Custo" ou "Preço de venda"), "R$ 10,00 → R$ 11,50" e a variação em % (vazia quando não é calculável).
- **Paginação:** "Carregar mais" quando `totalItens` > itens carregados. A consulta só roda quando a aba é aberta.
- **Estados:** carregando, erro com "Tentar de novo" e vazio ("Nenhuma alteração de preço registrada. As alterações de custo e preço de venda aparecem aqui.").
- **Atualização:** depois de salvar, o histórico do produto é invalidado no cache.

### 6.4 Listagem
- **Com promoção vigente (`emPromocao`):** a coluna de preço mostra o selo **"Promoção"**, o preço promocional em destaque e o preço normal riscado ao lado.
- **Sem promoção vigente:** fica como hoje.
- Filtro e ordenação ficam para a Fase E.

### 6.5 Erros e salto de aba
- **Erros do backend:** os novos campos (`promocao.*`, `atacado.*`) entram no mapeamento `campos → campo do formulário → aba` da Fase B. Um erro na promoção leva à aba Preços e abre o bloco.
- **Schema Zod:** espelha as validações de §4.3 e §4.4, para o usuário ver o erro antes de enviar. O backend continua sendo a fonte de verdade.

## 7. Regras de domínio reutilizáveis
- **Backend:**
  - `PrecoDeVenda.resolver(...)` e `SituacaoPromocao.de(inicio, fim, hoje)`;
  - um único `Clock` (`America/Sao_Paulo`) como bean, reutilizável por Caixa e PDV.
- **Frontend:**
  - `lib/moeda.ts`: `digitosParaValor`, `formatarMoedaDigitando` e `interpretarValorColado`;
  - `calcularPrecoPelaMargem(custo, margem)` em `produtoFormulario.ts`.

## 8. Critérios de aceite e testes

**Backend:**
- **Migração V8 (IT):**
  - produtos existentes mantidos, com as colunas novas nulas;
  - histórico vazio;
  - CHECKs de tudo-ou-nada rejeitam dados incompletos;
  - FK composta do usuário rejeita usuário de outra empresa.
- **`PrecoDeVenda` (unitário):**
  - sem promoção ou atacado → `NORMAL`;
  - promoção no 1º dia, no último dia, um dia antes e um dia depois;
  - quantidade exatamente no mínimo do atacado (aplica) e logo abaixo (não aplica);
  - promoção e atacado juntos → o menor vence, e o empate dá `PROMOCIONAL`;
  - quantidade ≤ 0 → exceção.
- **`SituacaoPromocao`:** `AGENDADA`, `VIGENTE` (início = fim = hoje) e `ENCERRADA`.
- **Validações (service):** cada regra de §4.3 e §4.4 com a chave `campos` correta, incluindo:
  - fração em unidade não fracionada → 400;
  - a mesma quantidade em unidade fracionada → OK.
- **Histórico (service e IT):**
  - cadastro com e sem custo;
  - edição que muda só o preço;
  - edição que muda só o custo;
  - custo removido;
  - edição sem mudança de preço ou custo (nenhuma linha);
  - `10.0` vs `10.00` (nenhuma linha);
  - usuário correto;
  - nenhuma linha quando o save falha.
- **Endpoint do histórico:**
  - ordem;
  - paginação e limites (400);
  - produto de outra empresa → 404;
  - UUID malformado → 400;
  - sem token → 401;
  - OPERADOR → 200.
- **Response:** `situacao` e `emPromocao` com `Clock` fixo.

**Frontend:**
- **`CampoMoeda`:**
  - sequência 1 → 0,01 … 1234 → 12,34 → 123456 → 1.234,56;
  - Backspace;
  - campo vazio;
  - limite de 12 dígitos;
  - colagem dos exemplos de §6.1;
  - letras ignoradas;
  - valor do formulário em `"12.34"`.
- **Margem → preço:**
  - custo 10 e margem 50 → 20,00;
  - custo 7 e margem 30 → 10,00 (10,0000…);
  - margem 100 desabilita o botão;
  - sem custo desabilita o botão.
- **Aviso de preço abaixo do custo:** aparece e não impede salvar.
- **Promoção e atacado:**
  - interruptores;
  - validação Zod;
  - selo da situação;
  - erro do backend em `promocao.preco` leva à aba Preços.
- **Aba Histórico:** estados, "Carregar mais" e ausência no modo novo.
- **Listagem:** selo "Promoção" com o preço riscado.

## 9. Pontos em aberto
- **Fuso fixo `America/Sao_Paulo`:** um fuso por empresa fica para quando houver cliente fora dele.
- **Custo visível a OPERADOR:** já era assim antes desta fase. A restrição por perfil será decidida com o PDV e os relatórios.

## 10. Ajustes incorporados na implementação (revisões)
- **Edição com trava:** a edição do produto lê a linha com `SELECT ... FOR UPDATE` (lock pessimista), para que edições simultâneas não quebrem a cadeia anterior → novo do histórico. O conflito otimista (`@Version`) continua na DT-029.
- **Paginação:** página cujo deslocamento passa de `Integer.MAX_VALUE` → 400 ("A página informada é grande demais.").
- **Aba Preços:**
  - "Remover promoção" aparece só com a promoção **encerrada**, ao lado do selo; nos outros casos basta o interruptor;
  - o preço de venda aparece sempre no bloco de margem;
  - Enter em "Margem desejada" calcula o preço, sem salvar;
  - ao ligar a promoção, o início vem com a data de hoje (São Paulo) e o foco vai para o preço promocional;
  - com promoção e atacado ligados, a tela explica que vale o menor preço;
  - rótulo do atacado: "Quantidade mínima (UN)", com a ajuda "A partir de 12 UN, o preço passa a ser R$ 4,20 por unidade.".
- **Aviso de custo:** mostra a diferença ("R$ 0,50 abaixo do custo (R$ 5,00). Vender por este preço dá prejuízo.") e vale para os preços de venda, promocional e de atacado.
- **Selo da promoção:** usa a data de São Paulo também no navegador, inclui o ano quando é outro e, encerrada, diz "O produto voltou ao preço normal.". Vigente usa o mesmo destaque do selo "Promoção" da listagem.
- **Histórico:** "(valor inicial)" no cadastro e "→ sem custo" quando o custo é removido; o estado vazio diz que as próximas mudanças aparecerão ali.
- **`CampoMoeda`:**
  - trata teclado físico, `beforeinput` (teclado virtual, arrastar e soltar, ditado, autopreenchimento) e colagem;
  - um bloco de texto inserido de uma vez é interpretado como número, igual a uma colagem;
  - Ctrl/Alt+Backspace limpa o campo.
- **Dívidas registradas:** DT-028 (exclusão apaga o histórico), DT-030 (fuso dos carimbos, antes do primeiro deploy) e DT-031 (endurecimentos menores, incluindo validar o `CampoMoeda` em Android e iOS).
