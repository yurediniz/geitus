package com.geitus.app.supplier;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.util.StringUtils;

import com.geitus.app.shared.validation.Documentos;
import com.geitus.app.shared.validation.Telefones;
import com.geitus.app.supplier.dto.FornecedorRequest;
import com.geitus.app.supplier.dto.RepresentanteRequest;

/**
 * Normaliza e valida o cadastro do fornecedor (docs/modules/fornecedores-e-marcas.md,
 * 4.1, 4.2 e 4.6), antes de qualquer consulta: textos aparados e vazio como
 * {@code null}; documento, CEP e telefones so com digitos; UF em maiusculas;
 * inscricao estadual so com digitos ou {@code ISENTO}, e so no PJ.
 *
 * <p>Objeto de dominio puro, com os validadores de {@code shared/validation}
 * (CPF, CNPJ e telefone, os mesmos de Empresa e Clientes). Cada erro e um
 * {@link DadosFornecedorInvalidosException} com a mensagem exata da spec e o
 * campo do request; nenhuma mensagem ecoa o valor recebido.
 */
final class ValidacaoDoFornecedor {

    static final int MAXIMO_DE_REPRESENTANTES = 10;

    static final String MENSAGEM_SEM_RAZAO_SOCIAL = "Informe a razão social.";
    static final String MENSAGEM_SEM_NOME = "Informe o nome.";
    static final String MENSAGEM_CNPJ_INVALIDO = "CNPJ inválido.";
    static final String MENSAGEM_CPF_INVALIDO = "CPF inválido.";
    static final String MENSAGEM_INSCRICAO_INVALIDA = "Informe só números ou ISENTO.";
    static final String MENSAGEM_INSCRICAO_NO_PF = "Inscrição estadual só para pessoa jurídica.";
    static final String MENSAGEM_CEP_INVALIDO = "O CEP deve ter 8 dígitos.";
    static final String MENSAGEM_UF_INVALIDA = "UF inválida.";
    static final String MENSAGEM_EMAIL_INVALIDO = "E-mail inválido.";
    static final String MENSAGEM_TELEFONE_INVALIDO = "Telefone inválido.";
    static final String MENSAGEM_REPRESENTANTE_SEM_NOME = "Informe o nome do representante.";
    static final String MENSAGEM_REPRESENTANTES_DEMAIS = "Informe no máximo 10 representantes.";
    static final String MENSAGEM_REPRESENTANTE_REPETIDO = "Representante repetido na lista.";

    static final String CAMPO_RAZAO_SOCIAL = "razaoSocial";
    static final String CAMPO_DOCUMENTO = "documento";
    static final String CAMPO_INSCRICAO_ESTADUAL = "inscricaoEstadual";
    static final String CAMPO_CEP = "cep";
    static final String CAMPO_UF = "uf";
    static final String CAMPO_EMAIL = "email";
    static final String CAMPO_TELEFONE = "telefone";
    static final String CAMPO_REPRESENTANTES = "representantes";

    static final String ISENTO = "ISENTO";

    private static final Pattern INSCRICAO_SO_DIGITOS = Pattern.compile("[0-9]{1,20}");
    /** CEP digitado: so digitos, com o hifen, o ponto e espacos da mascara. */
    private static final Pattern CEP_DIGITADO = Pattern.compile("[0-9.\\-\\s]+");
    private static final int DIGITOS_DO_CEP = 8;
    /** Formato basico: algo@algo.algo, sem espacos (o mesmo nivel de exigencia da tela). */
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
    private static final Set<String> UFS = Set.of("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT",
            "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO");

    private ValidacaoDoFornecedor() {
    }

    /** Os dados do cadastro, sem as listas (representantes e marcas). */
    static DadosFornecedor dados(FornecedorRequest request) {
        TipoPessoaFornecedor tipo = Objects.requireNonNullElse(request.tipoPessoa(), TipoPessoaFornecedor.PJ);
        return new DadosFornecedor(
                tipo,
                documento(tipo, request.documento()),
                razaoSocial(tipo, request.razaoSocial()),
                textoOuNulo(request.nomeFantasia()),
                inscricaoEstadual(tipo, request.inscricaoEstadual()),
                endereco(request),
                telefone(request.telefone(), CAMPO_TELEFONE),
                email(request.email(), CAMPO_EMAIL),
                textoOuNulo(request.observacoes()));
    }

    /**
     * A lista completa de representantes, normalizada e na ordem (spec 4.2):
     * ate {@value #MAXIMO_DE_REPRESENTANTES}, nome obrigatorio e o mesmo
     * {@code id} no maximo uma vez.
     */
    static List<DadosRepresentante> representantes(List<RepresentanteRequest> informados) {
        if (informados.size() > MAXIMO_DE_REPRESENTANTES) {
            throw invalido(MENSAGEM_REPRESENTANTES_DEMAIS, CAMPO_REPRESENTANTES);
        }
        Set<UUID> ids = new HashSet<>();
        List<DadosRepresentante> representantes = new ArrayList<>();
        for (int indice = 0; indice < informados.size(); indice++) {
            RepresentanteRequest informado = informados.get(indice);
            if (informado.id() != null && !ids.add(informado.id())) {
                throw invalido(MENSAGEM_REPRESENTANTE_REPETIDO, CAMPO_REPRESENTANTES);
            }
            representantes.add(representante(informado, campoDoRepresentante(indice)));
        }
        return representantes;
    }

