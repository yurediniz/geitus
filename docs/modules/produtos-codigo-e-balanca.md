# Produtos: Número, código do produto, etiqueta de balança e formulário em tela única (Fase B2)

> **Status:** **implementada** em 2026-10-23 (migration V11; ajustes da implementação no §11). Spec aprovada em conversa no mesmo dia. Fase intermediária da DEC-030, antes da Fase B3 ([produtos-embalagens.md](produtos-embalagens.md)) e da Fase F (imagem). Decisões na **DEC-036**.

## 1. Motivação
- **Produtos a granel:** a loja vende produtos a granel (KG) e itens por unidade (UN) pesados na balança **Toledo Prix 4**, que imprime uma **etiqueta com código de barras variável**. A etiqueta traz o **código do produto** programado na balança e o **valor total**, não o código de barras do fabricante.
- **Número de registro:** falta um número sequencial e imutável por empresa (como o número da venda), também para clientes.
- **Formulário:** com as seções que cresceram, as abas escondem informação e erros. A decisão é passar para uma tela única com atalhos.
- **Margem e markup:** precisam aparecer também nos preços de promoção e de atacado, e a calculadora precisa calcular também pelo markup.

## 2. Identificação do produto

| Campo | Obrigatório | Regra |
|---|---|---|
| **Número** (novo) | gerado | 1, 2, 3… **por empresa**, gerado na criação, **imutável**, nunca reaproveitado (um produto excluído deixa o número vago). **Não é a PK** (banco multiempresa; PK BIGINT e UUID continuam, DEC-019). |
| **Código do produto** (novo) | não; **sim com "Vendido na balança"** | Inteiro de 1 a 999999, **único por empresa**. Vem vazio no cadastro manual. Guardado como número (000542 = 0542 = 542) e exibido **sem zeros à esquerda**. Na digitação, os zeros à esquerda são aceitos e ignorados. |
| **Vendido na balança** (novo) | — | Booleano, padrão `false`. Vale para KG e UN. Marcado, exige o código do produto, e o código precisa caber no tamanho da etiqueta configurada (§3). |
| **SKU** | não | Como antes: alfanumérico, único por empresa, com o botão "Gerar automaticamente" (`P000001`). **Não é usado na venda.** |
| **Códigos de barras** | não | Como antes (Fase B): lista, com EAN-13/EAN-8/UPC-A validados. Cada código pertence a **um único produto** da empresa. |

- **Mensagens:**
  - código repetido → 409 "Este código já está em uso no produto {nome}." (campo `codigo`);
  - fora de 1..999999 → 400 "O código do produto deve ter de 1 a 6 dígitos.";
  - "Vendido na balança" sem código → 400 "Informe o código do produto para vendê-lo na balança.";
  - código maior que o tamanho da etiqueta → 400 "Este código tem mais dígitos do que a etiqueta da balança comporta ({n})."
- **Atalho na tela:** ao marcar "Vendido na balança" com o código vazio, a tela oferece "Usar o número do produto" (na edição, porque no cadastro o número ainda não existe; no cadastro novo, o atalho não aparece).
- **Troca do código:** é livre nesta fase. Quando o PDV existir, ficará bloqueada para produto já vendido (registrado para a spec do PDV).

### 2.1 Número também em Cliente
- **Clientes ganham `numero`,** com o mesmo mecanismo (1, 2, 3… por empresa, imutável).
- **Na tela de Clientes:** o número aparece no card ("Nº 12") e no topo do formulário de edição.
- **Venda:** usará o mesmo mecanismo no PDV.

### 2.2 Numeração (mecanismo)
- **Tabela:** `numeracoes (empresa_id, tipo, ultimo_numero)`, com PK `(empresa_id, tipo)` e `tipo` em ('PRODUTO','CLIENTE').
- **Próximo número:** sai de `UPDATE numeracoes SET ultimo_numero = ultimo_numero + 1 WHERE empresa_id = ? AND tipo = ? RETURNING ultimo_numero`, na **mesma transação** da criação. Se a linha não existe, é criada com `INSERT ... ON CONFLICT DO NOTHING` antes.
  - Com isso, dois cadastros simultâneos nunca pegam o mesmo número, e um cadastro que falha não consome número (o rollback desfaz o incremento).
