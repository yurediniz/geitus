package com.geitus.app.supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

import com.geitus.app.supplier.dto.FornecedorRequest;
import com.geitus.app.supplier.dto.RepresentanteRequest;

/**
 * Normalizacao e validacao do cadastro do fornecedor
 * (docs/modules/fornecedores-e-marcas.md), objeto puro: as
 * mensagens exatas da spec e o campo de cada erro.
 */
class ValidacaoDoFornecedorTest {

    private static final String CNPJ = "11.222.333/0001-81";
    private static final String CPF = "111.444.777-35";

    // ---------- Nome e tipo ----------

    @Test
    void soARazaoSocialEObrigatoriaETipoAusenteEPj() {
        DadosFornecedor dados = ValidacaoDoFornecedor.dados(request().razaoSocial("  Distribuidora Central  ")
                .build());

        assertThat(dados.tipoPessoa()).isEqualTo(TipoPessoaFornecedor.PJ);
        assertThat(dados.razaoSocial()).isEqualTo("Distribuidora Central");
        assertThat(dados.documento()).isNull();
        assertThat(dados.endereco()).isEqualTo(EnderecoDoFornecedor.VAZIO);
    }

    @Test
    void tipoAusenteUsaOPadraoInformado() {
        DadosFornecedor dados = ValidacaoDoFornecedor.dados(request().documento("111.444.777-35").build(),
                TipoPessoaFornecedor.PF);

        assertThat(dados.tipoPessoa()).isEqualTo(TipoPessoaFornecedor.PF);
        assertThat(dados.documento()).isEqualTo("11144477735");
    }

    @Test
    void semRazaoSocialNoPjENomeNoPf() {
        assertInvalido(request().razaoSocial("   "), "Informe a razão social.", "razaoSocial");
        assertInvalido(request().tipoPessoa(TipoPessoaFornecedor.PF).razaoSocial(null), "Informe o nome.",
                "razaoSocial");
    }

    @Test
    void textosAparadosEVazioViraNulo() {
        DadosFornecedor dados = ValidacaoDoFornecedor.dados(request().nomeFantasia("  Central ").logradouro(" ")
                .bairro("  Sé ").observacoes("  Entrega às terças  ").email("  ").build());

        assertThat(dados.nomeFantasia()).isEqualTo("Central");
        assertThat(dados.endereco().logradouro()).isNull();
        assertThat(dados.endereco().bairro()).isEqualTo("Sé");
        assertThat(dados.observacoes()).isEqualTo("Entrega às terças");
        assertThat(dados.email()).isNull();
    }

    // ---------- Documento ----------

    @Test
    void documentoComMascaraFicaSoComDigitos() {
        assertThat(ValidacaoDoFornecedor.dados(request().documento(CNPJ).build()).documento())
                .isEqualTo("11222333000181");
        assertThat(ValidacaoDoFornecedor.dados(request().tipoPessoa(TipoPessoaFornecedor.PF).documento(CPF).build())
                .documento()).isEqualTo("11144477735");
    }

    @Test
    void documentoInvalidoPeloTipo() {
        assertInvalido(request().documento("11.222.333/0001-82"), "CNPJ inválido.", "documento");
        assertInvalido(request().documento(CPF), "CNPJ inválido.", "documento");
        assertInvalido(request().tipoPessoa(TipoPessoaFornecedor.PF).documento(CNPJ), "CPF inválido.", "documento");
        assertInvalido(request().tipoPessoa(TipoPessoaFornecedor.PF).documento("111.444.777-36"), "CPF inválido.",
                "documento");
    }

    // ---------- Inscricao estadual (Review Focus 4) ----------

    @Test
    void inscricaoEstadualSoDigitosOuIsento() {
        assertThat(ValidacaoDoFornecedor.dados(request().inscricaoEstadual(" 110042490114 ").build())
                .inscricaoEstadual()).isEqualTo("110042490114");
        assertThat(ValidacaoDoFornecedor.dados(request().inscricaoEstadual("isento").build()).inscricaoEstadual())
                .isEqualTo("ISENTO");
        assertInvalido(request().inscricaoEstadual("110.042.490.114"), "Informe só números ou ISENTO.",
                "inscricaoEstadual");
        assertInvalido(request().inscricaoEstadual("ISENTA"), "Informe só números ou ISENTO.", "inscricaoEstadual");
    }

