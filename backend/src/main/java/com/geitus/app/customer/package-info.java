/**
 * Modulo de clientes do Geitus.
 *
 * <p>Cadastro de clientes pessoa fisica, isolado por empresa (DEC-016). O
 * cliente e identificado publicamente pelo {@code uuid} (DEC-019/029); a PK
 * interna nunca e exposta. CPF opcional e unico por empresa; telefone principal
 * com indicador de WhatsApp e WhatsApp proprio apenas quando o numero difere.
 * Ver CLAUDE.md, docs/modules/clientes.md e DEC-029.
 */
package com.geitus.app.customer;