- **Componente:** `shared/numeracao/Numerador` com `long proximo(Long empresaId, TipoNumeracao tipo)`.

## 3. Etiqueta de balança (configuração por empresa)

### 3.1 Modelo
Tabela `configuracoes_etiqueta_balanca`, **uma por empresa**:

| Campo | Padrão | Regra |
|---|---|---|
| `prefixo` | `2` | 1 ou 2 dígitos |
| `digitos_codigo` | 6 | de 4 a 6 |
| `digitos_preenchimento` | 0 | de 0 a 2 (zeros entre o código e a informação, usados em algumas configurações da Toledo) |
| `tipo_informacao` | `VALOR` | `VALOR` (R$ total) ou `PESO` (kg) |
| `digitos_informacao` | 6 | de 4 a 7 |
| `casas_decimais` | 3 | 2 ou 3 |
| `digito_verificador` | `false` | se há o dígito verificador EAN-13 no fim |

- **Regra de tamanho:** `len(prefixo) + digitos_codigo + digitos_preenchimento + digitos_informacao + (digito_verificador ? 1 : 0) = 13`. O padrão dá 1 + 6 + 0 + 6 + 0 = 13.
- **Empresas sem configuração:** usam o padrão. A linha só é gravada quando a configuração é salva.

### 3.2 Leitor (regra de domínio, para o PDV)
- **Assinatura:** `LeitorEtiquetaBalanca.ler(String codigoLido, ConfiguracaoEtiqueta config) → Optional<LeituraEtiqueta(int codigoProduto, TipoInformacao tipo, BigDecimal quantidadeOuValor)>`.
- **Quando a leitura acontece:** só com exatamente 13 dígitos, começando pelo prefixo, com os dígitos de preenchimento iguais a zero e código diferente de 000000. Com dígito verificador, o EAN-13 tem de ser válido.
- **Como cada campo é lido:** o código é lido sem zeros (000542 → 542). A informação é dividida por 10^casas (010000 com 3 casas → 10.000).
- **Exemplo real do usuário:** `2000542010000` → produto **542**, valor **R$ 10,00**.

### 3.3 Tela
- **Onde fica:** nova aba **"Balança"** em Produtos (ao lado de Categorias e Unidades), em `/produtos/balanca`. Leitura para todos; salvar só ADMIN.
- **Campos** de §3.1 e uma **prévia do formato**: "2 · CCCCCC · VVVVVV (R$, 3 casas) · sem dígito verificador".
- **Modelos prontos:**
  - "Toledo, código 6 + valor 6 (3 casas), sem DV" (o padrão);
  - "Toledo, código 4 + 0 + valor 6 (2 casas) + DV";
  - "Toledo, código 5 + 0 + valor 5 (2 casas) + DV" (um zero de preenchimento para somar 13);
  - "Peso, código 6 + peso 5 (3 casas) + DV".
- **Campo "Testar etiqueta":**
  - colar um número mostra "Produto 542 · Açúcar a granel · R$ 10,00", ou "Produto 542 não cadastrado", ou "Este número não é uma etiqueta neste formato.";
  - usa `POST /api/etiqueta-balanca/teste`, que lê com a configuração **da tela** (ainda não salva) e procura o produto pelo código.
- **Aviso ao salvar:** se algum produto "Vendido na balança" tiver código grande demais para o novo `digitos_codigo`, aparece o aviso "N produtos têm código com mais dígitos do que esta etiqueta comporta." com a lista. **Não bloqueia.**

### 3.4 Proteção dos códigos de barras
- **Aviso na lista de códigos de barras:** ao adicionar um código de barras que **parece uma etiqueta** da configuração atual (13 dígitos com o prefixo), aparece o aviso "Este código tem o formato da etiqueta de balança configurada." **Não bloqueia,** porque alguns fabricantes usam o prefixo 2.

