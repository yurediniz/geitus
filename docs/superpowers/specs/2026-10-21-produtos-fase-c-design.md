# Design — Evolução do cadastro de produtos · Fase C (Preços)

**Data:** 2026-10-21
**Status:** Implementado em 2026-10-21 (plano: `docs/superpowers/plans/2026-10-21-produtos-fase-c.md`)
**Spec canônica:** [`docs/modules/produtos-precos.md`](../../modules/produtos-precos.md) · Decisão: DEC-033

## Escopo da fase
Item §5 (Preços) do pedido de evolução (DEC-030) e a aba Histórico do formulário (§9), só com preços.

## Decisões do usuário (2026-10-21)

| Tema | Escolha |
|---|---|
| Vigência da promoção | **Por datas**, início e fim obrigatórios (dias inteiros, inclusivos) |
| Promoção vigente + atacado atingido | **Vale o menor preço** |
| Faixas de atacado | **Uma** (preço + quantidade mínima) |
| O que o histórico registra | **Custo e preço de venda**, incluindo os valores iniciais do cadastro |
| Máscara de dinheiro | **Preenche da direita para a esquerda durante a digitação** (1234 → 12,34) |

## Decisões do CTO (revisáveis na spec)
- **Promoção e atacado como colunas em `produtos`**, já que há uma promoção e uma faixa por produto. Tabelas próprias seriam preparar um futuro (agendar várias promoções) que ninguém pediu.
- **Histórico em tabela específica** (`produto_historico_precos`), só de inserção e com valores numéricos, em vez de uma auditoria genérica com valores em texto.
- **Sem histórico retroativo:** ele começa na V8, e nada de dado inventado para produtos antigos.
- **Promoção e atacado precisam ser menores que o preço de venda e não podem ficar abaixo do preço mínimo** (validado no service, como o preço mínimo hoje).
- **Promoção encerrada pode ser salva**, sem validar "fim ≥ hoje", para não bloquear a edição de outros campos.
- **Quantidade mínima do atacado > 1**, inteira quando a unidade não é fracionada.
- **Fuso fixo `America/Sao_Paulo`**, lido de um `Clock` injetável.
- **Margem → preço só no frontend**, sem gravar a margem desejada.
- **Regra do preço aplicado como domínio, sem endpoint**: o PDV vai consumi-la no backend.
- **`promocao`/`atacado` nulos no PATCH removem**, como os demais opcionais. A exceção de `codigosBarras` da Fase B não se estende a eles.
- **Leitura do histórico liberada a qualquer autenticado**, igual ao produto. A restrição de custo por perfil fica para o PDV e os relatórios.
- **Lógica do `CampoMoeda` em `lib/moeda.ts`**, reutilizável por Caixa e PDV.
