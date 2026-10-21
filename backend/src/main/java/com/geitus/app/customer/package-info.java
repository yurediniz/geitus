/**
 * Modulo de clientes do Geitus.
 *
 * <p>Cadastro de clientes pessoa fisica, isolado por empresa (DEC-016). O
 * cliente e identificado publicamente pelo {@code uuid} (DEC-019/029); a PK
 * interna nunca e exposta. CPF opcional e unico por empresa; telefone principal
 * com indicador de WhatsApp e WhatsApp proprio apenas quando o numero difere.
 *
 * <p>Componentes:
 * <ul>
 *   <li>{@link com.geitus.app.customer.Cliente} e
 *       {@link com.geitus.app.customer.ClienteRepository} — entidade e acesso
 *       a dados (tabela {@code clientes}, migration V5);</li>
 *   <li>{@link com.geitus.app.customer.ClienteService} — regras de negocio:
 *       normalizacao, CPF unico por empresa, WhatsApp derivado e busca;</li>
 *   <li>{@link com.geitus.app.customer.ClienteController} — API
 *       {@code /api/clientes} com DTOs em {@code customer.dto}; inativar e
 *       reativar exigem ADMIN (DEC-029, no {@code SecurityConfig});</li>
 *   <li>Excecoes mapeadas no {@code GlobalExceptionHandler}:
 *       {@link com.geitus.app.customer.ClienteNaoEncontradoException} (404),
 *       {@link com.geitus.app.customer.ClienteConflitoException} (409) e
 *       {@link com.geitus.app.customer.DadosClienteInvalidosException} (400).</li>
 * </ul>
 *
 * <p>CPF e dado pessoal: nunca e logado nem incluido em mensagens de erro.
 * Ver CLAUDE.md, docs/modules/clientes.md e DEC-029.
 */
package com.geitus.app.customer;