## 4. Formulário do produto em tela única
Substitui as abas da Fase B (`produtos-identificacao-e-formulario.md` §6.2).
- **Barra de atalhos fixa no topo** (Geral · Códigos · Preços · Estoque · Histórico):
  - leva até a seção com rolagem suave;
  - destaca a seção visível (`IntersectionObserver`);
  - mostra a quantidade de erros em cada seção;
  - usa `aria-current` no atalho ativo.
- **Seções, nesta ordem:**
  1. **Geral:** **Nº do Produto** (só leitura, na edição; no cadastro aparece "Será gerado ao salvar"), nome, nome curto, unidade de venda, preço de venda, categoria, marca, fornecedor e descrição. **Sem o campo de código de barras.**
  2. **Códigos** (ordem decidida pelo usuário na implementação): primeiro a lista de códigos de barras com "Adicionar código" (Enter para o leitor e o aviso do §3.4), depois o código do produto com "Vendido na balança" (com o atalho do §2 e o link "Configurar etiqueta") e por último o SKU com "Gerar automaticamente".
  3. **Preços:** §5.
  4. **Estoque:** controle, saldo e "Ajustar estoque", níveis, estoque inicial (só no cadastro) e o bloco **"Unidade e embalagem"**, movido da Geral.
  5. **Histórico:** só na edição; a consulta só roda quando a seção se aproxima da tela.
- **Erros ao salvar:** a página rola até o primeiro campo com erro, na ordem das seções, e foca nele.
- **Foco depois de "Salvar e cadastrar outro":** vai para o campo **Nome** (antes, ia para o código de barras na Geral).
- **Mantidos:** o rodapé Salvar/Cancelar fixo, Ctrl+Enter, o aviso de alterações não salvas e o modo leitura do OPERADOR.
- **Celular:** os atalhos rolam para o lado e as seções ficam em uma coluna.

## 5. Preços: margem e markup
- **Em todos os preços:** margem e markup aparecem ao lado do **preço promocional** e do **preço de atacado**, além do preço de venda, calculados sobre o custo. Exemplo: promoção R$ 8,90 com custo R$ 6,00 → margem 32,58% e markup 48,33%. Sem custo, aparece "—".
- **Calculadora** com a escolha "Pela margem" ou "Pelo markup":
  - pela margem: preço = custo ÷ (1 − margem), com margem entre 0 e 99,99% (custo R$ 10,00, 30% → R$ 14,29);
  - pelo markup: preço = custo × (1 + markup), com markup de 0 a 9.999,99% (custo R$ 10,00, 30% → R$ 13,00);
  - arredondamento para centavos (meio para cima). O resultado acima do limite do campo tem a dica própria, como hoje.
- **Explicação** num texto de ajuda junto ao bloco, sempre visível em tela larga e recolhível no celular:
  - **Margem:** quanto do preço de venda é lucro, (preço − custo) ÷ preço. Vender a R$ 15,00 algo que custou R$ 10,00 dá 33,33%.
  - **Markup:** quanto se acrescenta sobre o custo, (preço − custo) ÷ custo. O mesmo exemplo dá 50%.

## 6. Listagem e busca
- **Busca:** um termo só com dígitos também encontra o produto por **Número** e por **código do produto** (sem zeros: "0542" → 542), além do texto e dos códigos de barras.
- **Tabela e cards:** abaixo do nome, a linha secundária mostra "Nº 15 · Cód. 542 · SKU" (as partes que existirem).

## 7. Banco — migration `V11__numero_codigo_balanca.sql`
Aditiva sobre a V10, que não é editada.
- **`produtos`:**
  - `numero BIGINT`, preenchido por `row_number() OVER (PARTITION BY empresa_id ORDER BY criado_em, id)`, depois `NOT NULL`, com `UNIQUE (empresa_id, numero)`;
  - `codigo INTEGER NULL`, com CHECK `codigo BETWEEN 1 AND 999999` e índice único parcial `(empresa_id, codigo) WHERE codigo IS NOT NULL`;
  - `vendido_balanca BOOLEAN NOT NULL DEFAULT false`, com CHECK `NOT vendido_balanca OR codigo IS NOT NULL`.
