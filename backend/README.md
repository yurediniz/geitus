# Geitus — Backend

Backend do **Geitus**, a plataforma SaaS de gestão para pequenos negócios. Contém a aplicação Spring Boot com **autenticação por JWT**, o cadastro da **Empresa** do usuário autenticado, a gestão de **Usuários** e os módulos de **Produtos** e **Clientes**, além dos health checks. Os demais módulos de negócio (PDV, caixa, estoque, financeiro) ainda não foram implementados.

---

## Stack

- Java 21 LTS
- Spring Boot 3.5.x (Spring Web, Spring Data JPA, Spring Security, Bean Validation)
- Flyway (migrations)
- PostgreSQL (driver)
- Maven 3.9.16 via Maven Wrapper
- JWT (jjwt 0.12.x) para autenticação
- springdoc-openapi (Swagger UI) para documentação da API em desenvolvimento

---

## O que já existe nesta etapa

- Projeto Spring Boot configurado para Java 21.
- Maven Wrapper (`mvnw` / `mvnw.cmd`) fixado no Maven 3.9.16.
- Estrutura de pacotes por domínio (ver abaixo).
- `application.yml` lendo configurações de variáveis de ambiente.
- Flyway habilitado, com as migrations `V1__baseline.sql` a `V15__produto_imagem.sql` (empresa, usuário, produtos e seus incrementos, clientes, unidades de medida e categorias, códigos de barras múltiplos e UUID do produto, promoção, atacado e histórico de preços, saldos e movimentos de estoque, colunas normalizadas para a busca, número de registro de produtos e clientes, código do produto e configuração da etiqueta de balança, embalagens de venda, custo na entrada por compra, marcas, fornecedores e representantes, imagem do produto).
- Health check da aplicação em `GET /api/health` e health check padrão do Actuator em `GET /actuator/health`.
- CORS básico liberado para o frontend local (Vite).
- **Autenticação:** login por e-mail/senha (BCrypt) com emissão de JWT (HS256), filtro de autenticação por Bearer token e endpoint de dados do usuário autenticado (`GET /api/auth/me`, com a empresa aninhada).
- **Empresa:** `GET/PATCH /api/empresas/minha` — cadastro com representante legal, tipo de pessoa (PF/PJ, CNPJ único) e endereço; sempre derivada do usuário autenticado, nunca de parâmetro externo. Edição exige `ADMIN`.
- **Usuários:** `GET/POST /api/usuarios`, `GET/PATCH /api/usuarios/{id}`, `PATCH /api/usuarios/{id}/inativar`, `/reativar` e `/senha` (apenas `ADMIN`), além de `PATCH /api/usuarios/me/senha` (troca da própria senha). Perfis `ADMIN` e `OPERADOR`.
- **Produtos:** `GET /api/produtos?busca=&status=&categoria=&estoque=&promocao=&ordem=&pagina=&tamanho=` (paginado, `PaginaResponse`); `POST /api/produtos`, `GET/PATCH/DELETE /api/produtos/{id}` (o `{id}` é o **UUID público**), `PATCH /api/produtos/{id}/inativar` e `/reativar`, `GET /api/produtos/sku/sugestao` (próximo `P000001`, ADMIN) e `GET /api/produtos/sugestoes?campo=marca|fornecedor&termo=`; filtros `busca` (nome, nome curto, SKU ou qualquer código de barras) e `ativo`; `GET /api/produtos/{id}/historico-precos?pagina=&tamanho=` (custo e preço de venda, mais recente primeiro, máx. 100 por página). O produto aceita `promocao` (preço, início, fim) e `atacado` (preço, quantidade mínima); a resposta traz `promocao.situacao` e `emPromocao`, calculados no fuso `America/Sao_Paulo`.
- **Estoque (pacote `inventory`):** `POST /api/produtos/{id}/estoque/ajustes` (ADMIN; `{tipo, quantidade, motivo, observacao, chave}`; 201, ou 200 se a `chave` repetir) e `GET /api/produtos/{id}/estoque/movimentos?pagina=&tamanho=`. O produto traz `controlaEstoque`, `estoqueAtual` e `situacaoEstoque`; o cadastro aceita `estoqueInicial`.
- **Número, código e balança (Fase B2):** produtos e clientes trazem `numero` (sequencial por empresa, imutável, pelo `Numerador` em `shared/numeracao`); o produto aceita `codigo` (1 a 999999, único por empresa) e `vendidoBalanca`, e a `busca` só com dígitos também encontra por número e código. Etiqueta de balança (pacote `catalog/balanca`): `GET /api/etiqueta-balanca` e `POST /api/etiqueta-balanca/teste` (autenticado) e `PUT /api/etiqueta-balanca` (ADMIN).
- **Embalagens de venda (Fase B3):** o produto aceita `embalagens: [{id?, unidadeId, quantidade, preco?, deCompra, codigosBarras}]` (lista completa; no PATCH, ausente mantém) e devolve rótulo, preço efetivo e origem, custo, margem e markup de cada uma; os códigos de barras das embalagens ficam em `produto_codigos_barras` (`embalagem_id`). O ajuste de estoque aceita `embalagemId` em Entrada/Saída (quantidade em embalagens; o movimento guarda o retrato). Regras em `catalog/EmbalagensDoProduto`.
- **Custo na entrada por compra (Fase B4):** o ajuste ENTRADA + COMPRA exige `custo` (de 1 embalagem, quando em embalagem); o movimento guarda `custoInformado` e `custoUnitario`, o custo do produto passa a ser o último de entrada (`catalog/CustoDeEntrada`), o produto devolve `custoOrigem` e o histórico de preços traz `origem` e `entrada`.
  - **Escrita e exclusão:** exigem `ADMIN` (DEC-025).
  - **Isolamento:** por empresa; SKU e códigos de barras únicos por empresa (`409`, com `campos`).
  - **Códigos de barras:** até 20 por produto, com dígito verificador EAN-8/EAN-13/UPC-A validado; outros formatos aceitos como `OUTRO` (DEC-032).
  - **Exclusão física:** só se o produto nunca movimentou.
  - **Derivados:** margem/markup e `nomeCurtoEfetivo` calculados na resposta.
