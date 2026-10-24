package com.geitus.app.cashier;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.boot.test.context.TestComponent;
import org.springframework.jdbc.core.JdbcTemplate;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Dados dos testes de integracao do caixa: empresas novas (sem ponto, como as
 * cadastradas depois da V16) com um ADMIN e uma OPERADORA, tokens e atalhos
 * JDBC para montar pontos e sessoes. Nomes unicos a cada chamada.
 * Importado explicitamente ({@code @Import}): o {@code @TestComponent} fica
 * fora do component scan.
 */
@TestComponent
public class CenarioDeCaixa {

    public static final String NOME_DO_ADMIN = "Admin Geral";
    public static final String NOME_DA_OPERADORA = "Ana Souza";

    private static final AtomicInteger SEQUENCIA = new AtomicInteger();

    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final JdbcTemplate jdbcTemplate;
    private final JwtService jwtService;

    CenarioDeCaixa(EmpresaRepository empresaRepository, UsuarioRepository usuarioRepository,
            JdbcTemplate jdbcTemplate, JwtService jwtService) {
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.jwtService = jwtService;
    }

    /** Empresa com o id interno, o ADMIN ("Admin Geral") e a OPERADORA ("Ana Souza"). */
    public record EmpresaDeCaixa(Long id, Long admin, Long operadora) {
    }

    public EmpresaDeCaixa novaEmpresa() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Caixa " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(nome, "1133224455", "contato" + sufixo + "@caixa.test", TipoPessoa.FISICA, null,
                null, null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@caixa.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        Empresa gravada = empresaRepository.saveAndFlush(empresa);
        return new EmpresaDeCaixa(gravada.getId(), novoUsuario(gravada, NOME_DO_ADMIN, "ADMIN"),
                novoUsuario(gravada, NOME_DA_OPERADORA, "OPERADOR"));
    }

    public Long novoUsuario(EmpresaDeCaixa empresa, String nome, String perfil) {
        return novoUsuario(empresaRepository.findById(empresa.id()).orElseThrow(), nome, perfil);
    }

    private Long novoUsuario(Empresa empresa, String nome, String perfil) {
        Usuario usuario = new Usuario(empresa, nome, "usuario" + SEQUENCIA.incrementAndGet() + "@caixa.test",
                "hash-irrelevante-no-teste", perfil);
        return usuarioRepository.saveAndFlush(usuario).getId();
    }

    /** Troca o perfil no banco, sem mexer nos tokens ja emitidos (o token antigo continua dizendo ADMIN). */
    public void rebaixarParaOperador(Long usuarioId) {
        jdbcTemplate.update("UPDATE usuario SET perfil = 'OPERADOR' WHERE id = ?", usuarioId);
    }

    public void inativarUsuario(Long usuarioId) {
        jdbcTemplate.update("UPDATE usuario SET ativo = false WHERE id = ?", usuarioId);
    }

    /** Cabecalho {@code Authorization} com o JWT do usuario. */
    public String token(Long usuarioId) {
        return "Bearer " + jwtService.gerarToken(usuarioRepository.findById(usuarioId).orElseThrow());
    }

    /** Ponto ativo gravado direto no banco; devolve o UUID publico. */
    public UUID novoPonto(EmpresaDeCaixa empresa, String nome) {
        UUID uuid = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO pontos_caixa (uuid, empresa_id, nome, criado_em) VALUES (?, ?, ?, now())",
                uuid, empresa.id(), nome);
        return uuid;
    }

    public void inativarPonto(UUID ponto) {
        jdbcTemplate.update("UPDATE pontos_caixa SET ativo = false WHERE uuid = ?", ponto);
    }

    /**
     * Sessao ABERTA gravada direto no banco, com o movimento de abertura (o
     * esperado em dinheiro e o fundo, como a V17 confere ao contar); devolve o
     * UUID publico.
     */
    public UUID sessaoAbertaPorJdbc(EmpresaDeCaixa empresa, UUID ponto, Long usuario, String fundo,
            OffsetDateTime abertaEm) {
        UUID uuid = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status, aberta_por, aberta_em, fundo_troco)
                VALUES (?, ?, (SELECT id FROM pontos_caixa WHERE uuid = ?), 'ABERTA', ?, ?, ?)
                """, uuid, empresa.id(), ponto, usuario, abertaEm, new BigDecimal(fundo));
        jdbcTemplate.update("""
                INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor, usuario_id,
                                              chave_idempotencia, criado_em)
                VALUES (gen_random_uuid(), ?, (SELECT id FROM sessoes_caixa WHERE uuid = ?), 'ABERTURA', 'DINHEIRO', ?,
                        ?, gen_random_uuid(), ?)
                """, empresa.id(), uuid, new BigDecimal(fundo), usuario, abertaEm);
        return uuid;
    }

    /** Conta com falta de R$ 1,00 no modo cego, direto no banco: a sessao fica EM_CONFERENCIA. */
    public void emConferenciaPorJdbc(UUID sessao, Long usuario) {
        jdbcTemplate.update("""
                UPDATE sessoes_caixa SET status = 'EM_CONFERENCIA', fechamento_cego = true,
                       valor_esperado = fundo_troco, valor_contado = fundo_troco - 1, diferenca = -1,
                       contada_por = ?, contada_em = now()
                WHERE uuid = ?
                """, usuario, sessao);
    }

    /** Fecha sem diferenca, direto no banco, uma sessao aberta por JDBC. */
    public void fecharPorJdbc(UUID sessao, Long usuario) {
        jdbcTemplate.update("""
                UPDATE sessoes_caixa SET status = 'FECHADA', fechamento_cego = true, valor_esperado = fundo_troco,
                       valor_contado = fundo_troco, diferenca = 0, contada_por = ?, contada_em = now(),
                       fechada_por = ?, fechada_em = now()
                WHERE uuid = ?
                """, usuario, usuario, sessao);
    }

    public long contarPontos(EmpresaDeCaixa empresa) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM pontos_caixa WHERE empresa_id = ?", Long.class,
                empresa.id());
    }
}