    @Test
    void inscricaoEstadualNoPfE400() {
        assertInvalido(request().tipoPessoa(TipoPessoaFornecedor.PF).inscricaoEstadual("ISENTO"),
                "Inscrição estadual só para pessoa jurídica.", "inscricaoEstadual");
        assertThat(ValidacaoDoFornecedor.dados(request().tipoPessoa(TipoPessoaFornecedor.PF).inscricaoEstadual("  ")
                .build()).inscricaoEstadual()).isNull();
    }

    // ---------- Endereco e contato ----------

    @Test
    void cepComMascaraEUfEmMaiusculas() {
        DadosFornecedor dados = ValidacaoDoFornecedor.dados(request().cep("01001-000").uf("sp").build());

        assertThat(dados.endereco().cep()).isEqualTo("01001000");
        assertThat(dados.endereco().uf()).isEqualTo("SP");
    }

    @Test
    void cepEUfInvalidos() {
        assertInvalido(request().cep("0100-100"), "O CEP deve ter 8 dígitos.", "cep");
        assertInvalido(request().cep("01001-00a"), "O CEP deve ter 8 dígitos.", "cep");
        assertInvalido(request().uf("XX"), "UF inválida.", "uf");
    }

    @Test
    void emailETelefone() {
        DadosFornecedor dados = ValidacaoDoFornecedor.dados(request().telefone("(11) 3322-4455")
                .email(" compras@central.com.br ").build());

        assertThat(dados.telefone()).isEqualTo("1133224455");
        assertThat(dados.email()).isEqualTo("compras@central.com.br");
        assertInvalido(request().email("compras@central"), "E-mail inválido.", "email");
        assertInvalido(request().email("compras central@x.com"), "E-mail inválido.", "email");
        assertInvalido(request().telefone("3322-4455"), "Telefone inválido.", "telefone");
    }

    // ---------- Representantes ----------

    @Test
    void representantesNormalizadosNaOrdem() {
        UUID mantido = UUID.randomUUID();
        List<DadosRepresentante> representantes = ValidacaoDoFornecedor.representantes(List.of(
                new RepresentanteRequest(mantido, " Ana ", "(11) 98765-4321", " ana@central.com.br "),
                new RepresentanteRequest(null, "Bruno", " ", null)));

        assertThat(representantes).containsExactly(
                new DadosRepresentante(mantido, "Ana", "11987654321", "ana@central.com.br"),
                new DadosRepresentante(null, "Bruno", null, null));
    }

    @Test
    void representanteSemNomeTemOCampoIndexado() {
        assertThatThrownBy(() -> ValidacaoDoFornecedor.representantes(List.of(
                new RepresentanteRequest(null, "Ana", null, null),
                new RepresentanteRequest(null, "  ", null, null))))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage("Informe o nome do representante.")
                .satisfies(erro -> assertThat(((DadosFornecedorInvalidosException) erro).campo())
                        .contains("representantes[1].nome"));
    }

    @Test
    void representanteComTelefoneOuEmailInvalido() {
        assertThatThrownBy(() -> ValidacaoDoFornecedor.representantes(List.of(
                new RepresentanteRequest(null, "Ana", "123", null))))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage("Telefone inválido.")
                .satisfies(erro -> assertThat(((DadosFornecedorInvalidosException) erro).campo())
                        .contains("representantes[0].telefone"));
        assertThatThrownBy(() -> ValidacaoDoFornecedor.representantes(List.of(
                new RepresentanteRequest(null, "Ana", null, "ana"))))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage("E-mail inválido.")
                .satisfies(erro -> assertThat(((DadosFornecedorInvalidosException) erro).campo())
                        .contains("representantes[0].email"));
    }

