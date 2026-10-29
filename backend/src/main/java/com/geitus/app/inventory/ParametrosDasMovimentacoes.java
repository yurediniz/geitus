package com.geitus.app.inventory;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
import com.geitus.app.shared.paginacao.Paginacao;

/**
 * Parametros de {@code GET /api/estoque/movimentos} ja validados (spec de
 * Estoque, regra 26): o periodo em dias inteiros (datas inclusivas, ate 1 ano),
 * tipo e motivo pelos enums e pagina/tamanho dentro do {@link Paginacao}. Valor
 * invalido lanca {@link RegraDeNegocioException} (400 com o campo).
 *
 * <p>Motivo de outro tipo nao e erro: a lista volta vazia.
 *
 * @param de      primeiro dia do periodo
 * @param ate     ultimo dia do periodo (inclusivo)
 * @param produto UUID publico do produto, ou {@code null}
 * @param tipo    tipo do movimento, ou {@code null}
 * @param motivo  motivo do movimento, ou {@code null}
 * @param usuario id do usuario que registrou (o mesmo do {@code UsuarioResponse}), ou {@code null}
 * @param pagina  pagina a partir de 0
 * @param tamanho itens por pagina, de 1 a {@value Paginacao#TAMANHO_MAXIMO}
 */
public record ParametrosDasMovimentacoes(LocalDate de, LocalDate ate, UUID produto, TipoMovimento tipo,
        MotivoMovimento motivo, Long usuario, int pagina, int tamanho) {

    /** O periodo padrao: 30 dias, contando hoje. */
    static final int DIAS_DO_PERIODO_PADRAO = 30;
    static final int DIAS_DO_PERIODO_MAXIMO = 366;
    static final int ANO_MINIMO = 1000;
    static final int ANO_MAXIMO = 9999;

    static final String MENSAGEM_PERIODO_INVERTIDO = "A data inicial deve ser anterior à final.";
    static final String MENSAGEM_PERIODO_LONGO = "O período pode ter no máximo 1 ano.";
    static final String MENSAGEM_DATA_INVALIDA = "Data inválida.";
    static final String MENSAGEM_TIPO_INVALIDO = "Tipo de movimento inválido.";
    static final String MENSAGEM_MOTIVO_INVALIDO = "Motivo de movimento inválido.";
    static final String CAMPO_DE = "de";
    static final String CAMPO_ATE = "ate";
    static final String CAMPO_TIPO = "tipo";
    static final String CAMPO_MOTIVO = "motivo";

    public ParametrosDasMovimentacoes {
        Objects.requireNonNull(de, "de");
        Objects.requireNonNull(ate, "ate");
        if (de.isAfter(ate)) {
            throw new RegraDeNegocioException(MENSAGEM_PERIODO_INVERTIDO, CAMPO_DE);
        }
        if (ChronoUnit.DAYS.between(de, ate) >= DIAS_DO_PERIODO_MAXIMO) {
            throw new RegraDeNegocioException(MENSAGEM_PERIODO_LONGO, CAMPO_ATE);
        }
        Paginacao.validar(pagina, tamanho);
    }

    /**
     * Converte os parametros crus. Sem {@code ate}, vale {@code hoje}; sem
     * {@code de}, os 30 dias que terminam em {@code ate}. Pagina 0 e 25 itens
     * por padrao.
     */
    public static ParametrosDasMovimentacoes daRequisicao(String de, String ate, UUID produto, String tipo,
            String motivo, Long usuario, Integer pagina, Integer tamanho, LocalDate hoje) {
        LocalDate fim = ausente(ate) ? hoje : data(ate, CAMPO_ATE);
        LocalDate inicio = ausente(de) ? fim.minusDays(DIAS_DO_PERIODO_PADRAO - 1L) : data(de, CAMPO_DE);
        return new ParametrosDasMovimentacoes(inicio, fim, produto,
                ausente(tipo) ? null : constante(TipoMovimento.class, tipo, MENSAGEM_TIPO_INVALIDO, CAMPO_TIPO),
                ausente(motivo) ? null
                        : constante(MotivoMovimento.class, motivo, MENSAGEM_MOTIVO_INVALIDO, CAMPO_MOTIVO),
                usuario,
                Objects.requireNonNullElse(pagina, ParametrosDaListagem.PAGINA_PADRAO),
                Objects.requireNonNullElse(tamanho, ParametrosDaListagem.TAMANHO_PADRAO));
    }

    private static boolean ausente(String valor) {
        return valor == null || valor.isBlank();
    }

    /**
     * Data ISO ({@code 2026-10-27}) com ano de 4 digitos (anos extremos estourariam o
     * {@code timestamp} do banco); a mensagem nao ecoa o valor recebido.
     */
    private static LocalDate data(String valor, String campo) {
        LocalDate data;
        try {
            data = LocalDate.parse(valor.strip());
        } catch (DateTimeParseException e) {
            throw new RegraDeNegocioException(MENSAGEM_DATA_INVALIDA, campo);
        }
        if (data.getYear() < ANO_MINIMO || data.getYear() > ANO_MAXIMO) {
            throw new RegraDeNegocioException(MENSAGEM_DATA_INVALIDA, campo);
        }
        return data;
    }

    /** Nome exato da constante, como a API devolve ({@code ENTRADA}, {@code COMPRA}). */
    private static <E extends Enum<E>> E constante(Class<E> tipo, String valor, String mensagem, String campo) {
        for (E constante : tipo.getEnumConstants()) {
            if (constante.name().equals(valor.strip())) {
                return constante;
            }
        }
        throw new RegraDeNegocioException(mensagem, campo);
    }
}