- **Unidades de medida:** `GET/POST /api/unidades`, `PATCH /api/unidades/{id}`, `/inativar`, `/reativar` e `DELETE` (só sem uso). 10 unidades padrão por empresa (UN, KG, G, L, ML, M, CX, PCT, DZ, FD). Escrita: `ADMIN` (DEC-031).
- **Marcas (árvore, Fase B5):** `/api/marcas`, com as mesmas regras e endpoints das categorias (pacote `catalog/marca`, árvore genérica em `catalog/arvore`). O produto recebe `marcaId` e devolve `marca: {id, nome, caminho}`.
- **Fornecedores (Fase B5, pacote `supplier`):** `GET /api/fornecedores?busca=&status=&pagina=&tamanho=` (paginado), `POST`, `GET/PATCH /{id}`, `/inativar`, `/reativar`, `DELETE` (só sem produtos e sem entradas), e `GET/POST /{id}/produtos` e `DELETE /{id}/produtos/{produtoId}`. Só a razão social é obrigatória; CNPJ/CPF validado e único; até 10 representantes e 200 marcas. O produto recebe `fornecedorIds` e `fornecedorUltimaCompraId`; o ajuste por compra aceita `fornecedorId`. Escrita só ADMIN.
- **Imagem do produto (Fase F, pacote `catalog/imagem`):** `PUT /api/produtos/{id}/imagem` (multipart `grande` + `miniatura`, WebP ou JPEG, só ADMIN) e `DELETE`; o produto devolve `imagem` com URLs assinadas; `GET /api/imagens/produtos/{id}/{versao}/{tamanho}?expira=&assinatura=` é pública e conferida por HMAC (`GEITUS_IMAGEM_SEGREDO`).
- **Categorias (árvore):** `GET/POST /api/categorias`, `PATCH /api/categorias/{id}` (renomear e mover, sem ciclos), `/inativar`, `/reativar` e `DELETE` (só sem subcategorias e produtos). A listagem é plana com `caminho` ("Ração › Úmida › Sachê"). Escrita: `ADMIN`.
- **Produto** passa a referenciar unidade de venda (obrigatória), categoria e unidade de compra + fator de conversão (`unidadeId`, `categoriaId`, `unidadeCompraId`, `fatorConversao`).
- **Clientes:** `GET/POST /api/clientes`, `GET/PATCH /api/clientes/{id}`, `PATCH /api/clientes/{id}/inativar` e `/reativar`, com filtros opcionais `busca` (nome, CPF ou telefone, com ou sem máscara) e `ativo`. O `{id}` é o **UUID público** (o id interno nunca é exposto). Cadastrar/editar: qualquer autenticado; inativar/reativar: `ADMIN` (DEC-029). CPF único por empresa (`409`); identificador malformado → `400`.
- Segurança liberando os health checks (`/api/health`, `/actuator/health`), o `POST /api/auth/login` e a documentação Swagger; qualquer outra rota exige um JWT válido (responde `401` sem token/token inválido e `403` sem permissão).
- Documentação da API via Swagger UI (apenas para desenvolvimento).

