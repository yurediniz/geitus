package com.geitus.app.catalog.imagem;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.util.MultiValueMap;
import org.springframework.web.util.UriComponents;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * URL assinada da imagem (docs/modules/produtos-imagem.md, 4.2): HMAC-SHA256
 * de {@code produto|versao|tamanho|expira}, valida ate o fim do dia UTC
 * seguinte, com relogio fixo.
 */
class AssinaturaDeImagemTest {

    private static final String SEGREDO = "segredo-de-teste-das-imagens-do-geitus-0123456789";
    /** O relogio da aplicacao fica em Sao Paulo; o calculo da validade e em UTC. */
    private static final ZoneId SAO_PAULO = ZoneId.of("America/Sao_Paulo");
    private static final UUID PRODUTO = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID VERSAO = UUID.fromString("22222222-2222-4222-8222-222222222222");
    /** 2026-10-26T00:00:00Z: o fim do dia UTC seguinte a 24/10. */
    private static final long FIM_DO_DIA_SEGUINTE_A_24_10 = Instant.parse("2026-10-26T00:00:00Z").getEpochSecond();

    @Test
    void urlTemOCaminhoOTamanhoAValidadeEAAssinaturaHexadecimal() {
        String url = assinaturaEm("2026-10-24T15:30:00Z").url(PRODUTO, VERSAO, TamanhoDaImagem.MINIATURA);

        UriComponents partes = UriComponentsBuilder.fromUriString(url).build();
        assertThat(partes.getPath()).isEqualTo("/api/imagens/produtos/" + PRODUTO + "/" + VERSAO + "/miniatura");
        assertThat(partes.getQueryParams().getFirst("expira")).isEqualTo(String.valueOf(FIM_DO_DIA_SEGUINTE_A_24_10));
        assertThat(partes.getQueryParams().getFirst("assinatura")).matches("[0-9a-f]{64}");
    }

