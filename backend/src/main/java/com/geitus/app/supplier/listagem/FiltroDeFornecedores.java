package com.geitus.app.supplier.listagem;

import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

import com.geitus.app.catalog.listagem.StatusFiltro;
import com.geitus.app.shared.busca.TextoDeBusca;
import com.geitus.app.shared.validation.Documentos;

/**
 * Filtro da listagem de fornecedores (docs/modules/fornecedores-e-marcas.md,
 * 4.7), ja tratado: as palavras normalizadas do termo (nome, nome fantasia e
 * representantes), os digitos do documento (so quando o termo e um documento,
 * com ou sem mascara), o termo numerico (o Nº) e o status.
 */
public record FiltroDeFornecedores(Long empresaId, List<String> palavras, String digitosDoDocumento,
        Long termoNumerico, StatusFiltro status) {

    /** O termo parece um documento: so digitos e os separadores da mascara de CNPJ/CPF. */
    private static final Pattern DOCUMENTO_DIGITADO = Pattern.compile("[0-9./\\-\\s]*[0-9][0-9./\\-\\s]*");

    public FiltroDeFornecedores {
        Objects.requireNonNull(empresaId, "empresaId");
        Objects.requireNonNull(status, "status");
        palavras = List.copyOf(palavras);
    }

    /** O filtro a partir do termo digitado e do status ja lido. */
    public static FiltroDeFornecedores de(Long empresaId, String busca, StatusFiltro status) {
        String digitos = busca != null && DOCUMENTO_DIGITADO.matcher(busca.strip()).matches()
                ? Documentos.somenteDigitos(busca)
                : null;
        return new FiltroDeFornecedores(empresaId, TextoDeBusca.palavras(busca), digitos,
                TextoDeBusca.termoNumerico(busca), status);
    }

    public boolean temBusca() {
        return !palavras.isEmpty() || digitosDoDocumento != null || termoNumerico != null;
    }
}
