# Produtos: Código do produto e etiqueta de balança (Fase B2 da evolução de Produtos)

> **Status:** propostas aprovadas em conversa em 2026-10-23. Ainda não é a spec final: o usuário vai trazer mais observações sobre Produtos, que entram aqui (ou em spec própria) antes do plano. Fase intermediária, antes da Fase F (imagem). Decisão a registrar como DEC-036 quando a spec fechar.

## 1. Motivação
- **Produto a granel:** a plataforma vai vender produtos a granel pesados na balança, que imprime uma **etiqueta com código de barras variável**.
- **O que a etiqueta traz:** não o código de barras do fabricante, e sim o **código do produto (PLU)** programado na balança, mais o **peso ou o valor total**.
- **Formato:** o formato depende da configuração da balança: dígito inicial, tamanho do código e tamanho e tipo da informação. A referência do usuário é a **Toledo Prix 4**.
- **O que falta hoje:** o Geitus não tem um código numérico obrigatório para isso. O SKU é texto livre e opcional, e os códigos de barras são do fabricante.

## 2. Os três códigos do produto (decisão do usuário)

| Código | Obrigatório | Regra |
|---|---|---|
| **Código do produto** (novo) | sim | Só dígitos (até 6), **único por empresa**, gerado automaticamente em sequência (1, 2, 3…) e editável no cadastro. É o código programado na balança e lido na etiqueta. |
| **SKU** | não | Texto livre para uso interno ou do fornecedor. **Deixa de ter sugestão automática** (o "Gerar automaticamente" `P000001` sai), para não se confundir com o código do produto. |
| **Códigos de barras** | não | Lista como hoje (Fase B): um produto pode ter **vários** códigos, e **cada código pertence a um único produto da empresa**. Exemplo: o 7898092030318 só pode estar no Açúcar Refinado 1kg. |

- **Identificadores internos:** continuam o UUID público (rotas e API) e a chave interna numérica (DEC-019).
- **Produtos existentes:** recebem um código do produto na migration, em ordem de cadastro (`criado_em`, `id`).
- **Troca do código:** mudar o código quebra a programação da balança. Por isso, ele fica editável com aviso e, quando o PDV existir, **bloqueado para produto já vendido**.
- **Busca:** o código do produto entra na busca da lista (e na do PDV).

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
- **Etiqueta para KG e UN:** flag **"Vendido na balança"** no produto, que não depende da unidade.
  - **KG:** o PDV calcula o peso pelo valor total e pelo preço por quilo (R$ 10,00 a R$ 25,00/kg = 0,400 kg).
  - **UN:** o PDV registra a quantidade pelo valor total e pelo preço unitário. Se o valor não for múltiplo do preço, registra 1 unidade pelo valor da etiqueta.
- **Código do produto guardado como número:** 000542, 0542 e 542 são o **mesmo** código (542). Ele é único por empresa, vai de 1 a 999999 e é exibido **sem zeros à esquerda**, como na balança. Na digitação, os zeros à esquerda são aceitos e ignorados. A busca encontra o produto por "542", "0542" ou "000542". Se a configuração da etiqueta usar menos dígitos, a tela avisa quais produtos têm código grande demais para ela.

## 6. Requisitos registrados para o PDV (etapa 11)
- **Digitação manual `código*quantidade`:** o operador digita, por exemplo, `542*3`, e o PDV adiciona o produto de código 542 ao carrinho com quantidade 3.
  - A quantidade aceita decimal só se a unidade for fracionada (`542*0,750` em KG).
  - Sem `*`, a quantidade é 1.
  - O código aceita zeros à esquerda.
- **Leitura da etiqueta de balança** com o leitor de §3: produto e valor (ou peso) vêm da etiqueta, e a quantidade é calculada conforme §5.
- **Leitura de código de barras** do fabricante: qualquer um dos códigos da lista do produto.

## 7. Pontos a fechar antes do plano
- **Demais observações do usuário sobre Produtos**, a discutir com a aplicação aberta.
