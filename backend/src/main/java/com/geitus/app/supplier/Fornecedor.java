package com.geitus.app.supplier;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.geitus.app.company.Empresa;
import com.geitus.app.shared.busca.TextoDeBusca;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Fornecedor da empresa (docs/modules/fornecedores-e-marcas.md): os dados
 * do emitente da NF-e de compra, os representantes de venda e as marcas que
 * vende. Os produtos que vende sao a ligacao {@code produto_fornecedores}, que
 * pertence ao catalogo.
 *
 * <p>Pertence a uma empresa (DEC-016); empresa, {@code uuid} (DEC-019) e
 * {@code numero} (sequencial por empresa, pelo {@code Numerador}) sao
 * imutaveis. Os dados so mudam por {@link #atualizarDados},
 * {@link #substituirRepresentantes} e {@link #substituirMarcas}, depois das
 * validacoes do {@code FornecedorService}.
 *
 * <p>{@code buscaNormalizada} (razao social, nome fantasia e nomes dos
 * representantes) e {@code nomeNormalizado} sao derivadas e recalculadas a
 * cada alteracao, com o {@link TextoDeBusca}, para a busca sem acento e a
 * ordem por nome da listagem.
 *
 * <p>Nao deve ser exposta na API.
 */
@Entity
@Table(name = "fornecedores")
public class Fornecedor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id", nullable = false, updatable = false)
    private Empresa empresa;

    @Column(nullable = false, updatable = false)
    private Long numero;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_pessoa", nullable = false, length = 2)
    private TipoPessoaFornecedor tipoPessoa;

    @Column(length = 14)
    private String documento;

    @Column(name = "razao_social", nullable = false, length = 180)
    private String razaoSocial;

    @Column(name = "nome_fantasia", length = 180)
    private String nomeFantasia;

    @Column(name = "inscricao_estadual", length = 20)
    private String inscricaoEstadual;

    @Column(name = "endereco_cep", length = 8)
    private String cep;

    @Column(name = "endereco_logradouro", length = 180)
    private String logradouro;

    @Column(name = "endereco_numero", length = 20)
    private String numeroDoEndereco;

    @Column(name = "endereco_complemento", length = 120)
    private String complemento;

    @Column(name = "endereco_bairro", length = 120)
    private String bairro;

    @Column(name = "endereco_municipio", length = 120)
    private String municipio;

    @Column(name = "endereco_uf", length = 2)
    private String uf;

    @Column(length = 20)
    private String telefone;

    @Column(length = 180)
    private String email;

    @Column(length = 500)
    private String observacoes;

    @Column(nullable = false)
    private boolean ativo = true;

    @OneToMany(mappedBy = "fornecedor", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("ordem")
    private List<RepresentanteDeVenda> representantes = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "fornecedor_marcas", joinColumns = @JoinColumn(name = "fornecedor_id"))
    private Set<MarcaDoFornecedor> marcas = new LinkedHashSet<>();

    @Column(name = "busca_normalizada", nullable = false)
    private String buscaNormalizada;

    @Column(name = "nome_normalizado", nullable = false)
    private String nomeNormalizado;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em")
    private LocalDateTime atualizadoEm;

    protected Fornecedor() {
        // Construtor exigido pelo JPA.
    }

    /** Cria um fornecedor ativo com o {@code numero} reservado pelo {@code Numerador} na mesma transacao. */
    public Fornecedor(Empresa empresa, long numero, DadosFornecedor dados) {
        this.uuid = UUID.randomUUID();
        this.empresa = empresa;
        this.numero = numero;
        this.ativo = true;
        atualizarDados(dados);
    }

    @PrePersist
    void aoCriar() {
        this.criadoEm = LocalDateTime.now();
    }

    @PreUpdate
    void aoAtualizar() {
        this.atualizadoEm = LocalDateTime.now();
    }

    /** Dados do cadastro, ja normalizados e validados pelo service. */
    public void atualizarDados(DadosFornecedor dados) {
        EnderecoDoFornecedor endereco = Objects.requireNonNullElse(dados.endereco(), EnderecoDoFornecedor.VAZIO);
        this.tipoPessoa = dados.tipoPessoa();
        this.documento = dados.documento();
        this.razaoSocial = dados.razaoSocial();
        this.nomeFantasia = dados.nomeFantasia();
        this.inscricaoEstadual = dados.inscricaoEstadual();
        this.cep = endereco.cep();
        this.logradouro = endereco.logradouro();
        this.numeroDoEndereco = endereco.numero();
        this.complemento = endereco.complemento();
        this.bairro = endereco.bairro();
        this.municipio = endereco.municipio();
        this.uf = endereco.uf();
        this.telefone = dados.telefone();
        this.email = dados.email();
        this.observacoes = dados.observacoes();
        recalcularTextosDeBusca();
    }

    /**
     * Lista completa de representantes, na ordem (spec de Fornecedores e marcas): {@code id}
     * presente mantem o representante (o service ja conferiu que e deste
     * fornecedor), sem {@code id} cria, e o ausente sai ({@code orphanRemoval}).
     */
    public void substituirRepresentantes(List<DadosRepresentante> informados) {
        List<String> antes = retratoDosRepresentantes();
        Map<UUID, RepresentanteDeVenda> atuais = representantes.stream()
                .collect(Collectors.toMap(RepresentanteDeVenda::getUuid, Function.identity()));
        List<RepresentanteDeVenda> finais = new ArrayList<>();
        for (int ordem = 0; ordem < informados.size(); ordem++) {
            DadosRepresentante dados = informados.get(ordem);
            RepresentanteDeVenda representante = dados.id() == null ? null : atuais.get(dados.id());
            if (representante == null) {
                finais.add(new RepresentanteDeVenda(this, dados, ordem));
            } else {
                representante.atualizar(dados, ordem);
                finais.add(representante);
            }
        }
        representantes.clear();
        representantes.addAll(finais);
        recalcularTextosDeBusca();
        carimbarSeMudou(!antes.equals(retratoDosRepresentantes()));
    }

    /** Marcas que vende (spec de Fornecedores e marcas), ids internos ja conferidos na empresa e sem repeticao. */
    public void substituirMarcas(Collection<Long> marcaIds) {
        Set<MarcaDoFornecedor> finais = marcaIds.stream()
                .map(marcaId -> new MarcaDoFornecedor(getEmpresaId(), marcaId))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        boolean mudou = !finais.equals(marcas);
        marcas.retainAll(finais);
        marcas.addAll(finais);
        carimbarSeMudou(mudou);
    }

    public boolean temRepresentante(UUID representanteId) {
        return representantes.stream().anyMatch(representante -> representante.getUuid().equals(representanteId));
    }

    public void inativar() {
        this.ativo = false;
    }

    public void ativar() {
        this.ativo = true;
    }

    /**
     * Representantes e marcas ficam em outras tabelas: muda-las nao deixaria o
     * fornecedor "sujo". Num fornecedor ja gravado, carimba o
     * {@code atualizadoEm} (o que dispara o UPDATE), como o produto faz.
     */
    private void carimbarSeMudou(boolean mudou) {
        if (mudou && id != null) {
            this.atualizadoEm = LocalDateTime.now();
        }
    }

    private List<String> retratoDosRepresentantes() {
        return representantes.stream()
                .map(representante -> representante.getUuid() + "|" + representante.getNome() + "|"
                        + representante.getTelefone() + "|" + representante.getEmail())
                .toList();
    }

    private void recalcularTextosDeBusca() {
        this.nomeNormalizado = TextoDeBusca.normalizar(razaoSocial);
        Stream<String> nomesDosRepresentantes = representantes.stream().map(RepresentanteDeVenda::getNome);
        this.buscaNormalizada = TextoDeBusca.textoDosCampos(
                Stream.concat(Stream.of(razaoSocial, nomeFantasia), nomesDosRepresentantes).toList());
    }

    public Long getId() {
        return id;
    }

    public UUID getUuid() {
        return uuid;
    }

    public Long getEmpresaId() {
        return empresa == null ? null : empresa.getId();
    }

    public Long getNumero() {
        return numero;
    }

    public TipoPessoaFornecedor getTipoPessoa() {
        return tipoPessoa;
    }

    /** CNPJ (PJ) ou CPF (PF) so com digitos, ou {@code null}. */
    public String getDocumento() {
        return documento;
    }

    public String getRazaoSocial() {
        return razaoSocial;
    }

    public String getNomeFantasia() {
        return nomeFantasia;
    }

    /** Digitos ou {@code ISENTO}; so no PJ. */
    public String getInscricaoEstadual() {
        return inscricaoEstadual;
    }

    public EnderecoDoFornecedor getEndereco() {
        return new EnderecoDoFornecedor(cep, logradouro, numeroDoEndereco, complemento, bairro, municipio, uf);
    }

    /** Telefone so com digitos, ou {@code null}. */
    public String getTelefone() {
        return telefone;
    }

    public String getEmail() {
        return email;
    }

    public String getObservacoes() {
        return observacoes;
    }

    public boolean isAtivo() {
        return ativo;
    }

    /** Representantes na ordem da tela (somente leitura). */
    public List<RepresentanteDeVenda> getRepresentantes() {
        return Collections.unmodifiableList(representantes);
    }

    /** Ids internos das marcas que vende. */
    public Set<Long> getMarcaIds() {
        return marcas.stream().map(MarcaDoFornecedor::getMarcaId).collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** Texto pesquisavel normalizado; uso interno da busca, nao sai na API. */
    public String getBuscaNormalizada() {
        return buscaNormalizada;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }

    public LocalDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