### O que ainda NÃO existe (próximas etapas)

- Vínculo M:N usuário↔empresa e seleção de empresa ativa (DEC-024 — norte futuro).
- Refresh token, recuperação de senha, MFA, OAuth/SSO, RBAC granular (fora do escopo do MVP).
- PDV, caixa, estoque e financeiro.

---

## Estrutura de pacotes

```text
com.geitus.app
├── config/     # Configurações (segurança, CORS, OpenAPI)
├── shared/     # Health check, ApiError e tratamento global de erros
├── iam/        # Identidade e acesso: login, JWT, usuário, bootstrap dev
├── company/    # Empresa (cadastro da empresa autenticada)
├── catalog/    # Produtos (+ unidade/ e categoria/)
└── customer/   # Clientes
```

Validadores compartilhados de CPF, CNPJ e telefone ficam em `shared/validation`.

Organização **por domínio de negócio**. Domínios futuros (`pricing`, `customer`, `inventory`, `cashier`, `sales`, `finance`, `fiscal`, `commission`) nascem quando o módulo entrar em desenvolvimento — ver o mapa completo no `CLAUDE.md`.

As migrations do banco ficam em `src/main/resources/db/migration`.

---

## Pré-requisitos

- **JDK 21** instalado e ativo (`java -version` deve indicar a versão 21). O `maven-enforcer` interrompe o build em qualquer outra versão.
- **PostgreSQL** em execução — necessário apenas para rodar a aplicação (`spring-boot:run`).
- **Docker** em execução — necessário para os testes de integração (`*IT`, Testcontainers) executados no `verify`.
- Não é preciso instalar o Maven: o projeto usa o Maven Wrapper.

---

## Configuração (variáveis de ambiente)

Nenhum dado sensível fica no código. A aplicação lê as variáveis abaixo (todas têm um valor padrão para desenvolvimento local):

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `DATABASE_URL` | `jdbc:postgresql://localhost:5432/geitus_db` | URL de conexão do PostgreSQL |
| `POSTGRES_USER` | `geitus` | Usuário do banco |
| `POSTGRES_PASSWORD` | `geitus` | Senha do banco |
| `SERVER_PORT` | `8080` | Porta da API |
| `GEITUS_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Origens liberadas no CORS (separadas por vírgula) |
| `JWT_SECRET` | *(vazio)* | Segredo do JWT (HS256). **Obrigatório**: mínimo 32 bytes / 256 bits, senão a aplicação não sobe |
| `JWT_EXPIRATION` | `86400000` | Expiração do token JWT em milissegundos |
| `GEITUS_IMAGEM_SEGREDO` | *(vazio)* | Segredo do HMAC-SHA256 das URLs assinadas das imagens dos produtos. **Obrigatório**: mínimo 32 bytes, diferente do `JWT_SECRET` e diferente do valor de exemplo do `.env.example`, senão a aplicação não sobe |

### Bootstrap de usuário admin de desenvolvimento (opcional)

Estas variáveis criam, de forma **idempotente**, um usuário administrador local ao subir a aplicação. Servem apenas para desenvolvimento; nenhuma senha fica no código.

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `GEITUS_BOOTSTRAP_DEV_ADMIN` | *(desligado)* | Habilita o bootstrap quando o valor é `true` (mapeada para a property `geitus.bootstrap.dev-admin`) |
| `GEITUS_DEV_ADMIN_EMAIL` | *(vazio)* | E-mail do admin de desenvolvimento |
| `GEITUS_DEV_ADMIN_PASSWORD` | *(vazio)* | Senha do admin (usada apenas para gerar o hash BCrypt) |
| `GEITUS_DEV_ADMIN_NAME` | `Administrador` | Nome do admin |
| `GEITUS_DEV_COMPANY_NAME` | `Empresa de Desenvolvimento` | Nome da empresa (tenant) criada para o admin |

Consulte o arquivo `.env.example` na raiz do repositório para um modelo de configuração.

---

## Como executar

Os comandos abaixo usam o Maven Wrapper. No **Windows (PowerShell/CMD)** use `mvnw.cmd`; em **Git Bash / Linux / macOS** use `./mvnw`.

### Rodar os testes unitários

Não precisa de banco nem de Docker (fatias web e mocks):

```bash
./mvnw test
```

### Build completo (compila, testa e empacota)

Inclui os testes de integração (`*IT`, ex.: `ProdutoRepositoryIT`, `ClienteRepositoryIT`), que sobem um PostgreSQL real via Testcontainers — **requer Docker em execução**:

```bash
./mvnw verify
```

### Subir a aplicação

Requer um PostgreSQL acessível conforme as variáveis de ambiente.

**Windows (recomendado):** a partir da raiz do repositório, o script carrega o `.env` e sobe o backend:

```powershell
.\scripts\dev-backend.ps1
```

O script:

- lê o `.env` da raiz (ou outro arquivo via `-EnvFile <caminho>`) sem exibir valores;
- aplica as variáveis apenas durante a execução e restaura o ambiente do terminal ao sair;
- verifica se o Java ativo é o 21 — se a máquina tiver outro JDK como padrão, defina `JAVA_HOME` no próprio `.env`;
- repassa argumentos extras ao Maven — use aspas quando o argumento tiver ponto, senão o PowerShell o divide (ex.: `.\scripts\dev-backend.ps1 '-Dspring-boot.run.profiles=dev'`).

Se a política de execução do PowerShell bloquear scripts, rode `powershell -ExecutionPolicy Bypass -File .\scripts\dev-backend.ps1`.

**Git Bash / Linux / macOS:**

```bash
cd backend
set -a && source ../.env && set +a
./mvnw spring-boot:run
```

Com a aplicação no ar, valide os health checks:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/actuator/health
```

