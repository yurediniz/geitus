# Produtos: Imagem do produto (Fase F)

> **Status:** **implementada** em 2026-10-24 (migration V15; ajustes no §9). Desenho aprovado em conversa no mesmo dia. Última fase da DEC-030, depois da Fase B5 ([fornecedores-e-marcas.md](fornecedores-e-marcas.md)). Decisões na **DEC-040**.

## 1. Motivação e escopo
- **Para que serve:** reconhecer o produto de relance na lista e, no futuro, na busca do PDV.
- **Decisões já tomadas (DEC-030):** a imagem fica no **PostgreSQL** e é **comprimida no navegador** antes de subir.
- **Decisões do usuário (2026-10-24):**
  - **uma imagem** por produto;
  - **envio** por arquivo, câmera do celular e arrastar e soltar;
  - **exibição** da foto **inteira, sem cortar**;
  - **entrega** por **URLs assinadas** (abordagem A).
- **Inclui:**
  - adicionar, trocar, girar e remover a imagem na tela do produto;
  - a miniatura na lista de produtos (tabela e cards).
- **Fora:**
  - várias fotos, recorte, colar (Ctrl+V);
  - imagem no PDV (vem com o PDV) e imagem de categoria ou marca;
  - armazenamento externo (S3 ou similar);
  - edição de imagem além de girar.

## 2. Imagem no navegador (antes de enviar)
- **Entrada:**
  - **formatos:** JPG, PNG ou WebP, de até **15 MB** (o arquivo original);
  - **no celular:** o mesmo botão oferece a câmera;
  - **orientação:** a da foto (EXIF) é respeitada.
- **Duas versões geradas no navegador:**
  - **grande:** o maior lado com até **1200 px** (sem ampliar imagens menores), em WebP com qualidade 0,82;
  - **miniatura:** o maior lado com **200 px** (ou menos, se a original for menor), em WebP com qualidade 0,8;
  - a proporção é mantida nas duas, sem recorte;
  - **sem WebP:** se o navegador não codificar WebP, as duas versões saem em **JPEG**, com a mesma qualidade.
- **Tetos de tamanho:** a grande deve ficar com **até 400 KB** e a miniatura com **até 40 KB**.
  - Se passar, o navegador reduz a qualidade em passos (até 0,5) e, se ainda assim não couber, a dimensão.
  - Se nada resolver: "Não foi possível reduzir esta imagem. Tente outra foto."
- **"Girar":** gira 90° no sentido horário a cada clique, antes de salvar.
- **Mensagens:**
  - "Não foi possível ler esta imagem. Use JPG, PNG ou WebP.";
  - "A imagem deve ter no máximo 15 MB.".

## 3. Banco — migration `V15__produto_imagem.sql`
Aditiva sobre a V14, que não é editada.
- **Tabela `produto_imagens`**, uma linha por produto, separada de `produtos`, para nenhuma consulta de produto carregar os bytes.
- **Colunas:**
  - `produto_id BIGINT` PK e `empresa_id BIGINT NOT NULL`, com FK composta `(empresa_id, produto_id) → produtos (empresa_id, id) ON DELETE CASCADE`;
  - `versao UUID NOT NULL UNIQUE`, gerada a cada envio (troca a URL);
  - `tipo VARCHAR(20) NOT NULL` com CHECK `IN ('image/webp','image/jpeg')`, o mesmo para as duas versões;
  - `grande BYTEA NOT NULL`, com CHECK `octet_length(grande) BETWEEN 1 AND 409600`;
  - `grande_largura` e `grande_altura`, `SMALLINT NOT NULL` com CHECK entre 1 e 1200;
  - `miniatura BYTEA NOT NULL`, com CHECK `octet_length(miniatura) BETWEEN 1 AND 40960`;
  - `miniatura_largura` e `miniatura_altura`, `SMALLINT NOT NULL` com CHECK entre 1 e 200;
  - `usuario_id BIGINT NOT NULL`, com FK composta para `usuario (empresa_id, id)`;
  - `atualizado_em TIMESTAMP NOT NULL`.
- **Sem colunas novas em `produtos`.** Saber se o produto tem imagem é uma junção leve pela PK, que não lê os bytes.

