package com.geitus.app.cashier;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.geitus.app.cashier.sessao.StatusDaSessao;
import com.geitus.app.iam.UsuarioAutenticado;

/**
 * Leituras das sessoes de caixa que o PDV mostra nas vendas
 * (docs/modules/pdv.md): o ponto, a situacao (para o {@code podeCancelar})
 * e a sessao atual do usuario (o filtro padrao da lista). Declarada aqui e
 * implementada no {@code cashier}; o {@code empresaId} e sempre o do usuario
 * autenticado (DEC-016).
 */
public interface SessoesParaVendas {

    /** Sessao vista pelo PDV: ids interno e publico, ponto, situacao e quem abriu. */
    record SessaoParaVenda(Long id, UUID uuid, String pontoNome, StatusDaSessao status, Long abertaPor) {

        public boolean aberta() {
            return status == StatusDaSessao.ABERTA;
        }
    }

    /** A sessao {@code ABERTA} ou {@code EM_CONFERENCIA} aberta pelo usuario. */
    Optional<SessaoParaVenda> atualDoUsuario(UsuarioAutenticado usuario);

    Optional<SessaoParaVenda> porUuid(Long empresaId, UUID sessaoId);

    /** As sessoes da empresa com estes ids internos, numa consulta; id de outra empresa fica fora. */
    Map<Long, SessaoParaVenda> porIds(Long empresaId, Collection<Long> sessaoIds);
}
