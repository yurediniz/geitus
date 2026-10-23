# Produtos: Código do produto e etiqueta de balança (Fase B2 da evolução de Produtos)

> **Status:** modelo dos códigos e da etiqueta aprovado em conversa em 2026-10-23. Ainda não é a spec final: o usuário vai trazer mais observações sobre Produtos, que entram aqui (ou em spec própria) antes do plano. Fase intermediária, antes da Fase F (imagem). Decisão a registrar como DEC-036 quando a spec fechar.

## 1. Motivação
- **Produto a granel:** a plataforma vai vender produtos a granel pesados na balança, que imprime uma **etiqueta com código de barras variável**.
- **O que a etiqueta traz:** não o código de barras do fabricante, e sim o **código do produto (PLU)** programado na balança, mais o **peso ou o valor total**.
- **Formato:** o formato depende da configuração da balança: dígito inicial, tamanho do código e tamanho e tipo da informação. A referência do usuário é a **Toledo Prix 4**.
- **O que falta hoje:** o Geitus não tem um código numérico para a balança. O SKU é texto livre e opcional, e os códigos de barras são do fabricante. Também falta um **número de registro** sequencial por empresa (como o da venda).

## 2. Identificação do produto (modelo final, decisão do usuário em 2026-10-23)

| Campo | Obrigatório | Regra |
|---|---|---|
| **Número** (novo) | gerado | Registro de negócio: 1, 2, 3… **por empresa**, gerado na criação e **imutável**, nunca reaproveitado (um produto excluído deixa o número vago). Vem de um contador por empresa e tipo, travado na mesma transação: sem repetição e sem número consumido se a gravação falhar. **Não é a PK**, porque o banco é multiempresa e a PK não deve ter significado de negócio. A PK interna e o UUID público continuam (DEC-019). O mesmo mecanismo vale para **Cliente** (agora) e **Venda** (no PDV). |
| **Código do produto** (novo) | não; **sim quando "Vendido na balança"** | Só números, até 6 dígitos (1 a 999999), único por empresa. **Vem vazio no cadastro manual.** Guardado como número: 000542 = 0542 = 542, exibido sem zeros. É o código da etiqueta de balança e o do `código*quantidade` no PDV. Ao marcar "Vendido na balança" com o código vazio, a tela oferece o atalho "Usar o número do produto". |
| **SKU** | não | Como era antes: alfanumérico, único por empresa, com o botão "Gerar automaticamente" (`P000001`). **Não é usado na venda.** |
| **Códigos de barras** | não | Lista como hoje (Fase B): EAN-13, EAN-8 e UPC-A com dígito verificador validado; outros formatos aceitos com aviso. Um produto pode ter **vários** códigos, e **cada código pertence a um único produto da empresa** (o 7898092030318 só pode estar no Açúcar Refinado 1kg). |

- **Dados atuais:** os produtos e os clientes existentes recebem o **Número** na migration, em ordem de cadastro (`criado_em`, `id`). O **código do produto** fica vazio.
- **Troca do código do produto:** é editável. Quando o PDV existir, fica **bloqueado para produto já vendido**, porque mudar quebra a programação da balança.
- **Busca:** o Número e o código do produto entram na busca da lista.

## 3. Configuração da etiqueta de balança (por empresa)
- **Tela própria:** "Configuração de etiqueta de balança", porque a configuração é da balança, não do produto.
- **Campos:**
  - **prefixo**, normalmente `2` (faixa de uso interno da GS1);
  - **tamanho do código do produto** na etiqueta (4, 5 ou 6 dígitos);
  - **tipo da informação**: peso (kg, 3 casas) ou valor total (R$, 2 casas), e quantos dígitos tem;
  - **dígito de preenchimento** entre os campos, quando houver (algumas configurações da Toledo têm um `0` no meio);
  - **dígito verificador** EAN-13 no fim.
- **Modelos prontos** das configurações comuns da Toledo Prix 4.
- **Campo de teste:** colar o número de uma etiqueta real mostra a leitura ("Produto 123 · 0,758 kg").
- **Leitor da etiqueta:** a regra que transforma o número lido em código do produto mais peso ou valor entra como **regra de domínio testada**, como o preço vigente da Fase C, pronta para o PDV.
- **Proteção:** impedir, ou ao menos avisar, quando um código de barras fixo cadastrado no produto se confunde com o formato configurado da etiqueta.

## 4. Fora desta fase
- **Códigos do fornecedor e histórico de compras do produto:** a ideia do usuário é registrar, na importação da nota de entrada, o código de cada fornecedor (um produto pode ter vários fornecedores, e códigos de fornecedores diferentes podem coincidir) e um histórico de compras mais completo. Fica para a especificação da entrada de mercadoria (Compras), a amadurecer depois.
- **Exportar os produtos para o software da balança** (arquivo de itens do MGV da Toledo): evita digitar duas vezes, mas é uma integração que pede especificação própria.
- **Leitura da etiqueta na venda:** fica para o PDV (etapa 11), que vai usar o leitor do §3.

