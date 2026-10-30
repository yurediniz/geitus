package com.geitus.app.sales.venda;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;

/**
 * Lista de vendas (docs/modules/pdv.md), da mais recente: a pagina e o
 * total que passa nos filtros. Como a {@code ConsultaDeSessoes} do caixa, so
 * entram os filtros informados (o PostgreSQL nao infere o tipo de um
 * parametro nulo), o JPQL e montado so com as constantes desta classe e todo
 * valor vai como parametro nomeado. Sempre filtrada pela empresa (DEC-016).
 */
@Repository
class ConsultaDeVendas {

    private static final String SELECAO = "SELECT v FROM Venda v";
    private static final String CONTAGEM = "SELECT count(v) FROM Venda v";
    private static final String DA_EMPRESA = " WHERE v.empresaId = :empresaId";
    private static final String DO_VENDEDOR = " AND v.usuarioId = :vendedor";
    private static final String DA_SESSAO = " AND v.sessaoCaixaId = :sessaoId";
    // A venda nao guarda o ponto: entram as das sessoes daquele ponto, da mesma empresa (ponto de outra
    // empresa ou inexistente nao tem sessao aqui, e a lista volta vazia).
    private static final String DO_PONTO = " AND v.sessaoCaixaId IN (SELECT s.id FROM SessaoDeCaixa s"
            + " WHERE s.empresaId = :empresaId AND s.ponto.uuid = :pontoId)";
    private static final String COM_STATUS = " AND v.status = :status";
    private static final String COM_NUMERO = " AND v.numero = :numero";
    private static final String DESDE = " AND v.concluidaEm >= :inicio";
    private static final String ANTES_DE = " AND v.concluidaEm < :fim";
    private static final String ORDEM = " ORDER BY v.concluidaEm DESC, v.id DESC";

    private final EntityManager entityManager;

    ConsultaDeVendas(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /**
     * Criterios ja resolvidos: {@code vendedor} restringe o OPERADOR as vendas
     * das proprias sessoes (o vendedor e sempre quem abriu a sessao) ou e o
     * vendedor escolhido pelo ADMIN; {@code pontoId} e o UUID do ponto de caixa;
     * o periodo e meio aberto, {@code [inicio, fim)}. Cada criterio {@code null}
     * fica de fora.
     */
    record Criterios(Long empresaId, Long vendedor, Long sessaoId, UUID pontoId, StatusDaVenda status, Long numero,
            OffsetDateTime inicio, OffsetDateTime fim) {
    }

    record PaginaDeVendas(List<Venda> vendas, long total) {
    }

    PaginaDeVendas buscar(Criterios criterios, int pagina, int tamanho) {
        Map<String, Object> parametros = new HashMap<>();
        String condicoes = condicoes(criterios, parametros);
        TypedQuery<Long> contagem = entityManager.createQuery(CONTAGEM + condicoes, Long.class);
        parametros.forEach(contagem::setParameter);
        long total = contagem.getSingleResult();
        long deslocamento = (long) pagina * tamanho;
        if (deslocamento >= total) {
            return new PaginaDeVendas(List.of(), total);
        }
        TypedQuery<Venda> selecao = entityManager.createQuery(SELECAO + condicoes + ORDEM, Venda.class);
        parametros.forEach(selecao::setParameter);
        selecao.setFirstResult((int) deslocamento).setMaxResults(tamanho);
        return new PaginaDeVendas(selecao.getResultList(), total);
    }

    private static String condicoes(Criterios criterios, Map<String, Object> parametros) {
        StringBuilder jpql = new StringBuilder(DA_EMPRESA);
        parametros.put("empresaId", criterios.empresaId());
        adicionar(jpql, parametros, DO_VENDEDOR, "vendedor", criterios.vendedor());
        adicionar(jpql, parametros, DA_SESSAO, "sessaoId", criterios.sessaoId());
        adicionar(jpql, parametros, DO_PONTO, "pontoId", criterios.pontoId());
        adicionar(jpql, parametros, COM_STATUS, "status", criterios.status());
        adicionar(jpql, parametros, COM_NUMERO, "numero", criterios.numero());
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
