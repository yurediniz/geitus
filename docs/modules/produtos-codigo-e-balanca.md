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

## 5. Pontos a fechar antes do plano
- **Demais observações do usuário sobre Produtos**, a discutir com a aplicação aberta.
- **Formatos exatos da Prix 4** a oferecer como modelo: confirmar com o usuário quais ele usa (por exemplo `2 CCCC 0 PPPPP D` e `2 CCCCC PPPPP D`).
- **Para quais produtos a etiqueta vale:** só para os de unidade fracionada (KG) ou para qualquer um marcado como "vendido na balança". Por exemplo, um item por unidade com preço total também pode sair da balança.
