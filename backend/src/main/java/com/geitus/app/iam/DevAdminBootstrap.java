package com.geitus.app.iam;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Bootstrap idempotente de um usuario administrador de DESENVOLVIMENTO.
 *
 * <p>Habilitado apenas quando {@code GEITUS_BOOTSTRAP_DEV_ADMIN=true}. Nenhuma
 * senha fica fixa em codigo: a senha vem da variavel
 * {@code GEITUS_DEV_ADMIN_PASSWORD} e e armazenada apenas como hash BCrypt.
 *
 * <p>Idempotente: cria a empresa apenas se nao existir pelo nome e o usuario
 * apenas se o e-mail ainda nao existir. Rodar varias vezes nao duplica dados.
 *
 * <p>Nao deve ser usado em producao. Serve para agilizar o desenvolvimento local
 * sem inserir credenciais manualmente no banco.
 */
@Component
@ConditionalOnProperty(prefix = "geitus.bootstrap", name = "dev-admin", havingValue = "true")
public class DevAdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevAdminBootstrap.class);

    private static final String PERFIL_ADMIN = "ADMIN";

    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;

    private final String adminEmail;
    private final String adminPassword;
    private final String adminName;
    private final String companyName;

    public DevAdminBootstrap(
            EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository,
            PasswordEncoder passwordEncoder,
            @Value("${GEITUS_DEV_ADMIN_EMAIL:}") String adminEmail,
            @Value("${GEITUS_DEV_ADMIN_PASSWORD:}") String adminPassword,
            @Value("${GEITUS_DEV_ADMIN_NAME:Administrador}") String adminName,
            @Value("${GEITUS_DEV_COMPANY_NAME:Empresa de Desenvolvimento}") String companyName) {
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.passwordEncoder = passwordEncoder;
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

        if (usuarioRepository.existsByEmail(adminEmail)) {
            log.info("Bootstrap dev-admin: usuario '{}' ja existe. Nada a fazer.", adminEmail);
            return;
        }

        Empresa empresa = empresaRepository.findByNome(companyName)
                .orElseGet(() -> {
                    log.info("Bootstrap dev-admin: criando empresa '{}'.", companyName);
                    return empresaRepository.save(new Empresa(companyName));
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
}
