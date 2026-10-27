package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.geitus.app.cashier.FormaDePagamento;

/**
 * O esperado de cada forma na sessao (docs/modules/pdv.md): a soma dos
 * movimentos com o sinal do tipo. Dinheiro = abertura + suprimentos +
 * recebimentos - sangrias - estornos; Debito, Credito e PIX = recebimentos -
 * estornos. So entram as formas que tiveram movimento (o dinheiro sempre tem a
 * abertura). Nunca e coluna: e sempre esta soma.
 */
final class EsperadoPorForma {

    private static final int CASAS_DO_DINHEIRO = 2;

    private EsperadoPorForma() {
        // Apenas metodos estaticos.
    }

    /** Lido do banco, com a sessao travada por quem chama. */
    static Map<FormaDePagamento, BigDecimal> daSessao(MovimentoDeCaixaRepository repositorio, Long empresaId,
            Long sessaoId) {
        return dasSessoes(repositorio, empresaId, List.of(sessaoId)).getOrDefault(sessaoId,
                new EnumMap<>(FormaDePagamento.class));
    }

    /** O dinheiro esperado na gaveta, lido do banco. */
    static BigDecimal dinheiro(MovimentoDeCaixaRepository repositorio, Long empresaId, Long sessaoId) {
        return emReais(repositorio.esperado(empresaId, sessaoId));
    }

    /** Das sessoes de uma pagina, numa consulta; sessao sem movimento fica fora do mapa. */
    static Map<Long, Map<FormaDePagamento, BigDecimal>> dasSessoes(MovimentoDeCaixaRepository repositorio,
            Long empresaId, Collection<Long> sessaoIds) {
        Map<Long, Map<FormaDePagamento, BigDecimal>> esperados = new HashMap<>();
        for (Object[] linha : repositorio.esperadosPorForma(empresaId, sessaoIds.toArray(Long[]::new))) {
            Long sessaoId = ((Number) linha[0]).longValue();
            esperados.computeIfAbsent(sessaoId, id -> new EnumMap<>(FormaDePagamento.class))
                    .put(FormaDePagamento.valueOf((String) linha[1]), emReais((BigDecimal) linha[2]));
        }
        return esperados;
    }

    /** Dos movimentos ja carregados (o detalhe da sessao). */
    static Map<FormaDePagamento, BigDecimal> deMovimentos(List<MovimentoDeCaixa> movimentos) {
        Map<FormaDePagamento, BigDecimal> esperados = new EnumMap<>(FormaDePagamento.class);
        for (MovimentoDeCaixa movimento : movimentos) {
            esperados.merge(movimento.getForma(), movimento.getTipo().comSinal(movimento.getValor()), BigDecimal::add);
        }
        esperados.replaceAll((forma, valor) -> emReais(valor));
        return esperados;
    }

    private static BigDecimal emReais(BigDecimal valor) {
        return valor.setScale(CASAS_DO_DINHEIRO, RoundingMode.UNNECESSARY);
    }
}
