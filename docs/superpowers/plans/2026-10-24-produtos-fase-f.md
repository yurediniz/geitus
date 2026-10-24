# Produtos Fase F (Imagem do produto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO: as tasks 1–3 ficam com o `back-end-executor` e as 4–6 com o `front-end-executor`, em paralelo, com revisores depois.

**Goal:** uma imagem por produto, comprimida no navegador, guardada no PostgreSQL e servida por URLs assinadas, com o quadro na seção Geral e a miniatura na lista.

**Architecture:**
- **Backend:**
  - subpacote `catalog/imagem`, com a entidade `ImagemDoProduto` (tabela separada), o leitor de cabeçalho `CabecalhoDeImagem` (domínio puro), o assinador `AssinaturaDeImagem` (HMAC) e o serviço `ImagensDoProduto`;
  - um controller para envio e remoção, sob `/api/produtos/{id}/imagem`, e outro para a leitura pública assinada, sob `/api/imagens/produtos/...`;
  - o `ProdutoResponse` recebe a imagem pelas `ReferenciasDoProduto`, carregada em lote sem os bytes.
- **Frontend:**
  - `lib/imagemDoProduto.ts` (decodificar, girar, redimensionar e codificar, com fallback JPEG);
  - o componente `QuadroDaImagem` na seção Geral;
  - o envio depois do Salvar;
  - a miniatura na tabela e nos cards.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6, Flyway, PostgreSQL 16, Testcontainers; React 19, TS, RHF + Zod 4, TanStack Query v5, Vitest.

**Spec:** [`docs/modules/produtos-imagem.md`](../../modules/produtos-imagem.md) (DEC-040). Os executores leem a spec inteira; as mensagens estão em §2 e §4.1.

## Global Constraints
- **Migrations:** só a nova `V15__produto_imagem.sql`; V1–V14 intocadas.
- **Dependências:** nenhuma nova, no backend ou no frontend. O cabeçalho JPEG/WebP é lido à mão, e a compressão usa canvas, `createImageBitmap` e `toBlob`.
- **Limites (iguais nos dois lados):**
  - grande: até 1200 px e 409 600 bytes;
  - miniatura: até 200 px e 40 960 bytes;
  - tipos `image/webp` e `image/jpeg`;
  - original até 15 MB;
  - multipart: 512 KB por parte e 1 MB por requisição.
- **Segredo:** `GEITUS_IMAGEM_SEGREDO` → `geitus.imagens.segredo`, com 32 bytes ou mais. A aplicação não sobe sem ele (validador como o `JwtSecretValidator`). Ele é diferente do `JWT_SECRET`, e um valor de exemplo vai no `.env.example`. Nos testes, um valor fixo no `application-test` ou nas propriedades do IT.
- **Assinatura:**
  - HMAC-SHA256 hexadecimal de `produtoUuid|versao|tamanho|expira`;
  - `expira` = epoch em segundos do fim do dia UTC seguinte ao da geração (00:00 UTC de depois de amanhã), calculado pelo `Clock` injetado;
  - comparação com `MessageDigest.isEqual`.
- **Rota pública:** só `GET /api/imagens/**` liberada no `SecurityConfig` (`permitAll`). O envio fica sob `/api/produtos/**`, já ADMIN para PUT/DELETE; o PUT também precisa estar coberto, porque hoje só POST, PATCH e DELETE estão listados.
- **Isolamento:** o produto é sempre buscado pela empresa do JWT no envio e na remoção. A leitura pública acha a imagem por `produto.uuid` + `versao`, e a assinatura é a autorização.
- **Commits:** em pt-BR, com pathspec `-- backend/` ou `-- frontend/`, sem `add -A`/`stash`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Arquivo com extensão `.jpg` que na verdade é SVG ou HTML**, e WebP com `RIFF` correto mas bloco desconhecido. Esperado: 400 "Formato de imagem não aceito. Use WebP ou JPEG." ou "Não foi possível ler as dimensões da imagem.", nunca 500 e nunca servido depois. Teste na Task 1.
2. **URL assinada copiada de um produto de outra empresa**, ou com o `tamanho` trocado de `miniatura` para `grande`. Esperado: 403, porque a assinatura cobre os dois. Não existe enumeração: versão inexistente dá 404 sem detalhe. Teste na Task 2.
3. **Troca da imagem com a lista aberta em outra aba.** Esperado: a URL antiga dá 404, o `<img>` cai no ícone (`onError`), e a nova versão tem URL nova, o que impede cache velho. Testes nas Tasks 2 e 6.
4. **Foto de celular em retrato com EXIF de rotação**, de 4000×3000 e 6 MB. Esperado: a grande sai no máximo com 1200 px no maior lado, em pé, e com até 400 KB, reduzindo a qualidade se preciso. Teste na Task 4 (canvas simulado).
5. **Cadastro novo com imagem em que o POST do produto passa e o PUT da imagem falha.** Esperado: o produto existe; a tela vai para a edição com "Produto salvo, mas a imagem não foi enviada. Tente de novo." e com a imagem pendente no quadro; um novo Salvar envia só a imagem. Teste na Task 5.

