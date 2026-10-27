package com.geitus.app.shared.numeracao;

import java.util.Map;
import java.util.Objects;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gera o numero de registro sequencial por empresa (1, 2, 3...) de produtos,
 * clientes, fornecedores (Fase B5, V14) e vendas (PDV, V17) (docs/modules/produtos.md; DEC-036).
 *
 * <p>O incremento e um {@code UPDATE ... RETURNING} na tabela
 * {@code numeracoes}, que trava a linha da empresa e do tipo ate o fim da
 * transacao. Por isso o metodo exige a transacao de quem cria o registro
 * ({@link Propagation#MANDATORY}): dois cadastros simultaneos sao serializados
 * nessa linha e recebem numeros diferentes e consecutivos, e um cadastro que
 * falha desfaz o incremento junto (o numero nao e "queimado"). A linha nasce
 * na primeira vez com {@code INSERT ... ON CONFLICT DO NOTHING}, seguro tambem
 * entre transacoes concorrentes.
 *
 * <p><b>Toda criacao de produto, de cliente ou de fornecedor precisa passar por aqui</b>
 * (inclusive cargas e scripts): um registro gravado com numero escolhido por
 * fora deixa {@code numeracoes} para tras, e o proximo cadastro bate na
 * UNIQUE {@code (empresa_id, numero)}. Se isso acontecer, a ressincronizacao e:
 * <pre>
 * UPDATE numeracoes n SET ultimo_numero = (SELECT coalesce(max(numero), 0) FROM produtos p
 *  WHERE p.empresa_id = n.empresa_id) WHERE tipo = 'PRODUTO';
 * UPDATE numeracoes n SET ultimo_numero = (SELECT coalesce(max(numero), 0) FROM clientes c
 *  WHERE c.empresa_id = n.empresa_id) WHERE tipo = 'CLIENTE';
 * UPDATE numeracoes n SET ultimo_numero = (SELECT coalesce(max(numero), 0) FROM fornecedores f
 *  WHERE f.empresa_id = n.empresa_id) WHERE tipo = 'FORNECEDOR';
 * </pre>
 * (empresa sem linha em {@code numeracoes} e criada no primeiro cadastro e
 * comeca do 1; se ela ja tiver registros, insira a linha com o maximo antes).
 *
 * <p>SQL fixo com parametros nomeados; o tipo vai como o nome do enum.
 */
@Component
public class Numerador {

    private static final String CRIAR_SE_AUSENTE = """
            INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero)
            VALUES (:empresaId, :tipo, 0)
            ON CONFLICT (empresa_id, tipo) DO NOTHING""";
    private static final String INCREMENTAR = """
            UPDATE numeracoes
               SET ultimo_numero = ultimo_numero + 1
             WHERE empresa_id = :empresaId AND tipo = :tipo
            RETURNING ultimo_numero""";

    private final NamedParameterJdbcTemplate jdbc;

    public Numerador(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Proximo numero da empresa para o tipo, reservado ate o fim da transacao atual. */
    @Transactional(propagation = Propagation.MANDATORY)
    public long proximo(Long empresaId, TipoNumeracao tipo) {
        Objects.requireNonNull(empresaId, "empresaId");
        Objects.requireNonNull(tipo, "tipo");
        Map<String, Object> parametros = Map.of("empresaId", empresaId, "tipo", tipo.name());
        jdbc.update(CRIAR_SE_AUSENTE, parametros);
        return jdbc.queryForObject(INCREMENTAR, parametros, Long.class);
    }
}
