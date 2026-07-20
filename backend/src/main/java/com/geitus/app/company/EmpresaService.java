package com.geitus.app.company;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.geitus.app.company.dto.EmpresaAtualizarRequest;
import com.geitus.app.company.dto.EmpresaDetalheResponse;
import com.geitus.app.company.dto.EnderecoRequest;
import com.geitus.app.company.dto.PessoaCoerenteValidator;
import com.geitus.app.company.dto.RepresentanteLegalRequest;
import com.geitus.app.company.validation.Documentos;
import com.geitus.app.company.validation.Telefones;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Regras de negocio do cadastro da empresa do usuario autenticado.
 *
 * <p>A empresa manipulada aqui e SEMPRE derivada do usuario autenticado (via
 * {@code idUsuario}, extraido do JWT) — nunca de um identificador de empresa
 * recebido como parametro (DEC-016).
 *
 * <p>Alem da Bean Validation nos DTOs, o service revalida as regras criticas
 * (coerencia PJ/PF, digitos de CPF/CNPJ/telefone, formato de CEP) como defesa em
 * profundidade e normaliza CPF/CNPJ/telefones/CEP para somente digitos antes de
 * persistir. A unicidade do CNPJ e checada antes do save (409 amigavel).
 */
@Service
public class EmpresaService {

    private static final int TAMANHO_CEP = 8;
    private static final String SEM_NUMERO = "S/N";

    private final UsuarioRepository usuarioRepository;
    private final EmpresaRepository empresaRepository;

    public EmpresaService(UsuarioRepository usuarioRepository, EmpresaRepository empresaRepository) {
        this.usuarioRepository = usuarioRepository;
        this.empresaRepository = empresaRepository;
    }

    @Transactional(readOnly = true)
    public EmpresaDetalheResponse buscarEmpresaDoUsuario(Long idUsuario) {
        Usuario usuario = buscarUsuarioAtivo(idUsuario);
        return EmpresaDetalheResponse.de(usuario.getEmpresa());
    }

    @Transactional
    public EmpresaDetalheResponse atualizarEmpresa(Long idUsuario, EmpresaAtualizarRequest request) {
        Usuario usuario = buscarUsuarioAtivo(idUsuario);
        Empresa empresa = usuario.getEmpresa();

        TipoPessoa tipoPessoa = resolverTipoPessoa(request.tipoPessoa());

        // Valores informados (crus), usados na coerencia: FISICA com CNPJ e
        // JURIDICA sem CNPJ/razao sao rejeitados (400), nao silenciosamente ajustados.
        String cnpjInformado = digitosOuNulo(request.cnpj());
        String razaoInformada = textoOuNulo(request.razaoSocial());
        validarCoerencia(tipoPessoa, cnpjInformado, razaoInformada);

        // A partir daqui, coerentes: JURIDICA tem cnpj+razao; FISICA nao tem cnpj.
        boolean juridica = tipoPessoa == TipoPessoa.JURIDICA;
        String cnpj = juridica ? cnpjInformado : null;
        String razaoSocial = juridica ? razaoInformada : null;
        String inscricaoEstadual = juridica ? textoOuNulo(request.inscricaoEstadual()) : null;

        validarCnpj(tipoPessoa, cnpj);
        garantirCnpjDisponivel(empresa.getId(), cnpj);

        RepresentanteLegal representante = montarRepresentante(request.representanteLegal());
        Endereco endereco = montarEndereco(request.endereco());

        empresa.atualizarCadastro(
                request.nome().trim(),
                telefoneNormalizado(request.telefone(), "Telefone da empresa inválido."),
                request.email().trim(),
                tipoPessoa,
                cnpj,
                razaoSocial,
                inscricaoEstadual,
                representante,
                endereco);

        return EmpresaDetalheResponse.de(empresaRepository.save(empresa));
    }

    private RepresentanteLegal montarRepresentante(RepresentanteLegalRequest request) {
        String cpf = Documentos.somenteDigitos(request.cpf());
        if (!Documentos.cpfValido(cpf)) {
            throw new DadosEmpresaInvalidosException("CPF do representante inválido.");
        }
        return new RepresentanteLegal(
                request.nome().trim(),
                cpf,
                telefoneNormalizado(request.telefone(), "Telefone do representante inválido."),
                request.email().trim());
    }

    private Endereco montarEndereco(EnderecoRequest request) {
        String cep = Documentos.somenteDigitos(request.cep());
        if (cep == null || cep.length() != TAMANHO_CEP) {
            throw new DadosEmpresaInvalidosException("CEP deve ter 8 dígitos.");
        }
        return new Endereco(
                cep,
                request.logradouro().trim(),
                numeroNormalizado(request.numero()),
                textoOuNulo(request.complemento()),
                request.bairro().trim(),
                request.municipio().trim(),
                request.uf().trim().toUpperCase());
    }

    /**
     * Normaliza o numero do endereco: "sem numero" (em qualquer caixa) e gravado
     * como {@code "S/N"} maiusculo (spec); numeros comuns permanecem como estao.
     */
    private String numeroNormalizado(String valor) {
        String numero = valor.trim();
        return numero.equalsIgnoreCase(SEM_NUMERO) ? SEM_NUMERO : numero;
    }

    private TipoPessoa resolverTipoPessoa(String valor) {
        try {
            return TipoPessoa.fromString(valor);
        } catch (IllegalArgumentException ex) {
            throw new DadosEmpresaInvalidosException(ex.getMessage());
        }
    }

    private void validarCoerencia(TipoPessoa tipoPessoa, String cnpj, String razaoSocial) {
        if (!PessoaCoerenteValidator.coerente(tipoPessoa.name(), cnpj, razaoSocial)) {
            throw new DadosEmpresaInvalidosException(tipoPessoa == TipoPessoa.JURIDICA
                    ? "Empresa jurídica exige CNPJ e razão social."
                    : "Empresa física não pode ter CNPJ.");
        }
    }

    private void validarCnpj(TipoPessoa tipoPessoa, String cnpj) {
        if (tipoPessoa == TipoPessoa.JURIDICA && !Documentos.cnpjValido(cnpj)) {
            throw new DadosEmpresaInvalidosException("CNPJ inválido.");
        }
    }

    private void garantirCnpjDisponivel(Long empresaId, String cnpj) {
        if (cnpj != null && empresaRepository.existsByCnpjAndIdNot(cnpj, empresaId)) {
            throw new ConflitoDeEmpresaException("Já existe uma empresa com este CNPJ.");
        }
    }

    private String telefoneNormalizado(String valor, String mensagemErro) {
        if (!Telefones.valido(valor)) {
            throw new DadosEmpresaInvalidosException(mensagemErro);
        }
        return Telefones.somenteDigitos(valor);
    }

    private String textoOuNulo(String valor) {
        return StringUtils.hasText(valor) ? valor.trim() : null;
    }

    /**
     * Extrai os digitos de {@code valor}; retorna {@code null} quando nao houver
     * nenhum digito (evita persistir CNPJ como string vazia).
     */
    private String digitosOuNulo(String valor) {
        String digitos = Documentos.somenteDigitos(valor);
        return StringUtils.hasText(digitos) ? digitos : null;
    }

    private Usuario buscarUsuarioAtivo(Long idUsuario) {
        return usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
    }
}