## 4. API

### 4.1 Envio e remoção (autenticados, só ADMIN)
- **`PUT /api/produtos/{id}/imagem`** (`multipart/form-data`, partes `grande` e `miniatura`):
  - substitui a imagem atual e gera uma `versao` nova;
  - responde 200 com `imagem` (§4.3).
- **`DELETE /api/produtos/{id}/imagem`:** responde 204, ou 404 se o produto não tem imagem.
- **Mesmo isolamento do produto:** produto de outra empresa dá 404. O produto inativo também pode ter a imagem trocada.
- **Conferências no servidor**, nesta ordem. O servidor **não recomprime** a imagem.

| Situação | Resposta | Mensagem |
|---|---|---|
| Falta uma das partes | 400 | "Envie a imagem grande e a miniatura." |
| Tipo real (pelos primeiros bytes) não é WebP nem JPEG, ou as duas partes têm tipos diferentes | 400 | "Formato de imagem não aceito. Use WebP ou JPEG." |
| Grande acima de 400 KB / miniatura acima de 40 KB | 400 | "A imagem grande deve ter no máximo 400 KB." / "A miniatura deve ter no máximo 40 KB." |
| Dimensões ilegíveis no cabeçalho | 400 | "Não foi possível ler as dimensões da imagem." |
| Grande acima de 1200 px / miniatura acima de 200 px no maior lado | 400 | "A imagem grande deve ter no máximo 1200 px no maior lado." / "A miniatura deve ter no máximo 200 px no maior lado." |
| Requisição acima do limite do servidor | 413 | "A imagem enviada é grande demais." |

- **Tipo real:**
  - JPEG começa com `FF D8 FF`;
  - WebP começa com `RIFF` e tem `WEBP` nos bytes 8–11;
  - o `Content-Type` enviado pelo cliente é ignorado.
- **Dimensões:**
  - lidas do cabeçalho: JPEG pelo marcador SOF, WebP pelos blocos `VP8 `, `VP8L` ou `VP8X`;
  - **sem biblioteca nova** (o Java não lê WebP sozinho).
- **Limite do multipart:** `max-file-size` de 512 KB e `max-request-size` de 1 MB.

### 4.2 Leitura por URL assinada (rota pública, conferida pela assinatura)
- **Rota:** `GET /api/imagens/produtos/{produtoId}/{versao}/{tamanho}?expira={epochSegundos}&assinatura={hex}`.
- **`tamanho`:** `grande` ou `miniatura`.
- **Assinatura:**
  - HMAC-SHA256 de `produtoId|versao|tamanho|expira`, em hexadecimal;
  - usa o segredo `GEITUS_IMAGEM_SEGREDO` (`geitus.imagens.segredo`), de no mínimo 32 bytes e **diferente do JWT_SECRET**;
  - **sem o segredo, a aplicação não sobe**, como no `JwtSecretValidator`;
  - a comparação é feita em tempo constante.
- **Validade:**
  - `expira` é o **fim do dia UTC seguinte** ao da geração, então a URL fica igual durante o dia, para o cache funcionar, e vale entre 24 e 48 h;
  - expirada ou com assinatura inválida → 403 sem corpo detalhado;
  - produto ou versão inexistente (inclusive versão trocada) → 404.
- **Resposta:**
  - os bytes, com o `Content-Type` gravado;
  - `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`;
  - `Cache-Control: private, max-age={segundos até expira}, immutable` e `ETag` = `versao` + `tamanho`.
- **Segurança da rota:** sem JWT (é a assinatura que autoriza), só GET, sem listagem; ela não revela o nome do produto nem dados da empresa.

### 4.3 No produto
- **Resposta:** o detalhe e os itens da listagem (`ProdutoResponse`) ganham `imagem: { miniaturaUrl, grandeUrl, largura, altura, atualizadaEm } | null`.
  - As URLs são relativas (`/api/imagens/...`) e já vêm assinadas.
  - `largura` e `altura` são as da versão grande.