    // ---------- Campos ----------

    private static String razaoSocial(TipoPessoaFornecedor tipo, String informada) {
        String razaoSocial = textoOuNulo(informada);
        if (razaoSocial == null) {
            throw invalido(tipo == TipoPessoaFornecedor.PF ? MENSAGEM_SEM_NOME : MENSAGEM_SEM_RAZAO_SOCIAL,
                    CAMPO_RAZAO_SOCIAL);
        }
        return razaoSocial;
    }

    /** CNPJ no PJ e CPF no PF, com os digitos verificadores; guardado so com digitos. */
    private static String documento(TipoPessoaFornecedor tipo, String informado) {
        if (textoOuNulo(informado) == null) {
            return null;
        }
        boolean valido = tipo == TipoPessoaFornecedor.PF ? Documentos.cpfValido(informado)
                : Documentos.cnpjValido(informado);
        if (!valido) {
            throw invalido(tipo == TipoPessoaFornecedor.PF ? MENSAGEM_CPF_INVALIDO : MENSAGEM_CNPJ_INVALIDO,
                    CAMPO_DOCUMENTO);
        }
        return Documentos.somenteDigitos(informado);
    }

    /** Review Focus 4: no PF a inscricao estadual informada e 400, nunca descartada em silencio. */
    private static String inscricaoEstadual(TipoPessoaFornecedor tipo, String informada) {
        String inscricao = textoOuNulo(informada);
        if (inscricao == null) {
            return null;
        }
        if (tipo == TipoPessoaFornecedor.PF) {
            throw invalido(MENSAGEM_INSCRICAO_NO_PF, CAMPO_INSCRICAO_ESTADUAL);
        }
        if (ISENTO.equalsIgnoreCase(inscricao)) {
            return ISENTO;
        }
        if (!INSCRICAO_SO_DIGITOS.matcher(inscricao).matches()) {
            throw invalido(MENSAGEM_INSCRICAO_INVALIDA, CAMPO_INSCRICAO_ESTADUAL);
        }
        return inscricao;
    }

    private static EnderecoDoFornecedor endereco(FornecedorRequest request) {
        return new EnderecoDoFornecedor(
                cep(request.cep()),
                textoOuNulo(request.logradouro()),
                textoOuNulo(request.numeroEndereco()),
                textoOuNulo(request.complemento()),
                textoOuNulo(request.bairro()),
                textoOuNulo(request.municipio()),
                uf(request.uf()));
    }

    private static String cep(String informado) {
        String cep = textoOuNulo(informado);
        if (cep == null) {
            return null;
        }
        String digitos = Documentos.somenteDigitos(cep);
        if (!CEP_DIGITADO.matcher(cep).matches() || digitos.length() != DIGITOS_DO_CEP) {
            throw invalido(MENSAGEM_CEP_INVALIDO, CAMPO_CEP);
        }
        return digitos;
    }

    private static String uf(String informada) {
        String uf = textoOuNulo(informada);
        if (uf == null) {
            return null;
        }
        String sigla = uf.toUpperCase(Locale.ROOT);
        if (!UFS.contains(sigla)) {
            throw invalido(MENSAGEM_UF_INVALIDA, CAMPO_UF);
        }
        return sigla;
    }

    private static String telefone(String informado, String campo) {
        if (textoOuNulo(informado) == null) {
            return null;
        }
        if (!Telefones.valido(informado)) {
            throw invalido(MENSAGEM_TELEFONE_INVALIDO, campo);
        }
        return Telefones.somenteDigitos(informado);
    }

    private static String email(String informado, String campo) {
        String email = textoOuNulo(informado);
        if (email != null && !EMAIL.matcher(email).matches()) {
            throw invalido(MENSAGEM_EMAIL_INVALIDO, campo);
        }
        return email;
    }

    private static DadosRepresentante representante(RepresentanteRequest informado, String campo) {
        String nome = textoOuNulo(informado.nome());
        if (nome == null) {
            throw invalido(MENSAGEM_REPRESENTANTE_SEM_NOME, campo + ".nome");
        }
        return new DadosRepresentante(informado.id(), nome, telefone(informado.telefone(), campo + ".telefone"),
                email(informado.email(), campo + ".email"));
    }

    private static String campoDoRepresentante(int indice) {
        return CAMPO_REPRESENTANTES + "[" + indice + "]";
    }

    private static String textoOuNulo(String valor) {
        return StringUtils.hasText(valor) ? valor.trim() : null;
    }

    private static DadosFornecedorInvalidosException invalido(String mensagem, String campo) {
        return new DadosFornecedorInvalidosException(mensagem, campo);
    }
}