    /**
     * A mensagem assinada tem o prefixo de dominio e versao do formato
     * ({@code imagem-produto|v1|}): a mesma chave nunca produz uma assinatura
     * que sirva para outro uso, e o formato pode mudar sem ambiguidade.
     */
    @Test
    void assinaturaEOHmacDaMensagemComOPrefixo() throws Exception {
        String url = assinaturaEm("2026-10-24T15:30:00Z").url(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SEGREDO.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String mensagem = "imagem-produto|v1|" + PRODUTO + "|" + VERSAO + "|grande|" + FIM_DO_DIA_SEGUINTE_A_24_10;

        assertThat(parametros(url).getFirst("assinatura"))
                .isEqualTo(HexFormat.of().formatHex(mac.doFinal(mensagem.getBytes(StandardCharsets.UTF_8))));
    }

    /** A URL e a mesma durante o dia UTC inteiro, para o cache do navegador funcionar. */
    @Test
    void urlEIgualDuranteOMesmoDiaUtc() {
        String inicioDoDia = assinaturaEm("2026-10-24T00:00:00Z").url(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE);
        String fimDoDia = assinaturaEm("2026-10-24T23:59:59Z").url(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE);
        String diaSeguinte = assinaturaEm("2026-10-25T00:00:00Z").url(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE);

        assertThat(fimDoDia).isEqualTo(inicioDoDia);
        assertThat(diaSeguinte).isNotEqualTo(inicioDoDia);
    }

    @Test
    void urlGeradaEValida() {
        AssinaturaDeImagem assinatura = assinaturaEm("2026-10-24T15:30:00Z");
        MultiValueMap<String, String> parametros = parametros(assinatura.url(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE));

        assertThat(assinatura.valida(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE, expira(parametros),
                parametros.getFirst("assinatura"))).isTrue();
    }

    /** Review Focus 2: a assinatura cobre o produto, a versao, o tamanho e a validade. */
    @Test
    void qualquerParteTrocadaInvalidaAAssinatura() {
        AssinaturaDeImagem assinatura = assinaturaEm("2026-10-24T15:30:00Z");
        MultiValueMap<String, String> parametros = parametros(assinatura.url(PRODUTO, VERSAO,
                TamanhoDaImagem.MINIATURA));
        long expira = expira(parametros);
        String hex = parametros.getFirst("assinatura");

        assertThat(assinatura.valida(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE, expira, hex)).isFalse();
        assertThat(assinatura.valida(PRODUTO, UUID.randomUUID(), TamanhoDaImagem.MINIATURA, expira, hex)).isFalse();
        assertThat(assinatura.valida(UUID.randomUUID(), VERSAO, TamanhoDaImagem.MINIATURA, expira, hex)).isFalse();
        assertThat(assinatura.valida(PRODUTO, VERSAO, TamanhoDaImagem.MINIATURA, expira + 86_400, hex)).isFalse();
        assertThat(assinatura.valida(PRODUTO, VERSAO, TamanhoDaImagem.MINIATURA, expira, alterada(hex))).isFalse();
        assertThat(assinatura.valida(PRODUTO, VERSAO, TamanhoDaImagem.MINIATURA, expira, null)).isFalse();
        assertThat(assinatura.valida(PRODUTO, VERSAO, TamanhoDaImagem.MINIATURA, expira, "")).isFalse();
    }

    @Test
    void outroSegredoNaoValidaAAssinatura() {
        MultiValueMap<String, String> parametros = parametros(assinaturaEm("2026-10-24T15:30:00Z")
                .url(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE));
        AssinaturaDeImagem outra = new AssinaturaDeImagem("outro-segredo-das-imagens-do-geitus-9876543210",
                relogio("2026-10-24T15:30:00Z"));

        assertThat(outra.valida(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE, expira(parametros),
                parametros.getFirst("assinatura"))).isFalse();
    }

    @Test
    void urlVencidaEInvalida() {
        MultiValueMap<String, String> parametros = parametros(assinaturaEm("2026-10-24T15:30:00Z")
                .url(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE));
        String hex = parametros.getFirst("assinatura");

        assertThat(assinaturaEm("2026-10-25T23:59:59Z").valida(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE,
                expira(parametros), hex)).isTrue();
        assertThat(assinaturaEm("2026-10-26T00:00:00Z").valida(PRODUTO, VERSAO, TamanhoDaImagem.GRANDE,
                expira(parametros), hex)).isFalse();
    }

    @Test
    void segundosAteAValidadeAlimentamOCache() {
        AssinaturaDeImagem assinatura = assinaturaEm("2026-10-25T23:00:00Z");

        assertThat(assinatura.segundosAte(FIM_DO_DIA_SEGUINTE_A_24_10)).isEqualTo(3_600);
        assertThat(assinatura.segundosAte(FIM_DO_DIA_SEGUINTE_A_24_10 - 7_200)).isZero();
    }

    @Test
    void tamanhoNoCaminho() {
        assertThat(TamanhoDaImagem.GRANDE.noCaminho()).isEqualTo("grande");
        assertThat(TamanhoDaImagem.doCaminho("miniatura")).contains(TamanhoDaImagem.MINIATURA);
        assertThat(TamanhoDaImagem.doCaminho("GRANDE")).isEmpty();
        assertThat(TamanhoDaImagem.doCaminho("media")).isEmpty();
    }

    // ------------------------------------------------------------------

    private static AssinaturaDeImagem assinaturaEm(String instante) {
        return new AssinaturaDeImagem(SEGREDO, relogio(instante));
    }

    private static Clock relogio(String instante) {
        return Clock.fixed(Instant.parse(instante), SAO_PAULO);
    }

    private static MultiValueMap<String, String> parametros(String url) {
        return UriComponentsBuilder.fromUriString(url).build().getQueryParams();
    }

    private static long expira(MultiValueMap<String, String> parametros) {
        return Long.parseLong(parametros.getFirst("expira"));
    }

    private static String alterada(String hex) {
        char primeiro = hex.charAt(0) == '0' ? '1' : '0';
        return primeiro + hex.substring(1);
    }
}