- **`clientes`:** `numero BIGINT`, preenchido da mesma forma, `NOT NULL` e `UNIQUE (empresa_id, numero)`.
- **`numeracoes`:**
  - `(empresa_id BIGINT NOT NULL REFERENCES empresa, tipo VARCHAR(20) NOT NULL CHECK IN ('PRODUTO','CLIENTE'), ultimo_numero BIGINT NOT NULL CHECK >= 0, PRIMARY KEY (empresa_id, tipo))`;
  - preenchida com o maior número de cada tipo por empresa.
- **`configuracoes_etiqueta_balanca`:**
  - `(id, empresa_id UNIQUE REFERENCES empresa, prefixo VARCHAR(2), digitos_codigo SMALLINT, digitos_preenchimento SMALLINT, tipo_informacao VARCHAR(10), digitos_informacao SMALLINT, casas_decimais SMALLINT, digito_verificador BOOLEAN, atualizado_em TIMESTAMP)`;
  - CHECKs dos intervalos de §3.1, `prefixo ~ '^[0-9]{1,2}$'` e a soma = 13.
- **Número imutável:** a coluna é mapeada com `updatable = false`, em `Produto` e em `Cliente`.

## 8. API
- **Produto:**
  - **Request:** ganha `codigo` (inteiro, opcional) e `vendidoBalanca` (boolean, padrão `false`). O `numero` **nunca** é aceito no request.
  - **Response:** ganha `numero`, `codigo` e `vendidoBalanca`.
- **Cliente:** a response ganha `numero`.
- **Etiqueta de balança:**

| Endpoint | Perfil | Resposta |
|---|---|---|
| `GET /api/etiqueta-balanca` | autenticado | a configuração (ou o padrão), com `padrao: true/false` |
| `PUT /api/etiqueta-balanca` | ADMIN | 200 com `{ configuracao, produtosComCodigoGrandeDemais: [{id, numero, nome, codigo}] }`; 400 nas regras de §3.1 |
| `POST /api/etiqueta-balanca/teste` | autenticado | `{ codigoLido, configuracao }` → `{ leitura: {codigoProduto, tipo, valor} \| null, produto: {id, numero, nome, unidade} \| null, mensagem }` |

- **Busca na listagem:** como em §6. O parâmetro `busca` continua o mesmo.

## 9. Testes (critérios de aceite)
- **Backend:**
  - **V11 (IT):** produtos e clientes existentes recebem números 1..N por empresa, por ordem de cadastro; `numeracoes` com o máximo; `codigo` nulo; os CHECKs (balança sem código, código fora do intervalo, soma ≠ 13); unicidade parcial do código; isolamento por empresa.
  - **Numerador (IT):**
    - sequência 1, 2, 3;
    - 20 criações em paralelo → números distintos e consecutivos;
    - falha na gravação não consome o número;
    - empresas independentes.
  - **Produto e Cliente:** o número é gerado na criação e não muda na edição (o `numero` no JSON é ignorado ou rejeitado).
  - **Código do produto:**
    - "000542" vira 542;
    - repetido → 409 com o campo;
    - 0 ou 1000000 → 400;
    - balança sem código → 400;
    - código grande demais para a etiqueta → 400.
  - **`LeitorEtiquetaBalanca`:**
    - `2000542010000` → 542 e R$ 10,00;
    - cada modelo pronto com um exemplo;
    - 12 ou 14 dígitos → vazio;
    - prefixo diferente → vazio;
    - dígito verificador inválido → vazio;
    - peso com 3 casas.
  - **Configuração:**
    - GET sem configuração → padrão;
    - PUT válido;
    - PUT com soma ≠ 13 → 400;
    - OPERADOR no PUT → 403;
    - aviso de produtos com código grande demais;
    - o teste com produto encontrado, com produto não cadastrado e com número fora do formato.
  - **Busca:** "542", "0542" e "000542" encontram por código; "15" encontra o produto nº 15.