---

### Task 1: V15, entidade e leitor de cabeçalho

**Files:**
- Create:
  - `backend/src/main/resources/db/migration/V15__produto_imagem.sql`;
  - `catalog/imagem/ImagemDoProduto.java` (entidade);
  - `catalog/imagem/ImagemDoProdutoRepository.java`;
  - `catalog/imagem/CabecalhoDeImagem.java`;
  - `catalog/imagem/TipoDeImagem.java` (`WEBP("image/webp")`, `JPEG("image/jpeg")`).
- Test:
  - `catalog/imagem/MigracaoV15IT.java`;
  - `catalog/imagem/CabecalhoDeImagemTest.java`, com bytes montados no teste (sem arquivos binários no repositório).

**Interfaces:**
- **Produces:**
  - `ImagemDoProduto`: campos da spec §3, com `produto_id` como `@Id` (via `@MapsId`, ou o id puro) e os `byte[]` em `@Basic(fetch = LAZY)`. O bytea é mapeado com `@JdbcTypeCode(SqlTypes.VARBINARY)` ou o que o `validate` aceitar.
  - `ImagemDoProdutoRepository`:
    - `Optional<ResumoDaImagem> resumo(Long empresaId, Long produtoId)`;
    - `List<ResumoDaImagem> resumos(Long empresaId, Collection<Long> produtoIds)`;
    - `Optional<byte[]> bytes(UUID produtoUuid, UUID versao, boolean grande)`, mais o tipo.
    - As projeções não carregam os bytes.
  - `record ResumoDaImagem(Long produtoId, UUID produtoUuid, UUID versao, TipoDeImagem tipo, int largura, int altura, LocalDateTime atualizadaEm)`.
  - `CabecalhoDeImagem.ler(byte[] bytes) → Optional<Leitura(TipoDeImagem tipo, int largura, int altura)>`:
    - vazio quando o tipo não é JPEG/WebP;
    - lança `ImagemInvalidaException("Não foi possível ler as dimensões da imagem.")` quando o tipo é reconhecido mas o cabeçalho está truncado ou é desconhecido.
- **Algoritmo do cabeçalho** (decide o que os testes cobrem):
  - **JPEG:** começa com `FF D8 FF`. Percorrer os marcadores (`FF xx`, tamanho de 2 bytes big-endian) até um SOF entre `C0` e `CF`, exceto `C4`, `C8` e `CC`. A altura fica nos bytes +5..+6 e a largura em +7..+8.
  - **WebP:** `RIFF` + 4 bytes + `WEBP`, e depois um destes blocos:
    - `VP8 `: assinatura `9D 01 2A` no offset 23, largura e altura em 14 bits little-endian em 26 e 28;
    - `VP8L`: byte 20 = `2F`, e 28 bits empacotados a partir do 21 (largura = bits 0–13 + 1, altura = bits 14–27 + 1);
    - `VP8X`: largura e altura em 24 bits little-endian em 24 e 27, mais 1.

- [ ] Escrever `CabecalhoDeImagemTest`:
  - JPEG 1200×800 (SOF0) e 640×480 (SOF2);
  - WebP VP8 de 200×150, VP8L de 1×1 e de 1200×900, e VP8X de 1000×1000;
  - PNG, GIF, SVG (`<svg`), texto e vazio → vazio;
  - JPEG sem SOF e WebP com bloco `ABCD` → exceção com a mensagem;
  - JPEG truncado no meio do marcador → exceção.
- [ ] Escrever `MigracaoV15IT`:
  - insere e lê;
  - grande com 409 601 bytes → CHECK;
  - miniatura com 201 px → CHECK;
  - tipo `image/png` → CHECK;
  - `versao` repetida → violação;
  - FK com empresa diferente → violação;
  - excluir o produto apaga a imagem.
- [ ] Implementar e rodar `./mvnw verify`.
- [ ] Commit `feat(produtos): migration V15 e leitor de cabecalho da imagem`.

