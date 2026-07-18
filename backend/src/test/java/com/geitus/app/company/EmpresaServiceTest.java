package com.geitus.app.company;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.company.dto.EmpresaAtualizarRequest;
import com.geitus.app.company.dto.EmpresaDetalheResponse;
import com.geitus.app.company.dto.EnderecoRequest;
import com.geitus.app.company.dto.RepresentanteLegalRequest;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Testa as regras do {@link EmpresaService}: atualizacao do cadastro completo
 * (PF e PJ), isolamento por empresa (sempre a do usuario autenticado),
 * normalizacao para somente digitos, coerencia PJ/PF e unicidade do CNPJ (409).
 */
@ExtendWith(MockitoExtension.class)
class EmpresaServiceTest {

    @Mock
    private UsuarioRepository usuarioRepository;

    @Mock
    private EmpresaRepository empresaRepository;

    private EmpresaService empresaService;

    @BeforeEach
    void setUp() {
        empresaService = new EmpresaService(usuarioRepository, empresaRepository);
    }

    private Usuario usuarioComEmpresa(Long idEmpresa) {
        Empresa empresa = new Empresa("Empresa Antiga");
        ReflectionTestUtils.setField(empresa, "id", idEmpresa);
        return new Usuario(empresa, "Admin", "admin@geitus.dev", "hash", "ADMIN");
    }

    private RepresentanteLegalRequest representanteValido() {
        return new RepresentanteLegalRequest(
                "Maria da Silva", "111.444.777-35", "(11) 98765-4321", "maria@empresa.com");
    }

    private EnderecoRequest enderecoValido() {
        return new EnderecoRequest(
                "01001-000", "Praça da Sé", "100", null, "Sé", "São Paulo", "SP");
    }

    private EmpresaAtualizarRequest requestJuridica() {
        return new EmpresaAtualizarRequest(
                "Mercado do Zé", "(11) 3322-4455", "contato@mercado.com",
                "JURIDICA", "11.222.333/0001-81", "Mercado do Zé LTDA", "1234567890",
                representanteValido(), enderecoValido());
    }

    private EmpresaAtualizarRequest requestFisica() {
        return new EmpresaAtualizarRequest(
                "Barraca da Ana", "(11) 3322-4455", "ana@barraca.com",
                "FISICA", null, null, null,
                representanteValido(), enderecoValido());
    }

    @Test
    void buscarEmpresaDoUsuarioInexistenteDeveFalhar() {
        when(usuarioRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> empresaService.buscarEmpresaDoUsuario(99L))
                .isInstanceOf(CredenciaisInvalidasException.class);
    }

    @Test
    void atualizarComUsuarioInexistenteDeveFalhar() {
        when(usuarioRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> empresaService.atualizarEmpresa(99L, requestJuridica()))
                .isInstanceOf(CredenciaisInvalidasException.class);
    }

    @Test
    void atualizarPessoaJuridicaNormalizaDigitosEatualizaAEmpresaDoUsuario() {
        Usuario usuario = usuarioComEmpresa(7L);
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));
        when(empresaRepository.existsByCnpjAndIdNot("11222333000181", 7L)).thenReturn(false);
        when(empresaRepository.save(any(Empresa.class))).thenAnswer(inv -> inv.getArgument(0));

        EmpresaDetalheResponse resposta = empresaService.atualizarEmpresa(1L, requestJuridica());

        assertThat(resposta.id()).isEqualTo(7L);
        assertThat(resposta.tipoPessoa()).isEqualTo(TipoPessoa.JURIDICA);
        assertThat(resposta.cnpj()).isEqualTo("11222333000181");
        assertThat(resposta.razaoSocial()).isEqualTo("Mercado do Zé LTDA");
        assertThat(resposta.telefone()).isEqualTo("1133224455");
        assertThat(resposta.representanteLegal().cpf()).isEqualTo("11144477735");
        assertThat(resposta.representanteLegal().telefone()).isEqualTo("11987654321");
        assertThat(resposta.endereco().cep()).isEqualTo("01001000");
        assertThat(resposta.endereco().uf()).isEqualTo("SP");
        // Isolamento: a empresa alterada e sempre a do usuario autenticado.
        verify(empresaRepository).save(usuario.getEmpresa());
        assertThat(usuario.getEmpresa().getNome()).isEqualTo("Mercado do Zé");
    }

    @Test
    void atualizarPessoaFisicaNaoGravaCnpjNemRazaoSocial() {
        Usuario usuario = usuarioComEmpresa(7L);
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));
        when(empresaRepository.save(any(Empresa.class))).thenAnswer(inv -> inv.getArgument(0));

        EmpresaDetalheResponse resposta = empresaService.atualizarEmpresa(1L, requestFisica());

        assertThat(resposta.tipoPessoa()).isEqualTo(TipoPessoa.FISICA);
        assertThat(resposta.cnpj()).isNull();
        assertThat(resposta.razaoSocial()).isNull();
        assertThat(resposta.inscricaoEstadual()).isNull();
        // Sem CNPJ, nao consulta unicidade.
        verify(empresaRepository, never()).existsByCnpjAndIdNot(any(), any());
    }

    @Test
    void atualizarComCnpjJaUsadoPorOutraEmpresaDeveConflitar409() {
        Usuario usuario = usuarioComEmpresa(7L);
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));
        when(empresaRepository.existsByCnpjAndIdNot("11222333000181", 7L)).thenReturn(true);

        assertThatThrownBy(() -> empresaService.atualizarEmpresa(1L, requestJuridica()))
                .isInstanceOf(ConflitoDeEmpresaException.class);
        verify(empresaRepository, never()).save(any());
    }

    @Test
    void atualizarJuridicaSemCnpjDeveFalhar400() {
        Usuario usuario = usuarioComEmpresa(7L);
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));

        EmpresaAtualizarRequest semCnpj = new EmpresaAtualizarRequest(
                "Mercado do Zé", "(11) 3322-4455", "contato@mercado.com",
                "JURIDICA", null, "Mercado do Zé LTDA", null,
                representanteValido(), enderecoValido());

        assertThatThrownBy(() -> empresaService.atualizarEmpresa(1L, semCnpj))
                .isInstanceOf(DadosEmpresaInvalidosException.class);
        verify(empresaRepository, never()).save(any());
    }

    @Test
    void atualizarFisicaComCnpjDeveFalhar400() {
        Usuario usuario = usuarioComEmpresa(7L);
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));

        EmpresaAtualizarRequest fisicaComCnpj = new EmpresaAtualizarRequest(
                "Barraca da Ana", "(11) 3322-4455", "ana@barraca.com",
                "FISICA", "11.222.333/0001-81", null, null,
                representanteValido(), enderecoValido());

        assertThatThrownBy(() -> empresaService.atualizarEmpresa(1L, fisicaComCnpj))
                .isInstanceOf(DadosEmpresaInvalidosException.class);
        verify(empresaRepository, never()).save(any());
    }

    @Test
    void atualizarJuridicaComCnpjInvalidoDeveFalhar400() {
        Usuario usuario = usuarioComEmpresa(7L);
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));

        EmpresaAtualizarRequest cnpjInvalido = new EmpresaAtualizarRequest(
                "Mercado do Zé", "(11) 3322-4455", "contato@mercado.com",
                "JURIDICA", "11.222.333/0001-00", "Mercado do Zé LTDA", null,
                representanteValido(), enderecoValido());

        assertThatThrownBy(() -> empresaService.atualizarEmpresa(1L, cnpjInvalido))
                .isInstanceOf(DadosEmpresaInvalidosException.class);
        verify(empresaRepository, never()).save(any());
    }
}