- **Frontend:**
  - **Tela única:**
    - as seções estão na ordem;
    - o clique no atalho rola e foca o título da seção;
    - o atalho ativo acompanha a rolagem (com `IntersectionObserver` simulado);
    - erro numa seção mais abaixo rola até o campo e mostra a contagem no atalho;
    - o Histórico só carrega quando a seção fica visível;
    - "Salvar e cadastrar outro" foca o Nome.
  - **Geral:** mostra o Nº na edição e "Será gerado ao salvar" no cadastro; não tem mais o campo de código de barras.
  - **Códigos:**
    - código com zeros é enviado como número;
    - balança sem código → erro;
    - o atalho "Usar o número do produto";
    - aviso de código de barras com formato de etiqueta.
  - **Preços:**
    - margem e markup na promoção e no atacado;
    - calculadora pela margem (10 e 30% → 14,29) e pelo markup (10 e 30% → 13,00);
    - a explicação aparece.
  - **Estoque:** o bloco "Unidade e embalagem" está nessa seção.
  - **Balança:**
    - os campos e a prévia;
    - os modelos prontos;
    - a soma ≠ 13 bloqueia salvar, com a mensagem;
    - o teste de etiqueta;
    - o aviso de produtos com código grande demais;
    - OPERADOR só lê.
  - **Lista:** a linha secundária com Nº e código.
  - **Clientes:** o Nº no card e no formulário.

## 10. Fora desta fase
- **Embalagens de venda:** Fase B3 ([produtos-embalagens.md](produtos-embalagens.md)).
- **Códigos do fornecedor e histórico de compras completo:** ficam para a especificação da entrada de mercadoria (Compras).
- **Exportar os produtos para o software da balança (MGV da Toledo).**
- **Requisitos do PDV, registrados para a etapa 11:**
  - digitação `código*quantidade` (`542*3`, `542*0,750` em KG; sem `*`, quantidade 1; zeros à esquerda aceitos), que procura **só pelo código do produto**;
  - leitura da etiqueta pelo leitor de §3.2, com quantidade calculada pelo valor (KG: valor ÷ preço/kg; UN: valor ÷ preço unitário, ou 1 unidade pelo valor da etiqueta se não for múltiplo);
  - leitura de qualquer código de barras da lista;
  - o SKU não entra na venda;
  - número da venda pelo `Numerador`;
  - bloquear a troca do código de produto já vendido.

## 11. Ajustes na implementação
- **Seção Códigos:** os códigos de barras vêm primeiro, depois o código do produto e a balança, e por último o SKU (decisão do usuário).
- **Etiqueta:**
  - os dígitos de preenchimento precisam ser zeros e o código 000000 não é lido (no backend e no frontend);
  - o modelo "Toledo · código 5, valor 5" usa um zero de preenchimento para somar 13 dígitos;
  - o código e os dígitos da configuração recusam número com casas decimais (`542.9` → 400); `"000542"` é aceito;
  - a configuração é registrada em log (INFO) ao ser salva.
- **Código repetido na corrida:** dois cadastros simultâneos com o mesmo código dão 409 com o campo `codigo`, lido pelo nome da constraint no erro do PostgreSQL.
- **Tela Balança:**
  - o resultado do teste some quando o formato muda;
  - "Salvar" só fica ativo com alteração;
  - sair da tela com alteração pede confirmação ("Descartar alterações?").
- **Tela única:**
  - a barra fixa reúne os atalhos e os avisos (sucesso e erro ao salvar);
  - o scroll-spy considera a margem de rolagem da seção, então a seção levada pelo atalho continua ativa ao fim da rolagem; no fim da página, a última seção fica ativa;
  - Ctrl+Shift+Enter salva e abre outro cadastro;
  - "Usar o número do produto" só aparece quando o número cabe no código e na etiqueta.
- **Conferido no navegador** (2026-10-23): ordem da seção Códigos, atalho "Usar o número do produto", rolagem até o campo com erro e a contagem no atalho, calculadora pelo markup, margem e markup na promoção e no atacado, "Unidade e embalagem" no Estoque, tela Balança (padrão, prévia, teste e aviso de saída), Nº na lista e em Clientes, e celular sem rolagem lateral.
