# ERPell — Backend

Backend do **ERPell**, a plataforma SaaS de gestão da **UpeFlow**. Contém a aplicação Spring Boot com **autenticação por JWT**, o contexto de **Empresa** do usuário autenticado e o módulo inicial de **Produtos**, além dos health checks. Os demais módulos de negócio (clientes, PDV, caixa, estoque, financeiro) ainda não foram implementados.

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
- Flyway habilitado, com uma migration inicial (`V1__baseline.sql`) apenas para validação.
- Health check da aplicação em `GET /api/health` e health check padrão do Actuator em `GET /actuator/health`.
- CORS básico liberado para o frontend local (Vite).
- **Autenticação:** login por e-mail/senha (BCrypt) com emissão de JWT (HS256), filtro de autenticação por Bearer token e endpoint de dados do usuário autenticado (`GET /api/auth/me`, com a empresa aninhada).
- **Empresa:** `GET/PATCH /api/empresas/minha` — sempre derivada do usuário autenticado, nunca de parâmetro externo.
- **Produtos:** `GET/POST /api/produtos`, `GET/PATCH /api/produtos/{id}`, `PATCH /api/produtos/{id}/inativar` e `/reativar`, com filtros opcionais `busca` e `ativo`; isolamento por empresa e unicidade de SKU/código de barras por empresa.
- Segurança liberando os health checks (`/api/health`, `/actuator/health`), o `POST /api/auth/login` e a documentação Swagger; qualquer outra rota exige um JWT válido (responde `401` sem token/token inválido e `403` sem permissão).
- Documentação da API via Swagger UI (apenas para desenvolvimento).

### O que ainda NÃO existe (próximas etapas)

- CRUD de usuários e módulo Empresa completo (existe apenas o mínimo para autenticar e editar o nome).
- Refresh token, recuperação de senha, MFA, OAuth/SSO, RBAC avançado (fora do escopo do MVP).
- Clientes, PDV, caixa, estoque e financeiro.

---

## Estrutura de pacotes

```text
com.upeflow.erpell
├── config/          # Configurações (segurança, CORS, OpenAPI)
├── auth/            # Autenticação (login, JWT, bootstrap dev)
├── company/         # Empresa (contexto da empresa autenticada)
├── user/            # Usuários (entidade mínima para autenticação)
├── product/         # Produtos (CRUD inicial)
├── customer/        # Clientes (etapa futura)
├── sale/            # Vendas / PDV (etapa futura)
├── cashregister/    # Caixa (etapa futura)
├── stock/           # Estoque (etapa futura)
├── finance/         # Financeiro (etapa futura)
└── shared/          # Componentes compartilhados (inclui o health check)
```

As migrations do banco ficam em `src/main/resources/db/migration`.

---

## Pré-requisitos

- **JDK 21** instalado e ativo (`java -version` deve indicar a versão 21).
- **PostgreSQL** em execução — necessário apenas para rodar a aplicação (`bootRun`), não para compilar ou testar.
- Não é preciso instalar o Maven: o projeto usa o Maven Wrapper.

---

## Configuração (variáveis de ambiente)

Nenhum dado sensível fica no código. A aplicação lê as variáveis abaixo (todas têm um valor padrão para desenvolvimento local):

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `DATABASE_URL` | `jdbc:postgresql://localhost:5432/erpell` | URL de conexão do PostgreSQL |
| `POSTGRES_USER` | `erpell` | Usuário do banco |
| `POSTGRES_PASSWORD` | `erpell` | Senha do banco |
| `SERVER_PORT` | `8080` | Porta da API |
| `ERPELL_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Origens liberadas no CORS (separadas por vírgula) |
| `JWT_SECRET` | *(vazio)* | Segredo do JWT (HS256). **Obrigatório**: mínimo 32 bytes / 256 bits, senão a aplicação não sobe |
| `JWT_EXPIRATION` | `86400000` | Expiração do token JWT em milissegundos |

### Bootstrap de usuário admin de desenvolvimento (opcional)

Estas variáveis criam, de forma **idempotente**, um usuário administrador local ao subir a aplicação. Servem apenas para desenvolvimento; nenhuma senha fica no código.

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `ERPELL_BOOTSTRAP_DEV_ADMIN` | *(desligado)* | Habilita o bootstrap quando o valor é `true` (mapeada para a property `erpell.bootstrap.dev-admin`) |
| `ERPELL_DEV_ADMIN_EMAIL` | *(vazio)* | E-mail do admin de desenvolvimento |
| `ERPELL_DEV_ADMIN_PASSWORD` | *(vazio)* | Senha do admin (usada apenas para gerar o hash BCrypt) |
| `ERPELL_DEV_ADMIN_NAME` | `Administrador` | Nome do admin |
| `ERPELL_DEV_COMPANY_NAME` | `Empresa de Desenvolvimento` | Nome da empresa (tenant) criada para o admin |

Consulte o arquivo `.env.example` na raiz do repositório para um modelo de configuração.

---

## Como executar

Os comandos abaixo usam o Maven Wrapper. No **Windows (PowerShell/CMD)** use `mvnw.cmd`; em **Git Bash / Linux / macOS** use `./mvnw`.

### Rodar os testes

Não precisa de banco de dados — os testes usam uma fatia web:

```bash
./mvnw test
```

### Build completo (compila, testa e empacota)

```bash
./mvnw verify
```

### Subir a aplicação

Requer um PostgreSQL acessível conforme as variáveis de ambiente:

```bash
./mvnw spring-boot:run
```

Com a aplicação no ar, valide os health checks:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/actuator/health
```

Resposta esperada do `GET /api/health`:

```json
{ "status": "UP", "aplicacao": "ERPell", "timestamp": "..." }
```

O `GET /actuator/health` retorna o health check padrão do Spring Boot Actuator (`{ "status": "UP" }`), sem detalhes internos.

---

## Autenticação (Etapa 5)

A autenticação usa JWT (HS256) com senha em hash BCrypt. Requer PostgreSQL rodando e um `JWT_SECRET` com no mínimo 32 bytes.

### 1. Criar um usuário para testar

Em desenvolvimento, use o bootstrap do admin. Exemplo (Git Bash):

```bash
export JWT_SECRET="um-segredo-forte-com-no-minimo-32-bytes-aqui"
export ERPELL_BOOTSTRAP_DEV_ADMIN=true
export ERPELL_DEV_ADMIN_EMAIL="admin@erpell.dev"
export ERPELL_DEV_ADMIN_PASSWORD="troque-esta-senha"
./mvnw spring-boot:run
```

Ao subir, a aplicação cria a empresa e o usuário admin (se ainda não existirem). Rodar de novo não duplica nada.

### 2. Obter um token via login

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@erpell.dev","senha":"troque-esta-senha"}'
```

Resposta (200):

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "usuario": {
    "id": 1,
    "nome": "Administrador",
    "email": "admin@erpell.dev",
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
docker run --name erpell-postgres \
  -e POSTGRES_DB=erpell \
  -e POSTGRES_USER=erpell \
  -e POSTGRES_PASSWORD=erpell \
  -p 5432:5432 -d postgres:16
```

Ao iniciar a aplicação, o Flyway aplica automaticamente as migrations de `db/migration`.