## 5. Decisões do usuário (2026-10-23)
- **Formato padrão da etiqueta** (configuração atual da balança do usuário), que vira o modelo padrão da tela:

  | Parte | Dígitos | Exemplo `2000542010000` |
  |---|---|---|
  | Prefixo | 1 | `2` |
  | Código do produto | 6 | `000542` → produto **542** |
  | Valor total (R$) | 6, com **3 casas decimais** | `010000` → 010,000 → **R$ 10,00** |
  | Dígito verificador | nenhum | — |

  A configuração continua flexível: casas decimais (2 ou 3), presença ou não do dígito verificador, tamanho do código e peso em vez de valor.
- **Etiqueta para KG e UN:** flag **"Vendido na balança"** no produto, que não depende da unidade. Marcada, ela torna o **código do produto obrigatório**.
  - **KG:** o PDV calcula o peso pelo valor total e pelo preço por quilo (R$ 10,00 a R$ 25,00/kg = 0,400 kg).
  - **UN:** o PDV registra a quantidade pelo valor total e pelo preço unitário. Se o valor não for múltiplo do preço, registra 1 unidade pelo valor da etiqueta.
- **Código do produto guardado como número:** 000542, 0542 e 542 são o **mesmo** código (542). Ele é opcional (obrigatório só com "Vendido na balança"), único por empresa, vai de 1 a 999999 e é exibido **sem zeros à esquerda**, como na balança. Na digitação, os zeros à esquerda são aceitos e ignorados. A busca encontra o produto por "542", "0542" ou "000542". Se a configuração da etiqueta usar menos dígitos, a tela avisa quais produtos têm código grande demais para ela.

## 6. Requisitos registrados para o PDV (etapa 11)
- **Digitação manual `código*quantidade`:** o operador digita, por exemplo, `542*3`, e o PDV adiciona o produto de código 542 ao carrinho com quantidade 3.
  - A quantidade aceita decimal só se a unidade for fracionada (`542*0,750` em KG).
  - Sem `*`, a quantidade é 1.
  - O código aceita zeros à esquerda.
- **Leitura da etiqueta de balança** com o leitor de §3: produto e valor (ou peso) vêm da etiqueta, e a quantidade é calculada conforme §5.
- **Leitura de código de barras** do fabricante: qualquer um dos códigos da lista do produto.
- **Sem ambiguidade:** o `código*quantidade` procura **só pelo código do produto**, e o leitor procura pelos códigos de barras e pela etiqueta de balança. O SKU **não** entra na venda.
- **Número da venda:** sequencial por empresa, com o mesmo mecanismo do Número do produto (§2).

## 7. Formulário do produto em tela única (decisão do usuário, 2026-10-23)
Substitui as abas da Fase B (`produtos-identificacao-e-formulario.md` §6.2).
- **Tela única:** todas as seções numa página, em sequência. No topo, uma **barra de atalhos fixa** (Geral · Códigos · Preços · Estoque · Histórico) que leva até a seção e destaca a que está visível enquanto se rola.
- **Erros ao salvar:** a página rola até o primeiro campo com erro e foca nele. O atalho da seção mostra a quantidade de erros.
- **Rodapé:** Salvar/Cancelar fixo, como hoje, com Ctrl+Enter.
- **Celular:** os atalhos rolam para o lado e as seções ficam em uma coluna.
- **Seções, nesta ordem:**
  1. **Geral:** **Nº do Produto** (só leitura, no topo da seção), nome, nome curto, unidade de venda, preço de venda, categoria, marca, fornecedor e descrição. **Sem o campo de código de barras.**
  2. **Códigos:** código do produto, "Vendido na balança", SKU e a lista de códigos de barras (com o "Adicionar código", Enter para o leitor).
  3. **Preços:** custo, preço mínimo, margem e markup, a calculadora, promoção e atacado.
  4. **Estoque:** controle, saldo, ajuste, níveis e o bloco **"Unidade e embalagem"** (unidade de compra e fator), movido da Geral por decisão do usuário, porque serve à compra e à entrada de mercadoria.
  5. **Histórico:** só na edição; carrega quando a seção se aproxima da tela.

## 8. Preços: margem e markup (decisão do usuário, 2026-10-23)
- **Margem e markup em todos os preços:** além do preço de venda, aparecem ao lado do **preço promocional** e do **preço de atacado**, calculados sobre o custo (promoção R$ 8,90 com custo R$ 6,00 → margem 32,58%, markup 48,33%). Sem custo, aparece "—".
- **Calculadora com duas opções**, "Calcular pela margem" e "Calcular pelo markup":
  - pela margem: preço = custo ÷ (1 − margem) (custo R$ 10,00 e margem 30% → R$ 14,29);
  - pelo markup: preço = custo × (1 + markup) (custo R$ 10,00 e markup 30% → R$ 13,00).

  Os dois arredondam para centavos (meio para cima). A margem fica entre 0 e 99,99%, e o markup é maior ou igual a 0.
- **Explicação** junto ao bloco (ícone "?" ou texto de ajuda):
  - **Margem:** quanto do preço de venda é lucro, (preço − custo) ÷ preço. Vender a R$ 15,00 algo que custou R$ 10,00 dá 33,33%.
  - **Markup:** quanto se acrescenta sobre o custo, (preço − custo) ÷ custo. O mesmo exemplo dá 50%.

## 9. Pontos a fechar antes do plano
- **Demais observações do usuário sobre Produtos.**