    @Test
    void exatamenteDezRepresentantesPassa() {
        List<RepresentanteRequest> dez = IntStream.rangeClosed(1, 10)
                .mapToObj(numero -> new RepresentanteRequest(null, "Representante " + numero, null, null))
                .toList();

        assertThat(ValidacaoDoFornecedor.representantes(dez)).hasSize(10)
                .extracting(DadosRepresentante::nome).endsWith("Representante 10");
    }

    @Test
    void noMaximoDezRepresentantesESemIdRepetido() {
        List<RepresentanteRequest> onze = IntStream.rangeClosed(1, 11)
                .mapToObj(numero -> new RepresentanteRequest(null, "Representante " + numero, null, null))
                .toList();
        UUID repetido = UUID.randomUUID();

        assertThatThrownBy(() -> ValidacaoDoFornecedor.representantes(onze))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage("Informe no máximo 10 representantes.");
        assertThatThrownBy(() -> ValidacaoDoFornecedor.representantes(List.of(
                new RepresentanteRequest(repetido, "Ana", null, null),
                new RepresentanteRequest(repetido, "Bruno", null, null))))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage("Representante repetido na lista.");
    }

    // ---------- Apoio ----------

    private static void assertInvalido(RequestDeTeste request, String mensagem, String campo) {
        assertThatThrownBy(() -> ValidacaoDoFornecedor.dados(request.build()))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage(mensagem)
                .satisfies(erro -> assertThat(((DadosFornecedorInvalidosException) erro).campo()).contains(campo));
    }

    static RequestDeTeste request() {
        return new RequestDeTeste();
    }

    /** Monta o {@link FornecedorRequest} nos testes; parte de um PJ so com a razao social. */
    static final class RequestDeTeste {
        private TipoPessoaFornecedor tipoPessoa;
        private String documento;
        private String razaoSocial = "Distribuidora";
        private String nomeFantasia;
        private String inscricaoEstadual;
        private String cep;
        private String logradouro;
        private String numeroEndereco;
        private String bairro;
        private String uf;
        private String telefone;
        private String email;
        private String observacoes;
        private List<RepresentanteRequest> representantes;
        private List<UUID> marcaIds;

        RequestDeTeste tipoPessoa(TipoPessoaFornecedor valor) {
            this.tipoPessoa = valor;
            return this;
        }

        RequestDeTeste documento(String valor) {
            this.documento = valor;
            return this;
        }

        RequestDeTeste razaoSocial(String valor) {
            this.razaoSocial = valor;
            return this;
        }

        RequestDeTeste nomeFantasia(String valor) {
            this.nomeFantasia = valor;
            return this;
        }

        RequestDeTeste inscricaoEstadual(String valor) {
            this.inscricaoEstadual = valor;
            return this;
        }

        RequestDeTeste cep(String valor) {
            this.cep = valor;
            return this;
        }

        RequestDeTeste logradouro(String valor) {
            this.logradouro = valor;
            return this;
        }

        RequestDeTeste numeroEndereco(String valor) {
            this.numeroEndereco = valor;
            return this;
        }

        RequestDeTeste bairro(String valor) {
            this.bairro = valor;
            return this;
        }

        RequestDeTeste uf(String valor) {
            this.uf = valor;
            return this;
        }

        RequestDeTeste telefone(String valor) {
            this.telefone = valor;
            return this;
        }

        RequestDeTeste email(String valor) {
            this.email = valor;
            return this;
        }

        RequestDeTeste observacoes(String valor) {
            this.observacoes = valor;
            return this;
        }

        RequestDeTeste representantes(RepresentanteRequest... valores) {
            this.representantes = new ArrayList<>(List.of(valores));
            return this;
        }

        RequestDeTeste marcaIds(UUID... valores) {
            this.marcaIds = new ArrayList<>(List.of(valores));
            return this;
        }

        FornecedorRequest build() {
            return new FornecedorRequest(tipoPessoa, documento, razaoSocial, nomeFantasia, inscricaoEstadual, cep,
                    logradouro, numeroEndereco, null, bairro, null, uf, telefone, email, observacoes, representantes, marcaIds);
        }
    }
}
