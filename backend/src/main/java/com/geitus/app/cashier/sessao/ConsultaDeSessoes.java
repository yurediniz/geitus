package com.geitus.app.cashier.sessao;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;

/**
 * Historico das sessoes de caixa (docs/modules/caixa.md, 5.2): a pagina, da
 * sessao aberta mais recente para a mais antiga, e o total que passa nos
 * filtros.
 *
 * <p>So entram na consulta os filtros informados, em vez de
 * {@code (:filtro IS NULL OR ...)}: com o parametro nulo, o PostgreSQL nao
 * consegue inferir o tipo ("could not determine data type of parameter"), a
 * mesma licao do {@code ProdutoRepository}. O JPQL e montado SO com as
 * constantes desta classe e todo valor vai como parametro nomeado.
 *
 * <p>Sempre filtrada por {@code s.empresaId} (DEC-016).
 */
@Repository
class ConsultaDeSessoes {

    private static final String SELECAO = "SELECT s FROM SessaoDeCaixa s";
    private static final String CONTAGEM = "SELECT count(s) FROM SessaoDeCaixa s";
    private static final String DA_EMPRESA = " WHERE s.empresaId = :empresaId";
    private static final String ABERTA_POR = " AND s.abertaPor = :abertaPor";
    private static final String DO_PONTO = " AND s.ponto.id = :pontoId";
    private static final String COM_STATUS = " AND s.status = :status";
    private static final String DESDE = " AND s.abertaEm >= :inicio";
    private static final String ANTES_DE = " AND s.abertaEm < :fim";
    private static final String ORDEM = " ORDER BY s.abertaEm DESC, s.id DESC";

    private final EntityManager entityManager;

    ConsultaDeSessoes(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /**
     * Criterios ja resolvidos: {@code abertaPor} restringe as sessoes do
     * OPERADOR; o periodo e meio aberto, {@code [inicio, fim)}. Cada criterio
     * {@code null} fica de fora.
     */
    record Criterios(Long empresaId, Long abertaPor, Long pontoId, StatusDaSessao status, OffsetDateTime inicio,
            OffsetDateTime fim) {
    }

    /** Sessoes da pagina e o total. */
    record PaginaDeSessoes(List<SessaoDeCaixa> sessoes, long total) {
    }

    /** {@code pagina} a partir de 0 e {@code tamanho} ja validados ({@code Paginacao}). */
    PaginaDeSessoes buscar(Criterios criterios, int pagina, int tamanho) {
        Map<String, Object> parametros = new HashMap<>();
        String condicoes = condicoes(criterios, parametros);

        TypedQuery<Long> contagem = entityManager.createQuery(CONTAGEM + condicoes, Long.class);
        parametros.forEach(contagem::setParameter);
        long total = contagem.getSingleResult();
        long deslocamento = (long) pagina * tamanho;
        if (deslocamento >= total) {
            return new PaginaDeSessoes(List.of(), total);
        }

        TypedQuery<SessaoDeCaixa> selecao = entityManager.createQuery(SELECAO + condicoes + ORDEM,
                SessaoDeCaixa.class);
        parametros.forEach(selecao::setParameter);
        selecao.setFirstResult((int) deslocamento).setMaxResults(tamanho);
        return new PaginaDeSessoes(selecao.getResultList(), total);
    }

    private static String condicoes(Criterios criterios, Map<String, Object> parametros) {
        StringBuilder jpql = new StringBuilder(DA_EMPRESA);
        parametros.put("empresaId", criterios.empresaId());
        adicionar(jpql, parametros, ABERTA_POR, "abertaPor", criterios.abertaPor());
        adicionar(jpql, parametros, DO_PONTO, "pontoId", criterios.pontoId());
        adicionar(jpql, parametros, COM_STATUS, "status", criterios.status());
        adicionar(jpql, parametros, DESDE, "inicio", criterios.inicio());
        adicionar(jpql, parametros, ANTES_DE, "fim", criterios.fim());
        return jpql.toString();
    }

    private static void adicionar(StringBuilder jpql, Map<String, Object> parametros, String condicao, String nome,
            Object valor) {
        if (valor != null) {
            jpql.append(condicao);
            parametros.put(nome, valor);
        }
    }
}