### Task 2: Envio, remoção e leitura assinada

**Files:**
- Create:
  - `catalog/imagem/AssinaturaDeImagem.java` (`@Component`);
  - `catalog/imagem/SegredoDeImagemValidator.java`;
  - `catalog/imagem/ImagensDoProduto.java` (`@Service`);
  - `catalog/imagem/ImagemDoProdutoController.java` (envio e remoção);
  - `catalog/imagem/LeituraDeImagemController.java` (pública);
  - `catalog/imagem/ImagemInvalidaException.java`, com o handler (400);
  - `catalog/dto/ImagemResponse.java`.
- Modify:
  - `config/SecurityConfig.java`: `GET /api/imagens/**` com `permitAll`, e `PUT /api/produtos/**` só ADMIN;
  - `application.yml`: `geitus.imagens.segredo`, `spring.servlet.multipart.max-file-size: 512KB` e `max-request-size: 1MB`;
  - `shared/error/GlobalExceptionHandler.java`: `MaxUploadSizeExceededException` → 413 "A imagem enviada é grande demais.", e `MissingServletRequestPartException` → 400 "Envie a imagem grande e a miniatura.";
  - `.env.example`: `GEITUS_IMAGEM_SEGREDO`, com comentário e valor de exemplo de 64 hexadecimais "troque em produção";
  - o perfil e as propriedades de teste: um segredo fixo.
- Test:
  - `AssinaturaDeImagemTest`;
  - `ImagensDoProdutoTest`;
  - `ImagemDoProdutoIT` (MockMvc + Testcontainers, com JWT de ADMIN e de OPERADOR);
  - `SegredoDeImagemValidatorTest`.

**Interfaces:**
- **Consumes:** Task 1; `ProdutoRepository.buscarPorUuidParaAtualizar(...)` (trava) para o envio e a remoção.
- **Produces:**
  - `AssinaturaDeImagem`:
    - `String url(UUID produtoUuid, UUID versao, TamanhoDaImagem tamanho)` monta `/api/imagens/produtos/{p}/{v}/{t}?expira=..&assinatura=..`;
    - `boolean valida(UUID produtoUuid, UUID versao, TamanhoDaImagem tamanho, long expira, String assinatura)` confere a assinatura e `expira > agora`.
  - `enum TamanhoDaImagem { GRANDE, MINIATURA }`; no path, `grande` e `miniatura`.
  - `record ImagemResponse(String miniaturaUrl, String grandeUrl, int largura, int altura, LocalDateTime atualizadaEm)`, com fábrica `de(ResumoDaImagem, AssinaturaDeImagem)`.
  - `ImagensDoProduto`:
    - `enviar(Long idUsuario, UUID produtoId, MultipartFile grande, MultipartFile miniatura) → ImagemResponse`, com as conferências na ordem da tabela §4.1 e o mesmo tipo nas duas partes;
    - `remover(Long idUsuario, UUID produtoId)`;
    - `ler(UUID produtoUuid, UUID versao, TamanhoDaImagem t) → Optional<BytesDaImagem(byte[] bytes, TipoDeImagem tipo)>`.
  - **Leitura pública:**
    - assinatura inválida ou expirada → 403 sem corpo, com `ResponseEntity.status(403).build()`;
    - inexistente → 404 sem corpo;
    - OK → 200 com os headers da spec §4.2 (`Cache-Control: private, max-age=<expira-agora>, immutable`, `ETag` `"{versao}-{t}"`, `nosniff` e `Content-Disposition: inline`).
- **Validador do segredo:** ausente, ou com menos de 32 bytes (UTF-8) → `IllegalStateException` na subida, com mensagem que não mostra o valor. Mesmo padrão do `JwtSecretValidator`.

- [ ] **Testes:**
  - `AssinaturaDeImagemTest`, com `Clock` fixo:
    - `expira` = fim do dia UTC seguinte;
    - a URL é igual em dois horários do mesmo dia;
    - assinatura alterada, `tamanho` trocado, versão trocada ou produto trocado → inválida;
    - `expira` no passado → inválida.
  - `ImagemDoProdutoIT`:
    - **envio:**
      - PUT válido (WebP mínimo montado no teste) → 200 com as URLs;
      - GET na `grandeUrl` sem JWT → bytes, `image/webp`, `nosniff` e `Cache-Control` com `immutable`;
    - **cada mensagem da tabela §4.1:**
      - falta parte;
      - PNG;
      - tipos misturados;
      - 409 601 bytes;
      - 1201 px;
      - cabeçalho ilegível;
      - acima do multipart → 413;
    - **perfis e isolamento:** OPERADOR → 403; produto de outra empresa → 404;
    - **troca:** versão nova, e a URL antiga → 404 (Review Focus 3);
    - **remoção:** → 204, e de novo → 404;
    - **leitura pública:**
      - URL com a assinatura de outro produto → 403;
      - `tamanho` trocado → 403 (Review Focus 2);
      - POST na rota pública → não permitido (405 ou 403, desde que não seja 200);
    - **SVG** com extensão `.jpg` → 400 (Review Focus 1).
  - `SegredoDeImagemValidatorTest`: ausente e curto → exceção.