- **Listagem:** carrega quais produtos da página têm imagem (versão, tipo, dimensões) numa consulta só, sem os bytes. O número de consultas fica constante.
- **Exclusão física do produto:** apaga a imagem em cascata.

## 5. Tela

### 5.1 Produto (seção Geral, no topo)
- **Quadro quadrado** (160 px no desktop, largura total até 240 px no celular):
  - a foto inteira (`object-contain`), com fundo claro onde sobrar;
  - sem imagem, um ícone neutro e o texto "Sem imagem".
- **Ações:**
  - **"Adicionar imagem"**, quando não há imagem: abre o seletor, com câmera no celular (`accept="image/*"`);
  - **arrastar e soltar** no quadro, com destaque ao arrastar por cima;
  - com imagem: **"Trocar"**, **"Girar"** e **"Remover"**.
- **Quando grava:** a imagem segue o **Salvar** da tela.
  - Uma imagem nova, trocada, girada ou removida conta como **alteração não salva** (aviso ao sair, contagem no atalho Geral).
  - Cancelar descarta a mudança.
- **Ao salvar:**
  - **edição:** primeiro o PATCH do produto, depois o `PUT` ou `DELETE` da imagem;
  - **cadastro novo:** o POST do produto, depois o `PUT` da imagem;
  - **produto salvo, mas imagem com erro:** "Produto salvo, mas a imagem não foi enviada. Tente de novo." O produto continua salvo, e a imagem pendente fica no quadro para uma nova tentativa (no cadastro novo, já na página de edição).
  - **sucesso:** a mensagem atual de "Produto salvo.", sem uma mensagem a mais.
- **Enquanto processa** (comprimir ou enviar): o quadro mostra "Processando imagem…" e o Salvar fica ocupado.
- **OPERADOR:** vê a imagem, mas não tem os botões nem o arrastar e soltar.
- **Acessibilidade:**
  - a imagem com `alt` = nome do produto;
  - o quadro de arrastar tem botão equivalente, e os botões têm nomes claros ("Trocar imagem", "Girar imagem", "Remover imagem").

### 5.2 Lista de produtos
- **Onde aparece a miniatura:**
  - **tabela:** primeira coluna, quadro de 40 px;
  - **cards:** quadro de 56 px à esquerda do nome.
- **Como carrega:** `loading="lazy"`, `decoding="async"`, `alt` vazio (o nome já está ao lado) e foto inteira no quadro.
- **Sem imagem:** o mesmo ícone neutro, menor.
- **Imagem que falha ao carregar** (URL vencida numa aba antiga): volta ao ícone, sem quebrar o layout.
- **Largura da tabela:** a coluna nova não pode trazer de volta a rolagem lateral a 1024 px (regra da Fase E). Se não couber, a miniatura da tabela fica só a partir de 1280 px, e a 1024 px só nos cards.

## 6. Configuração
- **`.env.example`:** ganha `GEITUS_IMAGEM_SEGREDO`, com explicação e um valor de exemplo que não serve em produção, como o do JWT.
- **`application.yml`:** ganha `geitus.imagens.segredo: ${GEITUS_IMAGEM_SEGREDO:}` e os limites do multipart.

## 7. Fora desta fase (registrado)
- **Para o PDV:** a miniatura nos resultados da busca, usando a mesma `miniaturaUrl`.
- **Várias imagens, recorte e colar.**
- **Armazenamento externo**, quando o volume justificar. A troca fica restrita à tabela e à rota de leitura.

## 8. Testes (critérios de aceite)
- **Backend:**
  - **V15 (IT):**
    - as CHECKs (tipo, tamanhos, dimensões);
    - a FK composta (empresa diferente barrada);
    - a cascata na exclusão do produto;
    - a `versao` única.
  - **Leitor de cabeçalho (unitário):**
    - JPEG e WebP (VP8, VP8L e VP8X) com as dimensões certas;
    - PNG, SVG, GIF e texto recusados;
    - arquivo truncado → "Não foi possível ler as dimensões da imagem.".
  - **Envio:**
    - grande e miniatura válidas → 200 com URLs;
    - cada mensagem da tabela de §4.1;
    - OPERADOR → 403;
    - produto de outra empresa → 404;
    - a troca gera versão nova, e a URL antiga dá 404;
    - remover → 204, e remover de novo → 404.
  - **URL assinada:**
    - válida → bytes, tipo, `nosniff` e cache;
    - assinatura alterada, `expira` vencida, `tamanho` trocado na URL ou produto trocado → 403;
    - a URL é igual durante o mesmo dia;
    - a rota não exige JWT, e o POST nela não existe.
  - **Configuração:** sem `GEITUS_IMAGEM_SEGREDO`, ou com ele curto, a aplicação não sobe.
  - **Listagem:** número de comandos constante com e sem imagens (3 contra 25 itens); `imagem` nula sem imagem.
