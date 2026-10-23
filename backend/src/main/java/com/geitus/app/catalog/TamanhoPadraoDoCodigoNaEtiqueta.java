package com.geitus.app.catalog;

import org.springframework.stereotype.Component;

/**
 * Tamanho do codigo na etiqueta padrao (6 digitos), enquanto a configuracao da
 * etiqueta por empresa nao existe.
 */
@Component
class TamanhoPadraoDoCodigoNaEtiqueta implements TamanhoDoCodigoNaEtiqueta {

    private static final int DIGITOS_DO_CODIGO_NA_ETIQUETA_PADRAO = 6;

    @Override
    public int digitosCodigo(Long empresaId) {
        return DIGITOS_DO_CODIGO_NA_ETIQUETA_PADRAO;
    }
}
