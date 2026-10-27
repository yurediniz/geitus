# Clientes

## 1. Objetivo

Cadastro rápido de **pessoa física** que compra da empresa, para identificar (opcionalmente) o cliente na venda do PDV. O cliente é opcional na venda e o operador cadastra no balcão em segundos. Decisão: DEC-029.

## 2. Regras de negócio

1. O cliente pertence a uma empresa, sempre derivada do usuário autenticado (nenhuma rota aceita `empresaId`). Cliente inexistente ou de outra empresa → **404**.
2. **Nome** obrigatório (até 150).
3. **CPF, telefone e WhatsApp** são opcionais; quando informados, devem ser válidos (CPF por dígitos verificadores; telefone fixo com 10 dígitos ou celular com 11, DDD válido), senão **400** com `campos`.
4. **CPF único por empresa** quando informado: duplicado → **409**, inclusive na corrida concorrente (DEC-026). Telefone e WhatsApp **não** são únicos.
5. **WhatsApp sem duplicar dado:**
   - `telefoneEWhatsapp` (padrão `true`) indica que o telefone é WhatsApp;
   - com `true`, qualquer `whatsapp` enviado é descartado sem validação;
   - com `false`, o `whatsapp` é validado;
   - `whatsapp` igual ao telefone vira `telefoneEWhatsapp = true`;
   - a resposta expõe o `whatsapp` **resolvido**: o telefone quando `true`, a coluna própria quando `false`, e `null` sem telefone.
6. **Normalização no service:** `trim`; string vazia vira `NULL`; CPF e telefones gravados só com dígitos (máscara aceita na entrada).
7. **Nº do cliente:** sequencial por empresa (1, 2, 3…), gerado na criação pelo `Numerador`, imutável e nunca reaproveitado (DEC-036). Se o cadastro falha, o rollback devolve o número.
8. **UUID público:** gerado na aplicação na criação, imutável e usado nas rotas. O id numérico nunca é exposto (DEC-019). UUID malformado → **400** "Identificador inválido." (handler global, sem ecoar o valor).
9. **Perfis:**
   - cadastrar e editar: qualquer autenticado (o OPERADOR cadastra no balcão);
   - inativar e reativar: só **ADMIN**, independentemente do método HTTP (OPERADOR → 403).
10. **Sem exclusão física** (não há DELETE). O cliente inativo continua consultável, mas **não** é oferecido na identificação do PDV.
11. **PATCH substitui todos os dados cadastrais:** campos opcionais omitidos ou vazios viram `NULL`. `ativo` só muda por inativar/reativar.
12. **Limites de entrada:** `nome` 150, `observacoes` 500, `cpf`/`telefone`/`whatsapp` 20 caracteres brutos, `busca` 100. Acima disso, 400.
13. **Busca:** nome contém o termo (sem diferenciar maiúsculas); se o termo tiver dígitos, também CPF, telefone ou WhatsApp contendo esses dígitos. `%` e `_` são escapados. Ordem por nome e id.
14. **CPF é dado pessoal:** nunca em log, nunca em segmento de rota (o `caminho` do erro guarda a URI), nunca fora da própria empresa.

## 3. Contrato da API

| Método | Rota | Perfil | Observação |
|---|---|---|---|
| GET | `/api/clientes` | autenticado | Filtros `busca` e `ativo`; lista completa da empresa (sem paginação, DT-020) |
| GET | `/api/clientes/{id}` | autenticado | 400 UUID inválido; 404 |
| POST | `/api/clientes` | autenticado | 201; 400 com `campos`; 409 CPF duplicado |
| PATCH | `/api/clientes/{id}` | autenticado | 200; 400; 404; 409 |
| PATCH | `/api/clientes/{id}/inativar` | ADMIN | 403 OPERADOR; 404 |
| PATCH | `/api/clientes/{id}/reativar` | ADMIN | 403 OPERADOR; 404 |

- Request: `nome`, `cpf`, `telefone`, `telefoneEWhatsapp`, `whatsapp`, `observacoes`.
- Response: `id` (UUID), `numero`, `nome`, `cpf`, `telefone`, `telefoneEWhatsapp`, `whatsapp` (resolvido), `observacoes`, `ativo`, `criadoEm`, `atualizadoEm`.

## 4. Dados

Tabela `clientes` (**V5**):
- `uq_cliente_uuid`;
- `uq_cliente_empresa_cpf (empresa_id, cpf)`: vários `NULL` não colidem;
- `ck_cliente_whatsapp_coerente`;
- CHECKs de só dígitos em CPF (11) e em telefone e WhatsApp (10–11);
- índice `idx_cliente_empresa_nome`.

Depois:
- **V11:** `numero` com `uq_cliente_empresa_numero` e `numero >= 1`;
- **V17:** `uq_cliente_empresa_id (empresa_id, id)`, para a FK composta da venda.

Os validadores de CPF, CNPJ e telefone ficam em `shared.validation`, compartilhados com Empresa e Fornecedores.

## 5. Telas

- `/clientes`, para todos os perfis. A lista tem busca única (nome, CPF ou telefone), filtro de status (padrão: ativos), telefone formatado com indicação de WhatsApp e o Nº.
- **Formulário rápido** (React Hook Form + Zod espelhando o backend), nesta ordem:
  1. Nome (foco inicial);
  2. Telefone com "Este número é WhatsApp" (marcado); desmarcando, aparece o campo WhatsApp;
  3. CPF e Observações.
- Máscaras de CPF e telefone. Inativar/reativar só aparecem para ADMIN.
- Feedback discreto ("Cliente salvo", "Cliente inativado", "CPF já cadastrado para outro cliente").

## 6. Fora do escopo e pendências

- Fora:
  - pessoa jurídica;
  - endereço, e-mail e data de nascimento;
  - histórico de compras, crédito/fiado;
  - CRM e marketing;
  - importação e mesclagem de duplicados;
  - auditoria de alterações além dos carimbos.
- Pendências:
  - DT-020 (paginação);
  - DT-023 (CPF completo na listagem, LGPD);
  - índice de busca textual se o volume crescer.
