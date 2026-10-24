package com.geitus.app.iam;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Bootstrap idempotente de um usuario administrador de DESENVOLVIMENTO.
 *
 * <p>Habilitado apenas no perfil {@code dev} E com {@code GEITUS_BOOTSTRAP_DEV_ADMIN=true}:
 * a variavel sozinha, esquecida num ambiente de producao, nao cria nenhum admin.
 * Nenhuma senha fica fixa em codigo: a senha vem da variavel
 * {@code GEITUS_DEV_ADMIN_PASSWORD} e e armazenada apenas como hash BCrypt. Senha
 * com menos de {@value #MINIMO_CARACTERES_DA_SENHA} caracteres ou igual ao marcador
 * do {@code .env.example} (publico) impede a subida; a mensagem nunca mostra o valor.
 *
 * <p>Idempotente: cria a empresa apenas se nao existir pelo nome (ja com as
 * unidades de medida padrao) e o usuario apenas se o e-mail ainda nao existir.
 * Rodar varias vezes nao duplica dados.
 *
 * <p>Nao deve ser usado em producao. Serve para agilizar o desenvolvimento local
 * sem inserir credenciais manualmente no banco.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(prefix = "geitus.bootstrap", name = "dev-admin", havingValue = "true")
public class DevAdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevAdminBootstrap.class);

    private static final String PERFIL_ADMIN = "ADMIN";

    static final int MINIMO_CARACTERES_DA_SENHA = 8;
    /** O marcador de {@code GEITUS_DEV_ADMIN_PASSWORD} no {@code .env.example}: publico, nunca serve como senha. */
    static final String SENHA_DO_ENV_EXAMPLE = "troque-esta-senha";

    // Dados cadastrais fixos da empresa de DESENVOLVIMENTO. Nao sao segredos:
    // servem apenas para o geitus_db local nascer com uma empresa completa e
    // valida (as colunas do cadastro sao NOT NULL). CPF e CNPJ tem digitos
    // verificadores validos (documentos de teste consagrados).
    private static final String DEV_REPRESENTANTE_NOME = "Representante de Desenvolvimento";
    private static final String DEV_REPRESENTANTE_CPF = "11144477735";
    private static final String DEV_REPRESENTANTE_TELEFONE = "11987654321";
    private static final String DEV_REPRESENTANTE_EMAIL = "representante@geitus.dev";
    private static final String DEV_EMPRESA_TELEFONE = "1133224455";
    private static final String DEV_EMPRESA_EMAIL = "contato@geitus.dev";
    private static final TipoPessoa DEV_TIPO_PESSOA = TipoPessoa.JURIDICA;
    private static final String DEV_CNPJ = "11222333000181";
    private static final String DEV_RAZAO_SOCIAL = "Empresa de Desenvolvimento LTDA";
    private static final String DEV_INSCRICAO_ESTADUAL = "1234567890";
    private static final String DEV_ENDERECO_CEP = "01001000";
    private static final String DEV_ENDERECO_LOGRADOURO = "Praça da Sé";
    private static final String DEV_ENDERECO_NUMERO = "S/N";
    private static final String DEV_ENDERECO_BAIRRO = "Sé";
    private static final String DEV_ENDERECO_MUNICIPIO = "São Paulo";
    private static final String DEV_ENDERECO_UF = "SP";

    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final UnidadeMedidaService unidadeMedidaService;

    private final String adminEmail;
    private final String adminPassword;
    private final String adminName;
    private final String companyName;

    public DevAdminBootstrap(
            EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository,
            PasswordEncoder passwordEncoder,
            UnidadeMedidaService unidadeMedidaService,
            @Value("${GEITUS_DEV_ADMIN_EMAIL:}") String adminEmail,
            @Value("${GEITUS_DEV_ADMIN_PASSWORD:}") String adminPassword,
            @Value("${GEITUS_DEV_ADMIN_NAME:Administrador}") String adminName,
            @Value("${GEITUS_DEV_COMPANY_NAME:Empresa de Desenvolvimento}") String companyName) {
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.passwordEncoder = passwordEncoder;
        this.unidadeMedidaService = unidadeMedidaService;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.adminName = adminName;
        this.companyName = companyName;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (adminEmail.isBlank() || adminPassword.isBlank()) {
            log.warn("Bootstrap de admin de desenvolvimento habilitado, mas "
                    + "GEITUS_DEV_ADMIN_EMAIL e/ou GEITUS_DEV_ADMIN_PASSWORD nao foram definidos. "
                    + "Nenhum usuario foi criado.");
            return;
        }
        recusarSenhaFraca();

        if (usuarioRepository.existsByEmail(adminEmail)) {
            log.info("Bootstrap dev-admin: usuario '{}' ja existe. Nada a fazer.", adminEmail);
            return;
        }

        Empresa empresa = empresaRepository.findByNome(companyName)
                .orElseGet(() -> {
                    log.info("Bootstrap dev-admin: criando empresa '{}' com cadastro completo.", companyName);
                    Empresa nova = empresaRepository.save(criarEmpresaDeDesenvolvimento(companyName));
                    // Empresa nova nasce com as unidades padrao (a V6 so cobre as existentes).
                    unidadeMedidaService.criarPadroes(nova);
                    return nova;
                });

        Usuario admin = new Usuario(
                empresa,
                adminName,
                adminEmail,
                passwordEncoder.encode(adminPassword),
                PERFIL_ADMIN);
        usuarioRepository.save(admin);

        log.info("Bootstrap dev-admin: usuario administrador '{}' criado para a empresa '{}'.",
                adminEmail, companyName);
    }

    private void recusarSenhaFraca() {
        if (adminPassword.length() < MINIMO_CARACTERES_DA_SENHA) {
            throw new IllegalStateException("GEITUS_DEV_ADMIN_PASSWORD muito curta: o admin de desenvolvimento "
                    + "exige uma senha com no minimo " + MINIMO_CARACTERES_DA_SENHA + " caracteres.");
        }
        if (adminPassword.equals(SENHA_DO_ENV_EXAMPLE)) {
            throw new IllegalStateException("GEITUS_DEV_ADMIN_PASSWORD com o marcador do .env.example. "
                    + "Defina uma senha propria no .env.");
        }
    }

    /**
     * Monta a empresa de desenvolvimento ja com o cadastro completo (representante
     * legal, dados da empresa e endereco), necessario porque as colunas do
     * cadastro sao NOT NULL a partir da migration V3.
     */
    private Empresa criarEmpresaDeDesenvolvimento(String nomeFantasia) {
        Empresa empresa = new Empresa(nomeFantasia);
        RepresentanteLegal representante = new RepresentanteLegal(
                DEV_REPRESENTANTE_NOME,
                DEV_REPRESENTANTE_CPF,
                DEV_REPRESENTANTE_TELEFONE,
                DEV_REPRESENTANTE_EMAIL);
        Endereco endereco = new Endereco(
                DEV_ENDERECO_CEP,
                DEV_ENDERECO_LOGRADOURO,
                DEV_ENDERECO_NUMERO,
                null,
                DEV_ENDERECO_BAIRRO,
                DEV_ENDERECO_MUNICIPIO,
                DEV_ENDERECO_UF);
        empresa.atualizarCadastro(
                nomeFantasia,
                DEV_EMPRESA_TELEFONE,
                DEV_EMPRESA_EMAIL,
                DEV_TIPO_PESSOA,
                DEV_CNPJ,
                DEV_RAZAO_SOCIAL,
                DEV_INSCRICAO_ESTADUAL,
                representante,
                endereco);
        return empresa;
    }
}
