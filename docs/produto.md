# Produto — Geitus

Visão, princípios e diretrizes de experiência. Ler em tarefas de tela, fluxo ou decisão de produto. Regras de engenharia e de trabalho ficam no [`CLAUDE.md`](../CLAUDE.md); regras de cada módulo, em [`docs/modules/`](modules/).

## Missão e visão

- **Missão:** tornar simples a gestão do negócio por meio da tecnologia.
- **Visão:** ser a plataforma de gestão mais intuitiva e confiável para pequenos negócios do Brasil.
- **Público inicial:** mercados, pet shops e lojas de roupas. Base única, preparada para pequenas adaptações por segmento no futuro.

O Geitus não quer ser o ERP com mais funcionalidades. Quer fazer o essencial muito bem: experiência superior, confiabilidade e inteligência prática. Primeiro funcionar bem, depois ficar mais completo, depois escalar.

## Princípios de produto

- **Simplicidade:** fácil de entender e operar; o complexo é simplificado na experiência.
- **Confiabilidade:** os dados do negócio são patrimônio do cliente; estoque, vendas, caixa e financeiro são consistentes e rastreáveis.
- **Fluidez:** respostas rápidas, previsíveis e agradáveis.
- **Inteligência:** reduzir esforço, evitar retrabalho, sugerir caminhos úteis.
- **Experiência contextual:**
  - PDV: máxima agilidade, scanner, teclado e poucos cliques;
  - dashboard: leitura rápida e boa hierarquia visual;
  - cadastros: orientação, validação, campos essenciais primeiro, menos digitação;
  - financeiro: segurança, organização e confiança.

## Princípios de UX

- O usuário nunca fica sem saber o que aconteceu.
- A informação mais importante aparece primeiro.
- Integrar informações e reduzir digitação; o sistema calcula tudo o que pode ser derivado (total, desconto, troco, margem, saldo, estoque atual).
- Reduzir erros, não apenas alertar sobre eles.
- Funcionar para iniciantes e para experientes; ações frequentes com o menor número de cliques.
- Componentes semelhantes se comportam da mesma forma.
- Campos avançados ficam ocultos ou agrupados.

## Visual e interações

O Geitus deve parecer simples, moderno, confiável, leve, organizado e profissional.

Evitar: visual de ERP antigo, excesso de campos, tabelas confusas, modais desnecessários, cores agressivas, animações lentas, telas carregadas.

Toda ação importante gera feedback visual claro e discreto (produto salvo, item adicionado, venda finalizada, caixa aberto/fechado, erro de validação, estoque insuficiente). Microinterações só quando reforçam clareza, confiança ou fluidez — nunca atrasam fluxos operacionais nem a velocidade do PDV.

## Regras gerais de negócio

- **Exclusão:** preferir inativar, arquivar, cancelar ou estornar. Nunca apagar dados que impactem vendas, estoque, caixa, financeiro ou auditoria.
- **Histórico:** ações críticas são rastreáveis (criação de produto, alteração de preço e de estoque, venda finalizada ou cancelada, abertura e fechamento de caixa, entradas e saídas financeiras).
- **Consistência:** cadastrar uma vez e reutilizar; evitar duplicidade.

## Módulos sem spec ainda

- **Financeiro básico:** receitas, despesas, fluxo de caixa básico, movimentações originadas por vendas e movimentações manuais. Sem contabilidade complexa.
- **Dashboard e relatórios básicos:** a definir em spec própria antes de implementar.

Os demais módulos já têm spec em [`docs/modules/`](modules/).
