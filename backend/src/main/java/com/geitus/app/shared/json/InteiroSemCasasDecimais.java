package com.geitus.app.shared.json;

import java.io.IOException;
import java.util.regex.Pattern;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;

/**
 * Le um {@code Integer} do JSON sem descartar casas decimais em silencio: por
 * padrao o Jackson aceita {@code 542.9} num inteiro e grava {@code 542}. Aqui,
 * so numero inteiro (dentro do intervalo de {@code int}) ou texto so com digitos
 * (com zeros a esquerda: {@code "000542"} = 542) sao aceitos; o resto vira
 * erro de leitura, que o {@code GlobalExceptionHandler} responde com 400.
 *
 * <p>Aplicado campo a campo com {@code @JsonDeserialize(using = ...)} (codigo do
 * produto e digitos da etiqueta de balanca). Nao foi desligado o
 * {@code ACCEPT_FLOAT_AS_INT} global: o {@code application.yml} de teste
 * substitui o principal no classpath, entao a regra nao valeria nas fatias web
 * e o teste nao provaria o comportamento de producao.
 */
public class InteiroSemCasasDecimais extends StdDeserializer<Integer> {

    private static final Pattern INTEIRO = Pattern.compile("-?[0-9]+");

    public InteiroSemCasasDecimais() {
        super(Integer.class);
    }

    @Override
    public Integer deserialize(JsonParser parser, DeserializationContext contexto) throws IOException {
        JsonToken token = parser.currentToken();
        if (token == JsonToken.VALUE_NUMBER_INT && parser.getNumberType() == JsonParser.NumberType.INT) {
            return parser.getIntValue();
        }
        if (token == JsonToken.VALUE_STRING) {
            return deTexto(parser.getText().strip(), contexto);
        }
        return (Integer) contexto.handleUnexpectedToken(Integer.class, parser);
    }

    private static Integer deTexto(String texto, DeserializationContext contexto) throws IOException {
        if (texto.isEmpty()) {
            return null;
        }
        if (INTEIRO.matcher(texto).matches()) {
            try {
                return Integer.valueOf(texto);
            } catch (NumberFormatException foraDoIntervalo) {
                // Cai no erro abaixo.
            }
        }
        return (Integer) contexto.handleWeirdStringValue(Integer.class, texto, "nao e um numero inteiro");
    }
}