- [ ] Implementar e rodar `./mvnw verify`.
- [ ] Commit `feat(produtos): envio, remocao e leitura assinada da imagem do produto`.

### Task 3: Imagem no `ProdutoResponse` (detalhe e listagem)

**Files:**
- Modify:
  - `catalog/dto/ReferenciasDoProduto.java`: o mapa `produtoId → ResumoDaImagem` e a `AssinaturaDeImagem`;
  - `catalog/dto/ProdutoResponse.java`: o campo `ImagemResponse imagem`;
  - `catalog/ProdutoService.java`: o detalhe e as respostas de gravação usam `resumo`, e a listagem usa `resumos` numa consulta para a página.
- Test:
  - `ListagemDeProdutosIT`: contagem de comandos com e sem imagens (3 contra 25 iguais);
  - o IT do produto: `imagem` nula sem imagem e preenchida com imagem.

- [ ] Testes e implementação; `./mvnw verify`.
- [ ] Commit `feat(produtos): imagem na resposta do produto e da listagem`.

### Task 4: Frontend — compressão no navegador

**Files:**
- Create:
  - `frontend/src/lib/imagemDoProduto.ts`;
  - `frontend/src/lib/imagemDoProduto.test.ts`.
- Modify:
  - `frontend/src/services/httpClient.ts`: `apiPutMultipart<T>(path, formData)`, autenticado, sem `Content-Type` manual;
  - `services/produtoService.ts`: `enviarImagemDoProduto(id, grande: Blob, miniatura: Blob)` e `removerImagemDoProduto(id)`;
  - `types/produto.ts`: `ImagemDoProduto { miniaturaUrl, grandeUrl, largura, altura, atualizadaEm }` e `Produto.imagem: ImagemDoProduto | null`.

**Interfaces:**
- **Produces:**
  - `const LIMITES = { grande: { lado: 1200, bytes: 409_600 }, miniatura: { lado: 200, bytes: 40_960 }, originalBytes: 15 * 1024 * 1024 }`;
  - `async function prepararImagem(arquivo: File, rotacao: 0 | 90 | 180 | 270) → Promise<ImagemPreparada>`, com `ImagemPreparada = { grande: Blob; miniatura: Blob; tipo: 'image/webp' | 'image/jpeg'; largura: number; altura: number; previa: string /* object URL da grande */ }`;
  - `function dimensoesAjustadas(largura, altura, ladoMaximo) → { largura, altura }`, sem ampliar;
  - `class ErroDeImagem extends Error`, com as mensagens da spec §2.
- **Algoritmo:**
  - recusa acima de 15 MB ou tipo fora de `image/jpeg|png|webp` (pelo `file.type`; se vazio, tenta decodificar);
  - `createImageBitmap(file, { imageOrientation: 'from-image' })`;
  - desenha no canvas com a rotação e as dimensões ajustadas;
  - `toBlob('image/webp', q)`; se o resultado não for `image/webp`, refaz em `image/jpeg`;
  - acima do limite de bytes: reduz `q` em 0,1 até 0,5, depois reduz o lado em 15 % e repete; se nada servir, `ErroDeImagem("Não foi possível reduzir esta imagem. Tente outra foto.")`.

- [ ] Testes com `createImageBitmap` e `HTMLCanvasElement.prototype.toBlob` simulados:
  - 4000×3000 → grande 1200×900 e miniatura 200×150;
  - 300×200 → grande 300×200 (não amplia);
  - rotação 90 → troca largura e altura;
  - `toBlob` que devolve PNG → refaz em JPEG;
  - blob grande demais nas primeiras tentativas → reduz a qualidade e depois o lado;
  - 16 MB → mensagem de 15 MB;
  - GIF → mensagem de formato;
  - falha ao decodificar → mensagem de leitura.
- [ ] `npm run lint && npm run typecheck && npm test`.
- [ ] Commit `feat(produtos): compressao da imagem do produto no navegador`.