- **Frontend:**
  - **Compressão (unitário, com canvas simulado):**
    - dimensões das duas versões;
    - sem ampliar;
    - fallback JPEG;
    - redução de qualidade até caber;
    - o giro troca largura e altura.
  - **Tela do produto:**
    - adicionar por arquivo e por arrastar;
    - trocar, girar e remover;
    - a imagem conta como alteração não salva;
    - Cancelar descarta;
    - salvar na edição envia PATCH e depois PUT, e remover envia DELETE;
    - cadastro novo envia POST e depois PUT;
    - falha da imagem mostra a mensagem e mantém a imagem pendente;
    - arquivo inválido e maior que 15 MB mostram as mensagens;
    - o OPERADOR só vê.
  - **Lista:**
    - miniatura na tabela e nos cards;
    - ícone sem imagem;
    - erro de carregamento volta ao ícone;
    - tabela sem rolagem lateral a 1024 px.

## 9. Ajustes na implementação
- **Assinatura e leitura:**
  - a mensagem assinada leva o rótulo de uso: `imagem-produto|v1|produtoUuid|versao|tamanho|expira`;
  - `expira` não numérico, ou sem `expira`/`assinatura` → 403 sem corpo; `tamanho` desconhecido → 404;
  - os outros métodos em `/api/imagens/**` são negados;
  - além dos cabeçalhos de §4.2, a resposta leva `Content-Security-Policy: default-src 'none'; sandbox` e `Cross-Origin-Resource-Policy: same-site`;
  - o frontend só busca blobs de URLs que começam com `/api/imagens/`.
- **Segredo:** além de ter 32 bytes ou mais, ele não pode ser igual ao `JWT_SECRET` nem ao valor de exemplo do `.env.example`; senão a aplicação não sobe.
- **Banco:** as colunas bytea usam `STORAGE EXTERNAL`, porque os bytes já chegam comprimidos.
- **Erros:**
  - remover sem imagem → 404 "Imagem não encontrada.";
  - pedido que não é multipart → 400 "Envie a imagem grande e a miniatura.";
  - caminho inexistente → 404 e método não suportado → 405, em vez de 500;
  - envio e remoção ficam registrados em log (usuário, empresa, produto e versão).
- **Compressão no navegador:**
  - o suporte a WebP é detectado uma vez;
  - a miniatura sai da versão grande já girada;
  - se o navegador não aceitar a orientação automática, tenta sem ela e, por último, com `<img>`.
- **Tela:**
  - **dica:** "Foto em JPG, PNG ou WebP, até 15 MB." e, só com mouse, "Ou arraste a foto até o quadro.";
  - **durante o envio do Salvar:** "Enviando imagem…";
  - **imagem gravada que não carrega:** "Não foi possível mostrar a imagem.";
  - **avisos de pendência no quadro:** "Imagem nova. Ela será gravada quando você salvar.", "A imagem será removida quando você salvar." e, depois de uma falha, "Esta imagem ainda não foi enviada. Toque em Salvar para tentar de novo.";
  - **girar uma imagem já gravada:** baixa a versão grande pela URL assinada; se falhar, mostra "Não foi possível carregar a imagem gravada. Tente de novo.";
  - **atalho Geral:** a imagem pendente liga o aviso de alterações não salvas; o atalho conta só **erros** (arquivo recusado ou envio que falhou);
  - **falha no cadastro novo:** a imagem pendente vai para a edição em memória, e não no histórico do navegador; Voltar e F5 não a trazem de volta.
