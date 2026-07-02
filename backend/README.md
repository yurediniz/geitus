# ERPell — Backend

Backend do **ERPell**, a plataforma SaaS de gestão da **UpeFlow**. Esta é a **base inicial**: sobe a aplicação Spring Boot, uma configuração mínima de segurança e um endpoint de health check. Os módulos de negócio ainda **não** foram implementados.

---

## Stack

- Java 21 LTS
- Spring Boot 3.5.x (Spring Web, Spring Data JPA, Spring Security, Bean Validation)
- Flyway (migrations)
- PostgreSQL (driver)
- Maven 3.9.16 via Maven Wrapper
- JWT (dependências preparadas para a etapa futura de autenticação — ainda não utilizadas)

---

## O que já existe nesta etapa

- Projeto Spring Boot configurado para Java 21.
- Maven Wrapper (`mvnw` / `mvnw.cmd`) fixado no Maven 3.9.16.
- Estrutura de pacotes por domínio (ver abaixo).
- `application.yml` lendo configurações de variáveis de ambiente.
- Flyway habilitado, com uma migration inicial (`V1__baseline.sql`) apenas para validação.
- Health check da aplicação em `GET /api/health` e health check padrão do Actuator em `GET /actuator/health`.
- CORS básico liberado para o frontend local (Vite).
- Segurança liberando **apenas** os health checks (`/api/health` e `/actuator/health`); qualquer outra rota exige autenticação (ainda não implementada, portanto responde `401`).

### O que ainda NÃO existe (próximas etapas)

- Autenticação completa (login, JWT, usuários).
- Entidades e regras de negócio (produtos, clientes, PDV, caixa, estoque, financeiro).

---

## Estrutura de pacotes

```text
com.upeflow.erpell
├── config/          # Configurações (segurança, CORS)
├── auth/            # Autenticação (etapa futura)
├── company/         # Empresa (etapa futura)
├── user/            # Usuários (etapa futura)
├── product/         # Produtos (etapa futura)
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
| `JWT_SECRET` | *(vazio)* | Segredo do JWT (uso na etapa futura) |
| `JWT_EXPIRATION` | `86400000` | Expiração do token JWT em milissegundos (uso futuro) |

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
