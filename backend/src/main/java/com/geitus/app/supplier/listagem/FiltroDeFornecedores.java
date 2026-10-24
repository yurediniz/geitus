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
 * com ou sem mascara, e com ao menos 4 digitos), o termo numerico (o Nº,
 * sempre exato) e o status. O tamanho do termo (ate 200) e conferido antes,
 * no service.
 */
public record FiltroDeFornecedores(Long empresaId, List<String> palavras, String digitosDoDocumento,
        Long termoNumerico, StatusFiltro status) {

    /**
     * O termo parece um documento: so digitos e os separadores da mascara de
     * CNPJ/CPF. Uma classe so com {@code +}: casamento linear, sem retrocesso.
     */
    private static final Pattern DOCUMENTO_DIGITADO = Pattern.compile("[0-9./\\-\\s]+");
    /** Com menos digitos o documento nao e comparado ("3" acha o Nº 3, nao todo CNPJ com 3). */
    static final int MINIMO_DE_DIGITOS_DO_DOCUMENTO = 4;

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
        if (digitos != null && digitos.length() < MINIMO_DE_DIGITOS_DO_DOCUMENTO) {
            digitos = null;
        }
        return new FiltroDeFornecedores(empresaId, TextoDeBusca.palavras(busca), digitos,
                TextoDeBusca.termoNumerico(busca), status);
    }

    public boolean temBusca() {
        return !palavras.isEmpty() || digitosDoDocumento != null || termoNumerico != null;
    }
}