Resposta esperada do `GET /api/health`:

```json
{ "status": "UP", "aplicacao": "Geitus", "timestamp": "..." }
```

O `GET /actuator/health` retorna o health check padrão do Spring Boot Actuator (`{ "status": "UP" }`), sem detalhes internos.

---

## Autenticação (Etapa 5)

A autenticação usa JWT (HS256) com senha em hash BCrypt. Requer PostgreSQL rodando e um `JWT_SECRET` com no mínimo 32 bytes.

### 1. Criar um usuário para testar

Em desenvolvimento, use o bootstrap do admin: defina `GEITUS_BOOTSTRAP_DEV_ADMIN=true` e as variáveis `GEITUS_DEV_ADMIN_*` no `.env` e suba com `.\scripts\dev-backend.ps1`. Equivalente manual (Git Bash):

```bash
export JWT_SECRET="um-segredo-forte-com-no-minimo-32-bytes-aqui"
export GEITUS_BOOTSTRAP_DEV_ADMIN=true
export GEITUS_DEV_ADMIN_EMAIL="admin@geitus.dev"
export GEITUS_DEV_ADMIN_PASSWORD="troque-esta-senha"
./mvnw spring-boot:run
```

Ao subir, a aplicação cria a empresa e o usuário admin (se ainda não existirem). Rodar de novo não duplica nada.

### 2. Obter um token via login

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@geitus.dev","senha":"troque-esta-senha"}'
```

Resposta (200):

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "usuario": {
    "id": 1,
    "nome": "Administrador",
    "email": "admin@geitus.dev",
    "perfil": "ADMIN",
    "empresa": { "id": 1, "nome": "Empresa de Desenvolvimento", "ativo": true, "criadoEm": "...", "atualizadoEm": null }
  }
}
```

Credencial inválida (senha errada, usuário inexistente ou inativo) → `401` com mensagem genérica `"Credenciais inválidas."` (não revela se o e-mail existe). Campos vazios/inválidos → `400` com a lista de `campos`.

### 3. Consumir uma rota protegida

```bash
curl http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer <TOKEN>"
```

Sem token, ou com token expirado/adulterado, a rota responde `401`.

### Swagger UI (apenas desenvolvimento)

Com a aplicação no ar: `http://localhost:8080/swagger-ui.html` (OpenAPI em `http://localhost:8080/v3/api-docs`). Use o botão **Authorize** para informar o token JWT. O Swagger é liberado apenas nesta fase de desenvolvimento e **não deve ser exposto em produção** sem decisão futura (ver DEC-012).

---

## Banco de dados (PostgreSQL)

Exemplo rápido para subir um PostgreSQL local com Docker (opcional):

```bash
docker run --name geitus-postgres \
  -e POSTGRES_DB=geitus_db \
  -e POSTGRES_USER=geitus \
  -e POSTGRES_PASSWORD=<senha-do-.env> \
  -p 5432:5432 -d postgres:16
```

Ao iniciar a aplicação, o Flyway aplica automaticamente as migrations de `db/migration`.