### Task 5: Frontend — quadro da imagem e envio no Salvar

**Files:**
- Create:
  - `features/products/secoes/QuadroDaImagem.tsx`;
  - `features/products/imagemPendente.ts`: o estado `{ tipo: 'nenhuma' } | { tipo: 'nova', preparada, rotacao } | { tipo: 'remover' }`.
- Modify:
  - `secoes/SecaoGeral.tsx`: o quadro no topo;
  - `ProdutoPage.tsx`:
    - o estado da imagem pendente;
    - a alteração não salva (aviso e contagem no atalho Geral);
    - Salvar: PATCH/POST e depois PUT/DELETE;
    - a falha parcial: mensagem e, no cadastro novo, navegar para a edição levando a imagem pendente pelo `state` da rota;
    - Cancelar descarta.
- Test: `ProdutoPage.test.tsx` e `QuadroDaImagem.test.tsx`.

**Interfaces:**
- **Consumes:** Task 4.
- **Textos** exatos da spec §5.1:
  - "Sem imagem", "Adicionar imagem", "Trocar imagem", "Girar imagem", "Remover imagem";
  - "Processando imagem…";
  - "Produto salvo, mas a imagem não foi enviada. Tente de novo.".
- **Comportamento:**
  - **Quando comprimir:** a compressão roda **ao escolher o arquivo** (erro na hora e prévia fiel) e **de novo a cada giro**, a partir do arquivo original guardado na memória, com a rotação acumulada. O Salvar só envia os blobs prontos.
  - **Remover sem imagem gravada:** volta a "nenhuma".

- [ ] Testes:
  - **adicionar:** por input e por drop; a prévia aparece;
  - **edição:** Girar, Trocar e Remover;
  - **alteração não salva:** aviso ao sair e contagem no atalho Geral;
  - **Cancelar:** volta à imagem gravada;
  - **salvar na edição:** PATCH e depois PUT (com `FormData` de duas partes); remover → DELETE;
  - **cadastro novo:** POST e depois PUT;
  - **falha do PUT no cadastro novo:** vai para a edição com a mensagem e a imagem pendente; um novo Salvar só envia o PUT (Review Focus 5);
  - **arquivo inválido:** mensagem no quadro;
  - **OPERADOR:** sem botões nem drop;
  - **imagem gravada:** `alt` = nome do produto.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Commit `feat(produtos): quadro da imagem na tela do produto`.

### Task 6: Frontend — miniatura na lista

**Files:**
- Create: `features/products/listagem/MiniaturaDoProduto.tsx`, com o ícone de reserva e `onError` → ícone.
- Modify:
  - `listagem/TabelaProdutos.tsx`: primeira coluna de 40 px;
  - `listagem/CardsProdutos.tsx`: 56 px;
  - o teste da listagem.

- [ ] Testes:
  - com imagem → `<img src={miniaturaUrl} loading="lazy" decoding="async" alt="">`;
  - sem imagem → ícone;
  - evento `error` → ícone (Review Focus 3);
  - a tabela continua sem rolagem lateral a 1024 px. Medida manual no navegador pelo CTO; no teste, as classes da coluna. Se não couber, `hidden xl:table-cell` na coluna da miniatura.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Commit `feat(produtos): miniatura do produto na lista`.

### Task 7: CTO

- [ ] **Antes de subir o backend no dev:** acrescentar `GEITUS_IMAGEM_SEGREDO` ao `.env` do checkout principal, com um valor aleatório gerado por script, sem mostrar; avisar o usuário.
- [ ] **Revisores:**
  - `data-reviewer` (V15, bytea, obrigatório);
  - `security-reviewer` (rota pública, assinatura, upload e tipos, obrigatório);
  - `back-end-reviewer`, `front-end-reviewer`, `product-ux-reviewer` e `qa-reviewer`.
- [ ] **Dev:** backup do banco, V15 aplicada e conferência.
- [ ] **Smoke da API:** envio e leitura assinada, os 400/403/404/413, a troca e a remoção.
- [ ] **Navegador:** com o usuário de teste do `.env.example`, conferir:
  - adicionar uma foto real, girar, salvar e trocar;
  - a lista com miniaturas a 1024 e a 1280 px;
  - o celular.
- [ ] **Documentação:**
  - status e ajustes da spec;
  - `produtos.md`, o README dos módulos e os READMEs (backend: endpoints e segredo);
  - dívida técnica e memória.
- [ ] **Validação final:** `./mvnw verify` e o conjunto do frontend.
