package com.geitus.app.cashier.sessao;

import java.util.Collection;
import java.util.List;

import org.springframework.data.repository.Repository;

/**
 * Contagens por forma das sessoes, sempre filtradas pela empresa (DEC-016). So
 * insercao e leitura: o banco recusa alterar e apagar.
 */
interface ContagemDeCaixaPorFormaRepository extends Repository<ContagemDeCaixaPorForma, Long> {

    ContagemDeCaixaPorForma saveAndFlush(ContagemDeCaixaPorForma contagem);

    List<ContagemDeCaixaPorForma> findByEmpresaIdAndSessaoCaixaId(Long empresaId, Long sessaoCaixaId);

    /** As contagens das sessoes de uma pagina do historico, numa consulta. */
    List<ContagemDeCaixaPorForma> findByEmpresaIdAndSessaoCaixaIdIn(Long empresaId, Collection<Long> sessaoIds);
}
