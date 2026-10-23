package com.geitus.app.catalog.balanca;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.Optional;
import java.util.regex.Pattern;

import com.geitus.app.catalog.CodigoBarras;

/**
 * Le uma etiqueta de balanca (docs/modules/produtos-codigo-e-balanca.md, 3.2):
 * regra de dominio pura, usada pelo teste de etiqueta agora e pelo PDV depois.
 *
 * <p>So ha leitura com exatamente 13 digitos ASCII comecando pelo prefixo e,
 * com digito verificador, EAN-13 valido. O codigo e lido sem zeros (000542 =
 * 542) e tem de ser um codigo de produto (de 1 a 999999); os digitos de
 * preenchimento tem de ser zeros (spec 3.1); a informacao e dividida por
 * 10^casas, mantendo a escala (010000 com 3 casas = 10.000).
 */
public final class LeitorEtiquetaBalanca {

    private static final Pattern TREZE_DIGITOS = Pattern.compile("[0-9]{13}");

    private LeitorEtiquetaBalanca() {
        // Apenas metodos estaticos.
    }

    /**
     * Leitura de {@code codigoLido} no formato de {@code config}, ou vazio se
     * o numero nao for uma etiqueta nesse formato. {@code config} precisa ser
     * valida ({@link ConfiguracaoEtiqueta#validar()}).
     */
    public static Optional<LeituraEtiqueta> ler(String codigoLido, ConfiguracaoEtiqueta config) {
        if (config.tamanhoTotal() != ConfiguracaoEtiqueta.TAMANHO_DA_ETIQUETA) {
            throw new IllegalArgumentException("Configuracao de etiqueta invalida.");
        }
        if (!temOFormato(codigoLido, config)) {
            return Optional.empty();
        }
        int inicioDoCodigo = config.prefixo().length();
        int fimDoCodigo = inicioDoCodigo + config.digitosCodigo();
        int inicioDaInformacao = fimDoCodigo + config.digitosPreenchimento();
        int fimDaInformacao = inicioDaInformacao + config.digitosInformacao();

        int codigoProduto = Integer.parseInt(codigoLido.substring(inicioDoCodigo, fimDoCodigo));
        if (codigoProduto == 0 || !soZeros(codigoLido.substring(fimDoCodigo, inicioDaInformacao))) {
            return Optional.empty();
        }
        BigDecimal valor = new BigDecimal(new BigInteger(codigoLido.substring(inicioDaInformacao, fimDaInformacao)),
                config.casasDecimais());
        return Optional.of(new LeituraEtiqueta(codigoProduto, config.tipoInformacao(), valor));
    }

    private static boolean soZeros(String preenchimento) {
        return preenchimento.chars().allMatch(digito -> digito == '0');
    }

    private static boolean temOFormato(String codigoLido, ConfiguracaoEtiqueta config) {
        return codigoLido != null
                && TREZE_DIGITOS.matcher(codigoLido).matches()
                && codigoLido.startsWith(config.prefixo())
                && (!config.digitoVerificador() || CodigoBarras.digitoVerificadorValido(codigoLido));
    }
}
